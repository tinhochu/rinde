// Rinde's service worker: makes the app installable and opens it instantly, even on a weak signal.
// Pages are fetched network-first, so a deploy shows up on the next visit. Only files whose names
// carry a content hash (/_expo/static, /assets) are served from cache first. Prices come from the
// API on another origin and are never cached here.
const SHELL = "rinde-shell-v1";
const STATIC = "rinde-static-v1";
const SHELL_FILES = ["/", "/manifest.json", "/icon-192.png", "/apple-touch-icon.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Every route is the same single page: try the network, fall back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) { const copy = response.clone(); caches.open(SHELL).then((c) => c.put("/", copy)); }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  if (url.pathname.startsWith("/_expo/static/") || url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(STATIC).then((c) => c.put(request, copy)); }
        return response;
      })),
    );
    return;
  }

  // Icons and the like: answer from cache, refresh in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request).then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(SHELL).then((c) => c.put(request, copy)); }
        return response;
      });
      return hit ? (fresh.catch(() => hit), hit) : fresh;
    }),
  );
});
