/*
 * WorkManager service worker (v5).
 *
 * Caching rules
 *  - Built JS/CSS under /assets/ has content hashes in its file names, so cache-first is safe.
 *  - Installable shell files (manifest, icons, favicon, llms.txt) use network-first, so a
 *    changed icon or name reaches installed apps on the next launch instead of being stuck
 *    in an old cache.
 *  - Page navigations are network-first; the cached shell is only an offline fallback.
 *  - Sign-in pages, server functions, API calls and dev-server paths always go to the network.
 *
 * Updates
 *  - A new version installs in the background but does NOT take over on its own. The app
 *    shows an "Update now" prompt, and the page asks this worker to activate by sending
 *    { type: "SKIP_WAITING" }. This keeps an open page from breaking while old and new
 *    chunks are mixed, and the user decides when to reload.
 *  - User data lives in the backend, not in this cache, so updating never removes it.
 *
 * Bump CACHE whenever this file's logic changes.
 */
const CACHE = "workmanager-v5";

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

function isHashedAsset(url) {
  return url.pathname.startsWith("/assets/");
}

function isShellAsset(url) {
  return SHELL.includes(url.pathname) || /\.(png|svg|ico|webmanifest)$/.test(url.pathname);
}

self.addEventListener("install", (event) => {
  // No skipWaiting() here: the new version waits until the user accepts the update prompt.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(SHELL.map((path) => cache.add(path).catch(() => undefined)));
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

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
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

// Hashed build assets: a new build has new file names, so cache first is always correct.
async function handleHashedAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// Shell files (icons, manifest): network first so changes arrive, cache as the fallback.
async function handleShellAsset(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? OFFLINE_RESPONSE();
  }
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

  if (isHashedAsset(url)) {
    event.respondWith(handleHashedAsset(request));
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(handleShellAsset(request));
  }
});
