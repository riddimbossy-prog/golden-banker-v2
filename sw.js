/* Predict2U service worker v189 — fast shell, bounded network waits and fresh data.
   Strategy:
   - Navigation/HTML: network-first with a short timeout, then cached fallback.
   - data.js/site-health.json: network-first, canonical cache key, stale fallback.
   - Static assets: cache-first with background refresh.
   - Optional PREFETCH_URLS message warms likely next pages. */

const CACHE_VERSION = "predict2u-v189";
const OFFLINE_PAGE = "./board.html";
const NETWORK_TIMEOUT_MS = 4500;

const SHELL = [
  "./analytics.js",
  "./analytics.css",
  "./product-analytics.js",
  "./product-analytics.css",
  "./admin.html",
  "./backend-admin.js",
  "./backend-admin.css",
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
  "./news.html",
  "./news.js",
  "./news.css",
  "./SUPABASE_FOOTBALL_NEWS_v189.sql",
  "./community-consistency.js",
  "./account.html",
  "./profile.html",
  "./cloud-config.js",
  "./account-cloud.js",
  "./account-cloud.css",
  "./push-notifications.js",
  "./push-notifications.css",
  "./football-assets.js",
  "./brand-performance.css",
  "./SUPABASE_PUSH_SETUP_v183.sql",
  "./PUSH_NOTIFICATIONS_v183.md",
  "./SUPABASE_BACKEND_ADMIN_v181.sql",
  "./BACKEND_ADMIN_UI_v182.md",
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
  if (request.method !== "GET") return;

  // v184: club crests and country flags are immutable-style media. Cache them
  // after first use so repeat visits are fast even on slow mobile connections.
  if (request.destination === "image" && url.origin !== self.location.origin) {
    if (url.hostname === "media.api-sports.io" || url.hostname.endsWith(".api-sports.io")) {
      event.respondWith(cacheFirstWithRefresh(request));
    }
    return;
  }

  if (url.origin !== self.location.origin) return;

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



self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (_) {
      try { payload = { body: event.data ? event.data.text() : "" }; } catch (_) {}
    }
    const title = String(payload.title || "Predict2U update").slice(0, 100);
    const body = String(payload.body || "").slice(0, 240);
    const data = Object.assign({}, payload.data || {}, {
      url: payload.url || (payload.data && payload.data.url) || "./index.html",
      category: payload.category || "system",
      pushId: payload.id || ""
    });
    await self.registration.showNotification(title, {
      body,
      icon: payload.icon || "./icon-192.png",
      badge: payload.badge || "./favicon-48x48.png",
      tag: payload.id || `p2u-${payload.category || "system"}`,
      renotify: false,
      requireInteraction: payload.category === "match",
      data,
      actions: [{ action: "open", title: "Open Predict2U" }]
    });
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: "P2U_PUSH_RECEIVED", payload: Object.assign({}, payload, { data }) });
  })());
});

self.addEventListener("notificationclose", event => {
  const data = event.notification && event.notification.data || {};
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      client.postMessage({ type: "P2U_PUSH_CLOSED", id: data.pushId || "", category: data.category || "system" });
    }
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : "./index.html";
  const targetUrl = new URL(target, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if ("navigate" in client) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
