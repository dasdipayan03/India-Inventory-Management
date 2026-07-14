(function cleanupInventoryServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const CACHE_PREFIXES = [
    "shop-inventory-runtime-",
    "inventory-runtime-",
  ];

  function isInventoryRuntimeCache(cacheName) {
    return CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix));
  }

  async function clearRuntimeCaches() {
    if (!("caches" in window)) {
      return;
    }

    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => isInventoryRuntimeCache(cacheName))
        .map((cacheName) => caches.delete(cacheName)),
    );
  }

  async function unregisterInventoryWorkers() {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => {
          try {
            return new URL(registration.scope).origin === window.location.origin;
          } catch (_error) {
            return false;
          }
        })
        .map((registration) => registration.unregister()),
    );
  }

  window.addEventListener("load", () => {
    Promise.allSettled([
      unregisterInventoryWorkers(),
      clearRuntimeCaches(),
    ]).catch(() => {});
  });
})();
