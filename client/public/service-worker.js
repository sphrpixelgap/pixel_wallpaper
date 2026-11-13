const SHELL_CACHE = "pixelwp-shell-v2";
const IMAGE_CACHE = "pixelwp-images-v2";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/pwa-192.png", "/pwa-512.png", "/site-logo.webp"];
const MAX_CACHED_PAGES = 24;
const MAX_CACHED_IMAGES = 48;
const NAVIGATION_TIMEOUT_MS = 1_800;
const ASSET_PATHS_TO_BYPASS = ["/api", "/admin", "/manus-oauth/", "/__manus/", "/__system__/"];
const SITE_MEDIA_PATHS = ["/media/wallpapers/", "/media/site-settings/"];

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function cacheHtmlPage(cache, request, response) {
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return;
  try {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    const pages = [];
    for (const key of keys) {
      const cached = await cache.match(key);
      if (cached?.headers.get("content-type")?.includes("text/html")) pages.push(key);
    }
    const nonRootPages = pages.filter(key => new URL(key.url).pathname !== "/");
    while (nonRootPages.length > MAX_CACHED_PAGES) await cache.delete(nonRootPages.shift());
  } catch {
    // Cache exhaustion must never prevent a successful network response.
  }
}

async function cacheWallpaperImage(cache, request, response) {
  const isOpaqueImage = response.type === "opaque";
  if (!response.ok && !isOpaqueImage) return;
  if (!isOpaqueImage && !response.headers.get("content-type")?.startsWith("image/")) return;
  try {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    const images = keys.filter(key => {
      const cachedUrl = new URL(key.url);
      return cachedUrl.origin === self.location.origin &&
        (cachedUrl.pathname.startsWith("/manus-storage/") || SITE_MEDIA_PATHS.some(prefix => cachedUrl.pathname.startsWith(prefix)));
    });
    for (const old of images.slice(0, Math.max(0, images.length - MAX_CACHED_IMAGES))) await cache.delete(old);
  } catch {
    // A quota-limited cache must not block wallpaper display or downloads.
  }
}

function respondWithCachedImage(event, request) {
  const cachePromise = caches.open(IMAGE_CACHE);
  const cachedPromise = cachePromise.then(cache => cache.match(request));
  const networkPromise = fetch(request).then(async response => {
    await cacheWallpaperImage(await cachePromise, request, response);
    return response;
  }).catch(() => null);
  event.waitUntil(networkPromise.then(() => undefined));
  event.respondWith((async () => (await cachedPromise) || (await networkPromise) || Response.error())());
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL_URLS.map(async url => {
      try {
        const response = await fetchWithTimeout(new Request(new URL(url, self.location.origin), { cache: "reload" }), 6_000);
        if (response.ok && response.type === "basic") await cache.put(url, response);
      } catch {
        // A weak connection should not prevent the worker from installing.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith("pixelwp-") && ![SHELL_CACHE, IMAGE_CACHE].includes(key)).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.origin === self.location.origin && ASSET_PATHS_TO_BYPASS.some(prefix => url.pathname.startsWith(prefix))) return;

  if (SITE_MEDIA_PATHS.some(prefix => url.pathname.startsWith(prefix)) && request.destination === "image") {
    respondWithCachedImage(event, request);
    return;
  }

  if (request.mode === "navigate") {
    // Never cache search/filter URLs or private management pages.
    if (url.search || url.pathname.startsWith("/favorites") || url.pathname.startsWith("/request/track")) return;

    const cachePromise = caches.open(SHELL_CACHE);
    const networkPromise = cachePromise
      .then(async cache => {
        const response = await fetchWithTimeout(request, 8_000);
        await cacheHtmlPage(cache, request, response);
        return response;
      })
      .catch(() => null);

    // Keep the refresh alive after returning a cached document on slow networks.
    event.waitUntil(networkPromise.then(() => undefined));
    event.respondWith((async () => {
      const cache = await cachePromise;
      const cached = await cache.match(request) || await cache.match("/");
      if (!cached) return (await networkPromise) || Response.error();

      const result = await Promise.race([
        networkPromise.then(response => ({ response })),
        new Promise(resolve => setTimeout(() => resolve({ response: null }), NAVIGATION_TIMEOUT_MS)),
      ]);
      return result.response || cached;
    })());
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/manus-storage/")) {
    respondWithCachedImage(event, request);
    return;
  }

  if (url.origin === self.location.origin && (url.pathname.startsWith("/assets/") || SHELL_URLS.includes(url.pathname))) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        void cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    })());
  }
});
