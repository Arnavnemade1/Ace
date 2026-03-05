import { supabase } from "@/integrations/supabase/client";

function base64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function enablePushNotifications() {
  if (typeof window === "undefined") return { ok: false, message: "Browser environment unavailable" };
  if (!("Notification" in window)) return { ok: false, message: "Notifications not supported in this browser" };
  if (!("serviceWorker" in navigator)) return { ok: false, message: "Service worker not available" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notification permission was not granted" };
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return { ok: false, message: "Missing VITE_VAPID_PUBLIC_KEY environment variable" };
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(vapidPublicKey)
    });
  }

  const payload = {
    endpoint: subscription.endpoint,
    p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh") || new ArrayBuffer(0)))),
    auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("auth") || new ArrayBuffer(0)))),
    user_agent: navigator.userAgent,
    subscription,
    updated_at: new Date().toISOString()
  };

  const { error } = await (supabase as any)
    .from("push_subscriptions")
    .upsert(payload, { onConflict: "endpoint" });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Push notifications enabled" };
}
