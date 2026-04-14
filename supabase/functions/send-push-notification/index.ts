const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import {
  buildPushHTTPRequest,
  importVapidKeys,
} from "https://esm.sh/@pushforge/builder@0.1.3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { subscription, title, body, data } = await req.json();

    if (!subscription || !title) {
      return new Response(
        JSON.stringify({ error: "subscription and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@fitagenda.app";

    const vapidKeys = await importVapidKeys(
      { publicKey: vapidPublicKey, privateKey: vapidPrivateKey },
      { extractable: false }
    );

    const payload = JSON.stringify({ title, body, data });

    const { headers, body: pushBody, endpoint } = await buildPushHTTPRequest(
      {
        vapidKeys,
        payload: new TextEncoder().encode(payload),
        subscription,
        adminContact: vapidSubject,
        ttl: 60 * 60, // 1 hour
      }
    );

    const pushResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: pushBody,
    });

    if (!pushResponse.ok) {
      const errText = await pushResponse.text();
      console.error("Push service error:", pushResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "Push service error", status: pushResponse.status, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await pushResponse.text(); // consume body

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-push-notification error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
