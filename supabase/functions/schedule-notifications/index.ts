import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Accept optional user_id to scope to a single user (called from frontend after session create)
    let targetUserId: string | null = null;
    let targetDate: string | null = null;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        targetUserId = body.user_id || null;
        targetDate = body.date || null;
      } catch {
        // no body is fine — cron calls with empty body
      }
    }

    // Default to today in UTC (edge functions run in UTC)
    const today = targetDate || new Date().toISOString().split("T")[0];

    console.log(`[schedule-notifications] Scheduling for date=${today}, user=${targetUserId || "ALL"}`);

    // Fetch today's scheduled sessions
    let query = supabase
      .from("sessions")
      .select("id, user_id, client_id, date, start_time, status, clients(name)")
      .eq("date", today)
      .eq("status", "scheduled");

    if (targetUserId) {
      query = query.eq("user_id", targetUserId);
    }

    const { data: sessions, error: sessionsError } = await query;
    if (sessionsError) throw sessionsError;

    console.log(`[schedule-notifications] Found ${sessions?.length || 0} sessions`);

    if (!sessions || sessions.length === 0) {
      return new Response(
        JSON.stringify({ scheduled: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let scheduledCount = 0;

    for (const session of sessions) {
      const clientName = (session.clients as any)?.name || "Aluno";

      // Delete existing unsent notifications for this session to avoid duplicates
      await supabase
        .from("scheduled_notifications")
        .delete()
        .eq("session_id", session.id)
        .eq("sent", false);

      // Parse session start time as local date+time
      // session.date = "2026-04-15", session.start_time = "09:00:00"
      const sessionDateTime = new Date(`${session.date}T${session.start_time}`);

      // 1. Reminder: 20 minutes before
      const reminderTime = new Date(sessionDateTime.getTime() - 20 * 60 * 1000);

      const { error: errReminder } = await supabase
        .from("scheduled_notifications")
        .insert({
          session_id: session.id,
          user_id: session.user_id,
          type: "lembrete",
          send_at: reminderTime.toISOString(),
          sent: false,
        });

      if (errReminder) {
        console.error(`[schedule-notifications] Error inserting reminder for session ${session.id}:`, errReminder);
      } else {
        console.log(`[schedule-notifications] Reminder scheduled: ${clientName} at ${reminderTime.toISOString()}`);
        scheduledCount++;
      }

      // 2. Confirmation: at exact start time
      const { error: errConfirm } = await supabase
        .from("scheduled_notifications")
        .insert({
          session_id: session.id,
          user_id: session.user_id,
          type: "confirmacao",
          send_at: sessionDateTime.toISOString(),
          sent: false,
        });

      if (errConfirm) {
        console.error(`[schedule-notifications] Error inserting confirmation for session ${session.id}:`, errConfirm);
      } else {
        console.log(`[schedule-notifications] Confirmation scheduled: ${clientName} at ${sessionDateTime.toISOString()}`);
        scheduledCount++;
      }
    }

    console.log(`[schedule-notifications] Total scheduled: ${scheduledCount}`);

    return new Response(
      JSON.stringify({ scheduled: scheduledCount, sessions: sessions.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[schedule-notifications] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
