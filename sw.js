/* Predict2u service worker — offline shell + fresh data.
   Strategy:
   - App shell (index.html, engine, manifest, icons): cache-first, so the app
     opens instantly and works offline.
   - data.js: network-first, so picks are always as fresh as possible, falling
     back to the last cached data when offline.
   Bump CACHE_VERSION whenever you ship a new index.html/banker-engine.js so
   users get the update instead of a stale cached shell. */
const CACHE_VERSION = "predict2u-v137";
const SHELL = [
  "./index.html",
  "./board.html",
  "./slip.js",
  "./community.html",
  "./community.js",
  "./banker-engine.js",
  "./pedigree.js",
  "./manifest.webmanifest",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL.filter(Boolean)).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // only handle same-origin GETs
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // data.js -> network-first (always try for fresh picks)
  if (url.pathname.endsWith("/data.js") || url.pathname.endsWith("data.js")) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // everything else -> cache-first, fall back to network
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
