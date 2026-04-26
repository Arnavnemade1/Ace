const STATIC_CACHE = "ace-static-v1";
const DYNAMIC_CACHE = "ace-dynamic-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon.png",
  "/logo.png",
  "/icons/pwa-192x192.png",
  "/icons/pwa-512x512.png"
];

async function getCachedAppShell() {
  try {
    const staticCached = await caches.match("/index.html");
    if (staticCached) return staticCached;

    const dynamicCache = await caches.open(DYNAMIC_CACHE);
    const dynamicCached = await dynamicCache.match("/index.html");
    if (dynamicCached) return dynamicCached;
  } catch (err) {
    console.error("[SW] Error accessing cache for app shell:", err);
  }
  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[SW] Pre-caching app shell");
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  // We only handle GET requests
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  // 1. Handle Navigation Requests (SPA support)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If we got a valid response, cache it as the new app shell
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(async (error) => {
          console.warn("[SW] Navigation fetch failed, attempting cache fallback:", error);
          const cachedPage = await getCachedAppShell();
          if (cachedPage) return cachedPage;
          
          const offlinePage = await caches.match("/offline.html");
          if (offlinePage) return offlinePage;
          
          // DO NOT return Response.error() here as it breaks the browser's native error handling
          // Just let the error propagate or return null to allow browser default behavior
          throw error;
        })
    );
    return;
  }

  // 2. Handle Same-Origin Assets (Caching strategy: Cache First, falling back to Network)
  if (requestUrl.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (cached) return cached;

        try {
          const response = await fetch(event.request);
          const isAsset =
            requestUrl.pathname.startsWith("/assets/") ||
            /\.(js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(requestUrl.pathname);

          if (response.ok && isAsset) {
            const copy = response.clone();
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(event.request, copy);
          }

          return response;
        } catch (error) {
          // If fetch fails and no cache, return the error so the browser knows it's a network issue
          // instead of intercepting it with a generic Response.error()
          throw error;
        }
      })
    );
    return;
  }

  // 3. For Cross-Origin requests (like Supabase), we don't intercept by default
  // This ensures the browser's native fetch (including CORS handling) works correctly
});

self.addEventListener("push", (event) => {
  const fallback = {
    title: "Ace Alert",
    body: "A new swarm update is available.",
    url: "/oracle"
  };

  let payload = fallback;

  if (event.data) {
    try {
      payload = { ...fallback, ...event.data.json() };
    } catch {
      payload = { ...fallback, body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/pwa-192x192.png",
      badge: "/icons/pwa-192x192.png",
      tag: payload.tag || "ace-alert",
      renotify: true,
      data: {
        url: payload.url || "/oracle"
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          client.navigate(target);
          return client.focus();
        }
      }

      return self.clients.openWindow(target);
    })
  );
});
