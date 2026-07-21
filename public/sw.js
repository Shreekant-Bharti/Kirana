/**
 * Bharti Udhari Service Worker
 * Strategy: Cache-first for app assets, network-first for API calls.
 * Version bumping clears old caches and triggers the UpdatePrompt.
 */

const CACHE_VERSION = "bharti-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Core app shell — cached on install
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];

// Never cache these — always go to network
const NETWORK_ONLY = [
  "accounts.google.com",
  "googleapis.com",
  "google.com/gsi",
];

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll(APP_SHELL).catch(() => {
          // Don't fail install if some shell assets are missing
        }),
      )
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and network-only origins
  if (request.method !== "GET") return;
  if (NETWORK_ONLY.some((domain) => url.hostname.includes(domain))) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Navigation requests — serve app shell from cache with network fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(DYNAMIC_CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match("/").then((cached) => cached ?? new Response("Offline", { status: 503 })),
        ),
    );
    return;
  }

  // Static assets — cache first, then network
  if (
    url.pathname.match(/\.(js|css|png|ico|svg|woff2?|ttf|json)$/) ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
          return res;
        });
      }),
    );
    return;
  }

  // Everything else — network first, dynamic cache fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone();
        caches.open(DYNAMIC_CACHE).then((c) => c.put(request, clone));
        return res;
      })
      .catch(() => caches.match(request)),
  );
});

// ── Messages ──────────────────────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
