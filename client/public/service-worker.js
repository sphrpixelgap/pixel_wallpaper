const SHELL_CACHE = "pixelwp-shell-v1";
const IMAGE_CACHE = "pixelwp-images-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/pwa-192.png", "/pwa-512.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("pixelwp-") && ![SHELL_CACHE, IMAGE_CACHE].includes(key)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/manus-oauth/") || url.pathname.startsWith("/__manus/") || url.pathname.startsWith("/__system__/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => url.pathname === "/admin" ? Response.error() : (await caches.match("/")) || Response.error()));
    return;
  }
  if (url.pathname.startsWith("/manus-storage/")) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          for (const old of keys.slice(100)) await cache.delete(old);
        }
        return response;
      } catch { return cached || Response.error(); }
    })());
    return;
  }
  if (url.pathname.startsWith("/assets/") || SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && response.type === "basic") void caches.open(SHELL_CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});
