/* Predict2U service worker v171 — fast shell, bounded network waits and fresh data.
   Strategy:
   - Navigation/HTML: network-first with a short timeout, then cached fallback.
   - data.js/site-health.json: network-first, canonical cache key, stale fallback.
   - Static assets: cache-first with background refresh.
   - Optional PREFETCH_URLS message warms likely next pages. */

const CACHE_VERSION = "predict2u-v171";
const OFFLINE_PAGE = "./board.html";
const NETWORK_TIMEOUT_MS = 4500;

const SHELL = [
  "./admin.html",
  "./admin-control.js",
  "./admin-control.css",
  "./admin-config.js",
  "./site-controls.js",
  "./site-controls.css",
  "./index.html",
  "./board.html",
  "./engines.html",
  "./proof.html",
  "./scorecards.html",
  "./league-dna.html",
  "./community.html",
  "./trust.html",
  "./responsible-gambling.html",
  "./terms.html",
  "./privacy.html",
  "./disclaimer.html",
  "./404.html",
  "./site-health-widget.js",
  "./site-health.css",
  "mobile-app-nav.js",
  "mobile-app-nav.css",
  "./growth-sharing.js",
  "./growth-sharing.css",
  "./share.html",
  "./site-health.json",
  "./brand-experience.js",
  "./brand-experience.css",
  "./performance-freshness.js",
  "./performance-freshness.css",
  "./personalization.js",
  "./personalization.css",
  "./smart-alerts.js",
  "./smart-alerts.css",
  "./p2u-intelligence.js",
  "./live-refresh.js",
  "./intelligence.css",
  "./predict2u-logo.png",
  "./predict2u-logo.webp",
  "./predict2u-mark.png",
  "./social-preview.png",
  "./slip.js",
  "./banker-engine.js",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./favicon-16x16.png",
  "./favicon-32x32.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./maskable-icon.png"
];

const isSuccessful = response => response && (response.ok || response.type === "opaque");

function canonicalRequest(request) {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url.toString(), {
    method: "GET",
    headers: request.headers,
    credentials: request.credentials,
    mode: request.mode === "navigate" ? "same-origin" : request.mode,
    redirect: request.redirect
  });
}

async function fetchWithTimeout(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function cacheShellIndividually() {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.allSettled(SHELL.map(async url => {
    try {
      const response = await fetch(url, { cache: "reload" });
      if (isSuccessful(response)) await cache.put(url, response);
    } catch (_) {
      // Optional assets must never prevent installation.
    }
  }));
}

self.addEventListener("install", event => {
  event.waitUntil(cacheShellIndividually());
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("predict2u-") && key !== CACHE_VERSION)
      .map(key => caches.delete(key)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

async function networkFirst(request, { fallbackUrl = null, preloadResponse = null, canonical = false } = {}) {
  const cache = await caches.open(CACHE_VERSION);
  const key = canonical ? canonicalRequest(request) : request;
  try {
    const response = preloadResponse || await fetchWithTimeout(request);
    if (isSuccessful(response)) await cache.put(key, response.clone());
    return response;
  } catch (_) {
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    return new Response("You appear to be offline.", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

async function cacheFirstWithRefresh(request) {
  const cache = await caches.open(CACHE_VERSION);
  const key = canonicalRequest(request);
  const cached = await cache.match(key, { ignoreSearch: true });
  const refresh = fetch(request)
    .then(async response => {
      if (isSuccessful(response)) await cache.put(key, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) {
    refresh.catch(() => {});
    return cached;
  }
  const response = await refresh;
  if (response) return response;
  return new Response("Resource unavailable while offline.", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/data.js") || url.pathname.endsWith("data.js")) {
    event.respondWith(networkFirst(request, { canonical: true }));
    return;
  }

  if (url.pathname.endsWith("/site-health.json") || url.pathname.endsWith("site-health.json")) {
    event.respondWith(networkFirst(request, { canonical: true }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const preload = await event.preloadResponse;
      return networkFirst(request, { fallbackUrl: OFFLINE_PAGE, preloadResponse: preload || null });
    })());
    return;
  }

  event.respondWith(cacheFirstWithRefresh(request));
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === "PREFETCH_URLS" && Array.isArray(event.data.urls)) {
    const urls = event.data.urls.filter(url => typeof url === "string" && url.length < 180).slice(0, 8);
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.allSettled(urls.map(async url => {
        const request = new Request(url, { credentials: "same-origin" });
        const response = await fetch(request);
        if (isSuccessful(response)) await cache.put(canonicalRequest(request), response);
      }));
    })());
  }
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : "./community.html";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if ("navigate" in client) await client.navigate(target);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
