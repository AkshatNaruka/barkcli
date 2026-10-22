/*
 * barkcli web app service worker — installable/offline support.
 *
 * Strategy (no build-time asset hashing, so cache-first would go stale):
 *   · navigations, app assets, font CSS — network-first, cache fallback
 *     (always fresh when online; boots from cache when offline)
 *   · /api/* — network only (real data must never be cached; the hosted
 *     demo intercepts /api in-page and never reaches the network)
 *   · mutable requests are never read from cache blindly, so deploys
 *     always propagate without needing a cache-version bump
 *
 * Body handling: each stashed copy gets its own buffer (put() consumes the
 * body, and the page gets a fresh copy after the buffer read).
 */
const VERSION = "v1";
const RUNTIME = `barkcli-runtime-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("barkcli-") && k !== RUNTIME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Network-first: the fresh response ist returned to the page and stashed for
 * the offline fallback. `key` is the fallback cache key (used for the app
 * shell so any navigation boots offline regardless of the entry URL).
 */
function bufferedResponse(source) {
  return new Response(source.body, { status: source.status, statusText: source.statusText, headers: source.headers });
}

async function networkFirst(request, { fallbackKey = null } = {}) {
  const cache = await caches.open(RUNTIME);
  try {
    const fresh = await fetch(request);
    // Any real response passes through (a 404 page stays a 404 page); only
    // successful ones get stashed for the offline fallback.
    if (fresh.type !== "error") {
      if (fresh.ok || fresh.type === "opaque") {
        if (fallbackKey) {
          // Consume the body once and hand every consumer its own copy.
          const buf = await fresh.arrayBuffer();
          const clone = () => new Response(buf.slice(0), { status: fresh.status, statusText: fresh.statusText, headers: fresh.headers });
          await cache.put(new Request(fallbackKey), clone());
          return clone();
        }
        await cache.put(request, fresh.clone());
        return fresh;
      }
      return fresh;
    }
    throw new Error("no response");
  } catch (err) {
    const hit =
      (await cache.match(request, { ignoreSearch: true })) ||
      (fallbackKey && (await cache.match(fallbackKey, { ignoreSearch: true })));
    if (hit) return hit;
    console.error("[barkcli-sw] networkFirst failed:", request.url, err && (err.stack || err.message || err));
    throw new Error("offline and not cached");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fonts & CDNs: let the browser handle

  // Real data + demo-mode endpoints are never cached.
  if (url.pathname.includes("/api/") || url.pathname.endsWith("/ws")) return;

  const isNavigation = request.mode === "navigate";
  event.respondWith(
    networkFirst(request, { fallbackKey: isNavigation ? "index.html" : null }),
  );
});
