const { getUserId } = require("./auth");
const { makeUserCacheKey, responseCache } = require("../utils/cache");

const DEFAULT_TTL_MS = 10 * 1000;

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cacheJsonResponse(options = {}) {
  const namespace = String(options.namespace || "api").trim() || "api";
  const ttlMs = readPositiveInt(options.ttlMs, DEFAULT_TTL_MS);

  return (req, res, next) => {
    if (req.method !== "GET" || req.query?._no_cache === "1") {
      return next();
    }

    let userId = 0;
    try {
      userId = getUserId(req);
    } catch (_error) {
      return next();
    }

    const cacheKey = makeUserCacheKey(userId, namespace, req.originalUrl);
    const cached = responseCache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      Object.entries(cached.headers || {}).forEach(([name, value]) => {
        if (value !== undefined && value !== null) {
          res.set(name, value);
        }
      });
      res.type("json");
      return res.send(cached.body);
    }

    const originalJson = res.json.bind(res);
    res.set("X-Cache", "MISS");
    res.json = (body) => {
      if (
        res.statusCode === 200 &&
        !res.headersSent &&
        typeof body !== "undefined"
      ) {
        const headers = {};
        [
          "X-Total-Count",
          "X-Limit",
          "X-Offset",
          "X-Has-More",
        ].forEach((name) => {
          const value = res.getHeader(name);
          if (value !== undefined) {
            headers[name] = String(value);
          }
        });

        responseCache.set(
          cacheKey,
          { body: JSON.stringify(body), headers },
          ttlMs,
        );
      }

      return originalJson(body);
    };

    return next();
  };
}

module.exports = {
  cacheJsonResponse,
};
