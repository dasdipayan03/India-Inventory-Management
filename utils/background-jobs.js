const { responseCache } = require("./cache");
const { exportQueue } = require("./export-queue");
const { logEvent } = require("./runtime-log");

const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

const state = {
  started: false,
  startedAt: null,
  cleanupRuns: 0,
  lastCleanupAt: null,
  lastCleanup: null,
  heartbeatRuns: 0,
  lastHeartbeatAt: null,
};

let cleanupTimer = null;
let heartbeatTimer = null;

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getMemoryUsageMb() {
  const usage = process.memoryUsage();
  return {
    rss: Number((usage.rss / (1024 * 1024)).toFixed(2)),
    heap_used: Number((usage.heapUsed / (1024 * 1024)).toFixed(2)),
    heap_total: Number((usage.heapTotal / (1024 * 1024)).toFixed(2)),
    external: Number((usage.external / (1024 * 1024)).toFixed(2)),
  };
}

function getPoolStats(pool) {
  if (!pool) {
    return null;
  }

  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

function runCleanup() {
  const removedCacheEntries = responseCache.pruneExpired();
  const removedExportJobs = exportQueue.cleanup();

  state.cleanupRuns += 1;
  state.lastCleanupAt = new Date().toISOString();
  state.lastCleanup = {
    removed_cache_entries: removedCacheEntries,
    removed_export_jobs: removedExportJobs,
  };

  if (removedCacheEntries || removedExportJobs) {
    logEvent("info", "background_cleanup_completed", state.lastCleanup);
  }

  return state.lastCleanup;
}

function startBackgroundJobs(options = {}) {
  if (state.started) {
    return getBackgroundJobStatus(options.pool);
  }

  const cleanupIntervalMs = readPositiveInt(
    options.cleanupIntervalMs || process.env.BACKGROUND_CLEANUP_INTERVAL_MS,
    DEFAULT_CLEANUP_INTERVAL_MS,
  );
  const heartbeatIntervalMs = readPositiveInt(
    options.heartbeatIntervalMs || process.env.MONITOR_HEARTBEAT_INTERVAL_MS,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
  );

  state.started = true;
  state.startedAt = new Date().toISOString();

  cleanupTimer = setInterval(runCleanup, cleanupIntervalMs);
  cleanupTimer.unref?.();

  heartbeatTimer = setInterval(() => {
    state.heartbeatRuns += 1;
    state.lastHeartbeatAt = new Date().toISOString();
    logEvent("info", "app_monitor_heartbeat", {
      memoryMb: getMemoryUsageMb(),
      dbPool: getPoolStats(options.pool),
      cache: responseCache.stats(),
      exports: exportQueue.stats(),
      cleanupRuns: state.cleanupRuns,
    });
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  logEvent("info", "background_jobs_started", {
    cleanupIntervalMs,
    heartbeatIntervalMs,
  });

  runCleanup();
  return getBackgroundJobStatus(options.pool);
}

function stopBackgroundJobs() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (state.started) {
    state.started = false;
    logEvent("info", "background_jobs_stopped", {
      cleanupRuns: state.cleanupRuns,
      heartbeatRuns: state.heartbeatRuns,
    });
  }
}

function getBackgroundJobStatus(pool = null) {
  return {
    ...state,
    cache: responseCache.stats(),
    exports: exportQueue.stats(),
    db_pool: getPoolStats(pool),
  };
}

module.exports = {
  getBackgroundJobStatus,
  runCleanup,
  startBackgroundJobs,
  stopBackgroundJobs,
};
