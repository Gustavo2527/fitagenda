import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { toast } from "sonner";

interface SessionWithClient {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  clients: { name: string } | null;
}

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Register SW and request permission
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    const setup = async () => {
      // Register service worker
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        swRegistrationRef.current = reg;
      } catch (err) {
        console.error("SW registration failed:", err);
      }

      // Request permission
      if (Notification.permission === "default") {
        const result = await Notification.requestPermission();
        if (result === "granted") {
          toast.success("Notificações ativadas!");
        }
      }
    };

    setup();
  }, []);

  // Listen for SW messages to update session status
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handler = async (event: MessageEvent) => {
      if (event.data?.type === "UPDATE_SESSION_STATUS") {
        const { sessionId, status } = event.data;
        const { error } = await supabase
          .from("sessions")
          .update({ status: status as any })
          .eq("id", sessionId);

        if (!error) {
          qc.invalidateQueries({ queryKey: ["sessions-week"] });
          qc.invalidateQueries({ queryKey: ["sessions-today"] });
          toast.success(
            status === "completed"
              ? "Aula marcada como concluída ✅"
              : "Aula marcada como não realizada ❌"
          );
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [qc]);

  const scheduleNotifications = useCallback(
    (sessions: SessionWithClient[]) => {
      // Clear previous timers
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      if (Notification.permission !== "granted") return;

      const now = Date.now();
      const today = format(new Date(), "yyyy-MM-dd");

      sessions.forEach((session) => {
        if (session.status !== "scheduled" || session.date !== today) return;

        const clientName = (session.clients as any)?.name ?? "Cliente";
        const startTimeStr = session.start_time.slice(0, 5);
        const endTimeStr = session.end_time.slice(0, 5);

        // Parse times
        const [sh, sm] = startTimeStr.split(":").map(Number);
        const startMs = new Date().setHours(sh, sm, 0, 0);
        const [eh, em] = endTimeStr.split(":").map(Number);
        const endMs = new Date().setHours(eh, em, 0, 0);

        // 20 min reminder
        const reminderMs = startMs - 20 * 60 * 1000;
        if (reminderMs > now) {
          const timer = setTimeout(() => {
            swRegistrationRef.current?.showNotification(
              "⏰ Aula em 20 minutos!",
              {
                body: `Sua aula com ${clientName} começa às ${startTimeStr}. Prepare-se!`,
                icon: "/placeholder.svg",
                tag: `reminder-${session.id}`,
              }
            );
          }, reminderMs - now);
          timersRef.current.push(timer);
        }

        // End-of-session completion notification
        const completionMs = endMs > startMs ? endMs : startMs;
        if (completionMs > now) {
          const timer = setTimeout(() => {
            const options: NotificationOptions & { actions?: Array<{ action: string; title: string }>; data?: any; requireInteraction?: boolean } = {
              body: `Aula com ${clientName} — marque como concluída`,
              icon: "/placeholder.svg",
              tag: `completion-${session.id}`,
              actions: [
                { action: "yes", title: "✅ Sim" },
                { action: "no", title: "❌ Não" },
              ],
              data: {
                type: "completion",
                sessionId: session.id,
              },
              requireInteraction: true,
            };
            swRegistrationRef.current?.showNotification(
              "✅ A aula foi realizada?",
              options as NotificationOptions
            );
          }, completionMs - now);
          timersRef.current.push(timer);
        }
      });
    },
    []
  );

  // Fetch today's sessions and schedule
  useEffect(() => {
    if (!user) return;

    const today = format(new Date(), "yyyy-MM-dd");

    const fetchAndSchedule = async () => {
      const { data } = await supabase
        .from("sessions")
        .select("id, date, start_time, end_time, status, clients(name)")
        .eq("date", today)
        .eq("status", "scheduled");

      if (data) {
        scheduleNotifications(data as SessionWithClient[]);
      }
    };

    fetchAndSchedule();

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [user, scheduleNotifications]);
}
