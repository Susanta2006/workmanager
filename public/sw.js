/*
 * WorkManager service worker.
 *
 * Caches only the installable shell and built static assets. Anything that carries sign-in
 * state (auth pages, server functions, API calls) or is served by the dev server (modules,
 * Vite internals) goes straight to the network, so a stale or broken cache can never hide
 * a real sign-in error. Bump CACHE whenever this logic changes so old caches are replaced.
 */
const CACHE = "workmanager-v4";

const SHELL = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/llms.txt",
];

// Always network, never cached, never intercepted.
const NETWORK_ONLY_PREFIXES = [
  "/api/",
  "/ws-",
  "/_serverFn",
  "/_server",
  "/@vite",
  "/@fs",
  "/@id",
  "/@react-refresh",
  "/node_modules/",
  "/src/",
  "/__",
  "/auth/",
  "/login",
  "/register",
  "/passcode",
  "/pending-approval",
  "/rental-pending",
  "/developer",
];

const OFFLINE_RESPONSE = () =>
  new Response("You are offline. Reconnect and reload.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

function isNetworkOnly(pathname) {
  return NETWORK_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isCacheableAsset(url) {
  if (isNetworkOnly(url.pathname)) return false;
  return (
    url.pathname.startsWith("/assets/") ||
    SHELL.includes(url.pathname) ||
    /\.(png|svg|ico|webmanifest)$/.test(url.pathname)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(SHELL.map((path) => cache.add(path).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

// Page navigations: network first. The app shell is kept only as an offline fallback.
async function handleNavigation(request, url) {
  try {
    const response = await fetch(request);
    if (response.ok && url.pathname === "/") {
      const cache = await caches.open(CACHE);
      cache.put("/", response.clone());
    }
    return response;
  } catch {
    const shell = await caches.match("/");
    return shell ?? OFFLINE_RESPONSE();
  }
}

// Built static assets: cache first, then network, remembering successful responses.
async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Requests with credentials, and anything sign-in or dev related, are not handled here.
  // Returning without respondWith() lets the browser fetch them normally.
  if (request.headers.has("authorization") || isNetworkOnly(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, url));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(handleAsset(request));
  }
});
