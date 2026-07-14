const ROLLBACK_VERSION = "2026-07-14-disable-low-network-cache-1";
const CACHE_PREFIXES = [
  "shop-inventory-runtime-",
  "inventory-runtime-",
];

function isInventoryRuntimeCache(cacheName) {
  return CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix));
}

async function clearInventoryRuntimeCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => isInventoryRuntimeCache(cacheName))
      .map((cacheName) => caches.delete(cacheName)),
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(clearInventoryRuntimeCaches());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await clearInventoryRuntimeCaches();
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});

// Rollback worker: intentionally do not call respondWith().
// All navigations, assets, API calls, and health checks go directly to network.
self.addEventListener("fetch", () => {});
