const { responseCache } = require("./cache");
const { exportQueue } = require("./export-queue");

const MAX_ROUTE_STATS = 120;
const metrics = {
  startedAt: new Date().toISOString(),
  requestTotal: 0,
  activeRequests: 0,
  errorResponses: 0,
  slowRequests: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
  byStatusClass: {},
  byMethod: {},
  routes: new Map(),
};

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getMemoryUsageMb() {
  const usage = process.memoryUsage();
  return {
    rss: roundTo(usage.rss / (1024 * 1024)),
    heap_total: roundTo(usage.heapTotal / (1024 * 1024)),
    heap_used: roundTo(usage.heapUsed / (1024 * 1024)),
    external: roundTo(usage.external / (1024 * 1024)),
  };
}

function normalizeRoutePath(pathname) {
  return (
    String(pathname || "/")
      .split("?")[0]
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":uuid")
      .replace(/\b\d{10}\b/g, ":phone")
      .replace(/\/\d+(?=\/|$)/g, "/:id")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "") || "/"
  );
}

function getRouteStatsKey(method, pathname) {
  return `${String(method || "GET").toUpperCase()} ${normalizeRoutePath(pathname)}`;
}

function incrementBucket(bucket, key) {
  bucket[key] = (bucket[key] || 0) + 1;
}

function markHttpRequestStarted() {
  metrics.activeRequests += 1;
}

function markHttpRequestFinished() {
  metrics.activeRequests = Math.max(0, metrics.activeRequests - 1);
}

function recordHttpRequest({
  method,
  pathname,
  statusCode,
  durationMs,
  slowThresholdMs = 1500,
}) {
  const normalizedDuration = Number(durationMs) || 0;
  const normalizedStatus = Number(statusCode) || 0;
  const statusClass = `${Math.floor(normalizedStatus / 100)}xx`;
  const methodName = String(method || "GET").toUpperCase();
  const routeKey = getRouteStatsKey(methodName, pathname);

  metrics.requestTotal += 1;
  metrics.totalDurationMs += normalizedDuration;
  metrics.maxDurationMs = Math.max(metrics.maxDurationMs, normalizedDuration);
  incrementBucket(metrics.byStatusClass, statusClass);
  incrementBucket(metrics.byMethod, methodName);

  if (normalizedStatus >= 400) {
    metrics.errorResponses += 1;
  }

  if (normalizedDuration >= slowThresholdMs) {
    metrics.slowRequests += 1;
  }

  if (!metrics.routes.has(routeKey) && metrics.routes.size >= MAX_ROUTE_STATS) {
    const oldestKey = metrics.routes.keys().next().value;
    metrics.routes.delete(oldestKey);
  }

  const routeStats = metrics.routes.get(routeKey) || {
    route: routeKey,
    count: 0,
    errors: 0,
    slow: 0,
    total_duration_ms: 0,
    max_duration_ms: 0,
  };

  routeStats.count += 1;
  routeStats.total_duration_ms += normalizedDuration;
  routeStats.max_duration_ms = Math.max(
    routeStats.max_duration_ms,
    normalizedDuration,
  );
  if (normalizedStatus >= 400) {
    routeStats.errors += 1;
  }
  if (normalizedDuration >= slowThresholdMs) {
    routeStats.slow += 1;
  }

  metrics.routes.set(routeKey, routeStats);
}

function getPoolStats(pool) {
  if (!pool) {
    return null;
  }

  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    ready: typeof pool.isReady === "function" ? pool.isReady() : undefined,
    state: pool.dbState || null,
  };
}

function buildMonitoringSnapshot(pool = null) {
  const routeStats = Array.from(metrics.routes.values())
    .map((route) => ({
      ...route,
      avg_duration_ms: route.count
        ? roundTo(route.total_duration_ms / route.count)
        : 0,
      max_duration_ms: roundTo(route.max_duration_ms),
    }))
    .sort((a, b) => b.total_duration_ms - a.total_duration_ms)
    .slice(0, 25);

  return {
    service: "india-inventory-management",
    started_at: metrics.startedAt,
    uptime_seconds: roundTo(process.uptime(), 3),
    timestamp: new Date().toISOString(),
    memory_mb: getMemoryUsageMb(),
    requests: {
      total: metrics.requestTotal,
      active: metrics.activeRequests,
      errors: metrics.errorResponses,
      slow: metrics.slowRequests,
      avg_duration_ms: metrics.requestTotal
        ? roundTo(metrics.totalDurationMs / metrics.requestTotal)
        : 0,
      max_duration_ms: roundTo(metrics.maxDurationMs),
      by_status_class: metrics.byStatusClass,
      by_method: metrics.byMethod,
      top_routes: routeStats,
    },
    db_pool: getPoolStats(pool),
    cache: responseCache.stats(),
    exports: exportQueue.stats(),
  };
}

module.exports = {
  buildMonitoringSnapshot,
  markHttpRequestFinished,
  markHttpRequestStarted,
  metrics,
  recordHttpRequest,
};
