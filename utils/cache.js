const DEFAULT_MAX_ENTRIES = 600;

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class TtlCache {
  constructor(options = {}) {
    this.maxEntries = readPositiveInt(
      options.maxEntries,
      readPositiveInt(
        process.env.RESPONSE_CACHE_MAX_ENTRIES,
        DEFAULT_MAX_ENTRIES,
      ),
    );
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    const normalizedTtl = readPositiveInt(ttlMs, 0);
    if (!normalizedTtl) {
      return value;
    }

    while (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.store.delete(oldestKey);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + normalizedTtl,
    });

    return value;
  }

  delete(key) {
    return this.store.delete(key);
  }

  deleteWhere(predicate) {
    let deleted = 0;
    for (const key of this.store.keys()) {
      if (predicate(key)) {
        this.store.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  pruneExpired(now = Date.now()) {
    let deleted = 0;
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  clear() {
    this.store.clear();
  }

  stats() {
    this.pruneExpired();
    return {
      entries: this.store.size,
      max_entries: this.maxEntries,
    };
  }

  size() {
    this.pruneExpired();
    return this.store.size;
  }
}

const responseCache = new TtlCache();

function getUserCachePrefix(userId) {
  return `user:${Number(userId) || 0}:`;
}

function makeUserCacheKey(userId, namespace, requestUrl) {
  return `${getUserCachePrefix(userId)}${namespace}:${requestUrl}`;
}

function invalidateUserCache(userId, namespace = "") {
  const prefix = `${getUserCachePrefix(userId)}${namespace}`;
  if (!Number(userId)) {
    return 0;
  }

  return responseCache.deleteWhere((key) => key.startsWith(prefix));
}

module.exports = {
  TtlCache,
  invalidateUserCache,
  makeUserCacheKey,
  responseCache,
};
