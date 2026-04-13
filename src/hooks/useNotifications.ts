import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { toast } from "sonner";
import { isIOS } from "@/lib/ios-detection";

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

  // Get SW registration (registered in main.tsx)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.ready.then((reg) => {
      swRegistrationRef.current = reg;
    });
  }, []);

  // Listen for SW messages to update session status
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handler = async (event: MessageEvent) => {
      if (event.data?.type === "UPDATE_SESSION_STATUS") {
        const { sessionId, status } = event.data;
        await updateSessionStatus(sessionId, status);
      }
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
      // Clear old timers
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      console.log("[Notificações] Iniciando agendamento de notificações...");
      console.log(`[Notificações] Permissão: ${typeof Notification !== "undefined" ? Notification.permission : "N/A"}`);

      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        console.log("[Notificações] Permissão não concedida, abortando.");
        return;
      }

      const now = Date.now();
      const today = format(new Date(), "yyyy-MM-dd");

      sessions.forEach((session) => {
        const clientName = (session.clients as any)?.name ?? "Cliente";

        if (session.status !== "scheduled") {
          console.log(`[Notificações] ${clientName} - ignorada (status: ${session.status})`);
          return;
        }
        if (session.date !== today) {
          console.log(`[Notificações] ${clientName} - ignorada (data: ${session.date}, hoje: ${today})`);
          return;
        }

        const startTimeStr = session.start_time.slice(0, 5);
        const [sh, sm] = startTimeStr.split(":").map(Number);

        // Use local timezone explicitly: new Date(year, month, day, hour, minute)
        const nowDate = new Date();
        const startDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), sh, sm, 0, 0);
        const startMs = startDate.getTime();

        console.log(`[Notificações] ${clientName} | Horário: ${startTimeStr} | startMs: ${startMs} | now: ${now}`);

        // Notification 1 — 20 min before start
        const reminderMs = startMs - 20 * 60 * 1000;
        const msUntilReminder = reminderMs - now;

        if (msUntilReminder > 0) {
          console.log(`[Notificações] ${clientName} | ⏰ Lembrete em ${Math.round(msUntilReminder / 1000)}s (${Math.round(msUntilReminder / 60000)} min)`);
          const timer = setTimeout(() => {
            console.log(`[Notificações] ${clientName} | Disparando lembrete de 20 min`);
            swRegistrationRef.current?.showNotification(
              "⏰ Aula em 20 minutos!",
              {
                body: `Sua aula com ${clientName} começa às ${startTimeStr}. Prepare-se!`,
                icon: "/icon-192x192.png",
                tag: `aula-${session.id}-reminder`,
              }
            );
          }, msUntilReminder);
          timersRef.current.push(timer);
        } else {
          console.log(`[Notificações] ${clientName} | ⏰ Lembrete IGNORADO (já passou por ${Math.round(-msUntilReminder / 1000)}s)`);
        }

        // Notification 2 — At start time
        const msUntilStart = startMs - now;
        if (msUntilStart > 0) {
          console.log(`[Notificações] ${clientName} | ✅ Confirmação em ${Math.round(msUntilStart / 1000)}s (${Math.round(msUntilStart / 60000)} min)`);
          const timer = setTimeout(() => {
            console.log(`[Notificações] ${clientName} | Disparando notificação de confirmação`);
            if (isiOS) {
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
          }, msUntilStart);
          timersRef.current.push(timer);
        } else {
          console.log(`[Notificações] ${clientName} | ✅ Confirmação IGNORADA (já passou por ${Math.round(-msUntilStart / 1000)}s)`);
        }
      });

      console.log(`[Notificações] Total de timers agendados: ${timersRef.current.length}`);
    },
    [isiOS]
  );

  const fetchAndSchedule = useCallback(async () => {
    if (!user) return;

    const today = format(new Date(), "yyyy-MM-dd");
    console.log(`[Notificações] Buscando aulas do dia ${today}...`);

    const { data } = await supabase
      .from("sessions")
      .select("id, date, start_time, end_time, status, clients(name)")
      .eq("date", today)
      .eq("status", "scheduled");

    if (data) {
      console.log(`[Notificações] ${data.length} aula(s) encontrada(s)`);
      scheduleNotifications(data as SessionWithClient[]);
    }
  }, [user, scheduleNotifications]);

  // Fetch today's sessions and schedule on mount
  useEffect(() => {
    if (!user) return;

    fetchAndSchedule();

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [user, fetchAndSchedule]);

  // Expose rescheduleToday so other components can trigger re-scheduling
  const rescheduleToday = useCallback(() => {
    console.log("[Notificações] Reagendando timers do dia...");
    fetchAndSchedule();
  }, [fetchAndSchedule]);

  return { pendingCompletion, handleCompletionConfirm, dismissCompletion, rescheduleToday };
}
