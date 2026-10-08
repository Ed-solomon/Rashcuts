/* Rashcuts runtime cache — v87
 * Only same-origin GET requests for static assets are cached.
 * HTML/API responses are deliberately left to the network.
 */
const CACHE_NAME = "rashcuts-static-v87";
const STATIC_SHELL = [
  "./",
  "./styles.css?v=87",
  "./script.js?v=87",
  "./site-config.js?v=87",
  "./fonts/Gebuk-Regular.ttf?v=87",
  "./fonts/Urbanist-Regular.ttf?v=87",
  "./fonts/Urbanist-Medium.ttf?v=87",
  "./assets/loader/rc-logo-render.png",
  "./assets/loader/favicon-48.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith("rashcuts-static-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const destination = request.destination;
  if (url.pathname.startsWith("/admin/") || url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;
  if (!["image", "style", "script", "font"].includes(destination)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || !response.ok) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      });
    })
  );
});
