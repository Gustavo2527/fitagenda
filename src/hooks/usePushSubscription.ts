import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// VAPID public key - safe to expose in frontend
const VAPID_PUBLIC_KEY = "BLIhJjTxh6TWvr5J9UzYIZFK4-Cvo_aUgrMImAWauHz-VVmD_nvb7LDywkSQ1g0kJIjufiVU8JI9DSx156oFFYg";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSubscription() {
  const { user } = useAuth();

  const subscribe = useCallback(async () => {
    if (!user) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "granted") return;

    // Check localStorage to avoid re-subscribing
    const savedKey = `push_subscribed_${user.id}`;
    if (localStorage.getItem(savedKey)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
        });
      }

      const subJson = subscription.toJSON();

      // Save to DB (upsert by endpoint)
      await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint: subscription.endpoint,
            subscription: subJson as any,
          },
          { onConflict: "endpoint" }
        );

      localStorage.setItem(savedKey, "true");
      console.log("[Push] Subscription saved successfully");
    } catch (err) {
      console.error("[Push] Subscription failed:", err);
    }
  }, [user]);

  // Auto-subscribe when permission is granted
  useEffect(() => {
    subscribe();
  }, [subscribe]);

  return { subscribe };
}
