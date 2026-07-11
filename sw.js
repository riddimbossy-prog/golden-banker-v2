/* Predict2u service worker — resilient offline shell + fresh match data.
   Strategy:
   - Navigation/HTML: network-first, then cached page fallback.
   - data.js: network-first, then last cached data.
   - Static assets: cache-first with background refresh.
   - Cache entries are versioned. Bump CACHE_VERSION when releasing changes. */

const CACHE_VERSION = "predict2u-v155";
const OFFLINE_PAGE = "./board.html";

const SHELL = [
  "./index.html",
  "./board.html",
  "./engines.html",
  "./proof.html",
  "./scorecards.html",
  "./league-dna.html",
  "./responsible-gambling.html",
  "./terms.html",
  "./privacy.html",
  "./disclaimer.html",
  "./trust.html",
  "./site-health-widget.js",
  "./site-health.css",
  "./site-health.json",
  "./p2u-intelligence.js",
  "./live-refresh.js",
  "./intelligence.css",
  "./predict2u-logo.png",
  "./predict2u-logo.webp",
  "./slip.js",
  "./community.html",
  "./community.js",
  "./banker-engine.js",

  "./pedigree.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

const isSuccessful = response =>
  response && (response.ok || response.type === "opaque");

async function cacheShellIndividually() {
  const cache = await caches.open(CACHE_VERSION);

  // Cache each file separately so one missing asset does not cancel the rest.
  await Promise.allSettled(
    SHELL.filter(Boolean).map(async url => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (isSuccessful(response)) {
          await cache.put(url, response);
        }
      } catch (_) {
        // Installation continues even when an optional shell file is missing.
      }
    })
  );
}

self.addEventListener("install", event => {
  event.waitUntil(cacheShellIndividually());
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key.startsWith("predict2u-") && key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      );

      // Enable navigation preload when supported.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })()
  );
});

async function networkFirst(request, fallbackUrl = null, preloadResponse = null) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = preloadResponse || await fetch(request);
    if (isSuccessful(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await cache.match(request, { ignoreSearch: true });
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
  const cached = await cache.match(request, { ignoreSearch: true });

  const refresh = fetch(request)
    .then(async response => {
      if (isSuccessful(response)) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Return cache immediately and refresh it in the background.
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

  // Only handle same-origin GET requests.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Always prefer fresh prediction data.
  if (url.pathname.endsWith("/data.js") || url.pathname.endsWith("data.js")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // HTML navigations should update quickly after a deployment.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const preload = await event.preloadResponse;
        return networkFirst(request, OFFLINE_PAGE, preload || null);
      })()
    );
    return;
  }

  // Versioned app assets load from cache immediately and refresh quietly.
  event.respondWith(cacheFirstWithRefresh(request));
});

// Optional message hook: allow the page to activate a waiting worker immediately.
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
