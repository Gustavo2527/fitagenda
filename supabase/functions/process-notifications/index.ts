import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT")!,
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!
    );

    const { data: pending, error } = await supabase
      .from("scheduled_notifications")
      .select("*, sessions(id, date, start_time, clients(name))")
      .eq("sent", false)
      .lte("send_at", new Date().toISOString())
      .limit(50);

    if (error) throw error;

    console.log(`[process-notifications] Found ${pending?.length || 0} pending`);

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processedCount = 0;

    for (const notification of pending) {
      const session = notification.sessions as any;
      const clientName = session?.clients?.name || "Aluno";
      const startTime = session?.start_time?.slice(0, 5) || "";

      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("subscription")
        .eq("user_id", notification.user_id);

      if (!subscriptions || subscriptions.length === 0) {
        console.log(`[process-notifications] No subscription for user ${notification.user_id}`);
        await supabase.from("scheduled_notifications").update({ sent: true }).eq("id", notification.id);
        continue;
      }

      const title = notification.type === "lembrete"
        ? "⏰ Aula em 20 minutos!"
        : "✅ A aula foi realizada?";

      const body = notification.type === "lembrete"
        ? `Aula com ${clientName} às ${startTime}. Prepare-se!`
        : `Aula com ${clientName} — foi concluída?`;

      const payload = JSON.stringify({
        title,
        body,
        data: {
          type: notification.type === "lembrete" ? "lembrete" : "completion",
          sessionId: notification.session_id,
          tag: `aula-${notification.session_id}-${notification.type}`,
        },
      });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(sub.subscription, payload);
          console.log(`[process-notifications] Push sent: ${title}`);
        } catch (err) {
          console.error(`[process-notifications] Push error:`, err);
        }
      }

      await supabase.from("scheduled_notifications").update({ sent: true }).eq("id", notification.id);
      processedCount++;
    }

    console.log(`[process-notifications] Processed: ${processedCount}`);
    return new Response(JSON.stringify({ processed: processedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[process-notifications] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
