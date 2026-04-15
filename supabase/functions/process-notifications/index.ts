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

    // Fetch pending notifications where send_at <= now
    const { data: pending, error: fetchErr } = await supabase
      .from("scheduled_notifications")
      .select("*, sessions(id, date, start_time, client_id, clients(name))")
      .eq("sent", false)
      .lte("send_at", new Date().toISOString())
      .limit(50);

    if (fetchErr) throw fetchErr;

    console.log(`[process-notifications] Found ${pending?.length || 0} pending notifications`);

    if (!pending || pending.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processedCount = 0;

    for (const notification of pending) {
      const session = notification.sessions as any;
      const clientName = session?.clients?.name || "Aluno";
      const startTime = session?.start_time?.slice(0, 5) || "";

      // Get user's push subscriptions
      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("subscription")
        .eq("user_id", notification.user_id);

      if (!subscriptions || subscriptions.length === 0) {
        console.log(`[process-notifications] No push subscription for user ${notification.user_id}, skipping`);
        // Mark as sent anyway to avoid retrying endlessly
        await supabase
          .from("scheduled_notifications")
          .update({ sent: true })
          .eq("id", notification.id);
        continue;
      }

      // Build notification content based on type
      let title: string;
      let body: string;

      if (notification.type === "lembrete") {
        title = `⏰ Aula em 20 minutos`;
        body = `Aula com ${clientName} às ${startTime}`;
      } else {
        title = `✅ A aula foi realizada?`;
        body = `Aula com ${clientName} — foi concluída?`;
      }

      const pushData = {
        sessionId: notification.session_id,
        type: notification.type,
      };

      // Send to all user's subscriptions
      for (const sub of subscriptions) {
        try {
          const pushResponse = await fetch(
            `${supabaseUrl}/functions/v1/send-push-notification`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                subscription: sub.subscription,
                title,
                body,
                data: pushData,
              }),
            }
          );

          if (!pushResponse.ok) {
            const errText = await pushResponse.text();
            console.error(`[process-notifications] Push failed for notification ${notification.id}:`, errText);
          } else {
            console.log(`[process-notifications] Push sent: ${title} - ${body}`);
          }
        } catch (pushErr) {
          console.error(`[process-notifications] Push error:`, pushErr);
        }
      }

      // Mark as sent
      await supabase
        .from("scheduled_notifications")
        .update({ sent: true })
        .eq("id", notification.id);

      processedCount++;
    }

    console.log(`[process-notifications] Processed: ${processedCount}`);

    return new Response(
      JSON.stringify({ processed: processedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[process-notifications] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
