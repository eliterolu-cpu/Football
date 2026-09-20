// ============================================================
// TASHE AGRO SERVICE WORKER
// Provides offline support + PWA installability
// ============================================================

const CACHE_NAME = "tashe-agro-v1";
const RUNTIME_CACHE = "tashe-agro-runtime-v1";

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json"
];

// ---------- INSTALL: Pre-cache essential assets ----------
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Pre-cache failed for some assets:", err);
      });
    })
  );
  self.skipWaiting();
});

// ---------- ACTIVATE: Clean up old caches ----------
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
    })
  );
  return self.clients.claim();
});

// ---------- FETCH: Serve from cache, fall back to network ----------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip Firebase / external API calls — always go to network
  const url = new URL(request.url);
  const isFirebase =
    url.hostname.includes("firebase") ||
    url.hostname.includes("firestore") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("imgbb") ||
    url.hostname.includes("nominatim");
  if (isFirebase) return;

  // Skip chrome extensions
  if (url.protocol === "chrome-extension:") return;

  // Navigation requests (page loads) — network first, cache fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match("/index.html");
          });
        })
    );
    return;
  }

  // All other requests — stale while revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

// ---------- MESSAGE: Handle skip waiting ----------
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});