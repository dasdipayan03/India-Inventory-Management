const CACHE_VERSION = "2026-07-03-shop-brand-logo-1";
const RUNTIME_CACHE = `shop-inventory-runtime-${CACHE_VERSION}`;
const CACHE_PREFIX = "shop-inventory-runtime-";
const NETWORK_TIMEOUT_MS = 2400;

const CORE_ASSETS = [
  "/site.webmanifest",
  "/images/app_logo.png?v=2026-07-03-shop-brand-logo-1",
  "/js/service-worker-register.js",
  "/js/permission-contract.js",
  "/js/app-core.js",
  "/js/app-shell.js",
];

const SHELL_PAGES = new Set([
  "/",
  "/login.html",
  "/index.html",
  "/invoice.html",
  "/reset.html",
  "/privacy-policy.html",
  "/account-deletion.html",
  "/developer-login.html",
  "/developer-support.html",
]);

function isHttpRequest(request) {
  return request.url.startsWith("http://") || request.url.startsWith("https://");
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApiRequest(url) {
  return isSameOrigin(url) && url.pathname.startsWith("/api/");
}

function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html")
  );
}

function isStaticAssetRequest(request, url) {
  if (!isSameOrigin(url)) {
    return false;
  }

  return (
    url.pathname === "/site.webmanifest" ||
    url.pathname.startsWith("/js/") ||
    url.pathname.startsWith("/images/") ||
    ["script", "style", "image", "font", "manifest"].includes(
      request.destination,
    )
  );
}

function cacheKeyFor(request) {
  const url = new URL(request.url);
  if (isSameOrigin(url)) {
    url.hash = "";
    url.search = "";
  }
  return url.toString();
}

function isCacheableResponse(response) {
  return response && response.status === 200 && response.type !== "error";
}

function isInventoryRuntimeCache(key) {
  return /(?:^|-)inventory-runtime-/.test(key);
}

function timeoutWith(response) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(response), NETWORK_TIMEOUT_MS);
  });
}

async function cacheResponse(request, response) {
  if (!isCacheableResponse(response)) {
    return;
  }

  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(cacheKeyFor(request), response.clone());
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cacheKey = cacheKeyFor(request);
  const cached = await cache.match(cacheKey);
  const networkResponse = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) {
        cache.put(cacheKey, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    const firstResponse = await Promise.race([
      networkResponse,
      timeoutWith(cached),
    ]);
    return firstResponse || cached;
  }

  const response = await networkResponse;
  if (response) {
    return response;
  }

  if (fallbackUrl) {
    const fallback = await cache.match(fallbackUrl);
    if (fallback) {
      return fallback;
    }
  }

  return new Response("", {
    status: 504,
    statusText: "Network unavailable",
  });
}

async function warmCoreCache() {
  const requests = CORE_ASSETS.map((url) =>
    fetch(new Request(url, { cache: "reload" }))
      .then((response) => cacheResponse(new Request(url), response))
      .catch(() => {}),
  );

  await Promise.allSettled(requests);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(warmCoreCache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== RUNTIME_CACHE &&
                (key.startsWith(CACHE_PREFIX) || isInventoryRuntimeCache(key)),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !isHttpRequest(request)) {
    return;
  }

  const url = new URL(request.url);
  if (isApiRequest(url)) {
    return;
  }

  if (isNavigationRequest(request)) {
    const fallbackUrl = SHELL_PAGES.has(url.pathname) ? url.pathname : "/login.html";
    event.respondWith(networkFirst(request, fallbackUrl));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(networkFirst(request));
  }
});
