import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { toast } from "sonner";
import { isIOS, supportsIOSNotifications } from "@/lib/ios-detection";

interface SessionWithClient {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  clients: { name: string } | null;
}

export interface PendingCompletion {
  sessionId: string;
  clientName: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [pendingCompletion, setPendingCompletion] = useState<PendingCompletion | null>(null);

  const isiOS = isIOS();

  // Register SW
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    const setup = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/service-worker.js");
        swRegistrationRef.current = reg;
      } catch (err) {
        console.error("SW registration failed:", err);
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
        await updateSessionStatus(sessionId, status);
      }
      // iOS: SW sends OPEN_COMPLETION_MODAL
      if (event.data?.type === "OPEN_COMPLETION_MODAL") {
        const { sessionId, clientName } = event.data;
        setPendingCompletion({ sessionId, clientName });
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [qc]);

  const updateSessionStatus = useCallback(async (sessionId: string, status: "completed" | "no_show") => {
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
  }, [qc]);

  const handleCompletionConfirm = useCallback(async (sessionId: string, status: "completed" | "no_show") => {
    await updateSessionStatus(sessionId, status);
    setPendingCompletion(null);
  }, [updateSessionStatus]);

  const dismissCompletion = useCallback(() => {
    setPendingCompletion(null);
  }, []);

  const scheduleNotifications = useCallback(
    (sessions: SessionWithClient[]) => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      if (Notification.permission !== "granted") return;

      const now = Date.now();
      const today = format(new Date(), "yyyy-MM-dd");

      sessions.forEach((session) => {
        if (session.status !== "scheduled" || session.date !== today) return;

        const clientName = (session.clients as any)?.name ?? "Cliente";
        const startTimeStr = session.start_time.slice(0, 5);

        const [sh, sm] = startTimeStr.split(":").map(Number);
        const startMs = new Date().setHours(sh, sm, 0, 0);

        // Notification 1 — 20 min before start
        const reminderMs = startMs - 20 * 60 * 1000;
        if (reminderMs > now) {
          const timer = setTimeout(() => {
            swRegistrationRef.current?.showNotification(
              "⏰ Aula em 20 minutos!",
              {
                body: `Sua aula com ${clientName} começa às ${startTimeStr}. Prepare-se!`,
                icon: "/icon-192x192.png",
                tag: `aula-${session.id}-reminder`,
              }
            );
          }, reminderMs - now);
          timersRef.current.push(timer);
        }

        // Notification 2 — At start time
        if (startMs > now) {
          const timer = setTimeout(() => {
            if (isiOS) {
              // iOS: simple notification, completion modal opens on click
              swRegistrationRef.current?.showNotification(
                "✅ A aula foi realizada?",
                {
                  body: `Aula com ${clientName} — toque para responder`,
                  icon: "/icon-192x192.png",
                  tag: `aula-${session.id}`,
                  data: {
                    type: "completion_ios",
                    sessionId: session.id,
                    clientName,
                  },
                }
              );
            } else {
              // Non-iOS: action buttons in notification
              const options: NotificationOptions & { actions?: Array<{ action: string; title: string }>; data?: any; requireInteraction?: boolean } = {
                body: `Aula com ${clientName} — foi concluída?`,
                icon: "/icon-192x192.png",
                tag: `aula-${session.id}`,
                actions: [
                  { action: "sim", title: "✅ Sim" },
                  { action: "nao", title: "❌ Não" },
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
            }
          }, startMs - now);
          timersRef.current.push(timer);
        }
      });
    },
    [isiOS]
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

  return { pendingCompletion, handleCompletionConfirm, dismissCompletion };
}
