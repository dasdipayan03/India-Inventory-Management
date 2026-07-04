const CACHE_VERSION = "2026-07-04-network-resilience-1";
const RUNTIME_CACHE = `shop-inventory-runtime-${CACHE_VERSION}`;
const CACHE_PREFIX = "shop-inventory-runtime-";
const NAVIGATION_TIMEOUT_MS = 4200;
const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Network unavailable</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: Arial, sans-serif;
        color: #122744;
        background: #eef7fd;
      }
      main {
        width: min(420px, 100%);
        padding: 24px;
        border-radius: 18px;
        background: #fff;
        box-shadow: 0 18px 44px rgba(12, 31, 59, 0.12);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 22px;
      }
      p {
        margin: 0 0 18px;
        color: #60728d;
        line-height: 1.5;
      }
      button {
        width: 100%;
        border: 0;
        border-radius: 12px;
        padding: 12px 14px;
        background: #1697d0;
        color: #fff;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Network unavailable</h1>
      <p>Please check your mobile data or Wi-Fi connection and try again.</p>
      <button type="button" onclick="window.location.reload()">Retry</button>
    </main>
  </body>
</html>`;

const CORE_ASSETS = [
  "/",
  "/login.html",
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
    const isLoginBanner =
      /^\/images\/login_page_banner_(?:[1-9]|10)\.(?:png|jpe?g|webp)$/i.test(
        url.pathname,
      );
    if (!isLoginBanner) {
      url.search = "";
    }
  }
  return url.toString();
}

function isCacheableResponse(response) {
  return response && response.status === 200 && response.type !== "error";
}

function isInventoryRuntimeCache(key) {
  return /(?:^|-)inventory-runtime-/.test(key);
}

function timeoutWith(response, timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(response), timeoutMs);
  });
}

async function cacheResponse(request, response) {
  if (!isCacheableResponse(response)) {
    return;
  }

  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(cacheKeyFor(request), response.clone());
}

async function navigationFallbackResponse(cache, fallbackUrl) {
  if (fallbackUrl) {
    const fallback = await cache.match(fallbackUrl);
    if (fallback) {
      return fallback;
    }
  }

  const loginFallback = await cache.match("/login.html");
  if (loginFallback) {
    return loginFallback;
  }

  return new Response(OFFLINE_FALLBACK_HTML, {
    status: 503,
    statusText: "Network unavailable",
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function navigationNetworkFirst(
  request,
  fallbackUrl,
  preloadResponsePromise,
) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cacheKey = cacheKeyFor(request);
  const cached = await cache.match(cacheKey);
  const networkResponse = Promise.resolve(preloadResponsePromise)
    .then((preloadResponse) => preloadResponse || fetch(request))
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
      timeoutWith(cached, NAVIGATION_TIMEOUT_MS),
    ]);
    return firstResponse || cached;
  }

  const response = await networkResponse;
  if (response) {
    return response;
  }

  return navigationFallbackResponse(cache, fallbackUrl);
}

async function staleWhileRevalidate(request) {
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
    networkResponse.catch(() => {});
    return cached;
  }

  const response = await networkResponse;
  if (response) {
    return response;
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
    Promise.all([
      self.registration.navigationPreload?.enable?.() || Promise.resolve(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key !== RUNTIME_CACHE &&
                  (key.startsWith(CACHE_PREFIX) ||
                    isInventoryRuntimeCache(key)),
              )
              .map((key) => caches.delete(key)),
          ),
        )
        .then(() => self.clients.claim()),
    ]),
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
    event.respondWith(
      navigationNetworkFirst(request, fallbackUrl, event.preloadResponse),
    );
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
