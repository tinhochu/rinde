// Replaces the service worker the Rinde app registered when it lived on this origin (it now lives on
// the app subdomain). It removes the app's caches and has no fetch handler, so the network serves
// every request and no stale copy of the app is shown here.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});
