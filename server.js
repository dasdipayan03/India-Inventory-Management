/**
 * =========================================================
 * FILE: server.js
 * ENTRY POINT: Application Bootstrap File
 *
 * PURPOSE:
 *  - Initialize Express app
 *  - Configure global middleware
 *  - Register API routes
 *  - Serve frontend
 *  - Handle errors
 *  - Start HTTP server
 *  - Handle graceful shutdown
 * =========================================================
 */

// =========================================================
// 📦 CORE DEPENDENCIES
// =========================================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// =========================================================
// 🔐 SECURITY & PERFORMANCE MIDDLEWARE
// =========================================================
const helmet = require("helmet"); // Security headers
const cors = require("cors"); // Cross-origin access
const rateLimit = require("express-rate-limit"); // Rate limiting
const compression = require("compression"); // Gzip compression
const cookieParser = require("cookie-parser"); // Cookie parsing

// =========================================================
// 🗄 DATABASE
// =========================================================
const pool = require("./db");
const { logEvent } = require("./utils/runtime-log");

// =========================================================
// 🚀 CREATE EXPRESS APP
// =========================================================
const app = express();
const publicDir = path.join(__dirname, "public");
const htmlTemplateCache = new Map();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "1mb";
const URLENCODED_BODY_LIMIT = process.env.URLENCODED_BODY_LIMIT || "200kb";
const STATIC_ASSET_CACHE_MS =
  process.env.NODE_ENV === "production" ? ONE_DAY_MS : 0;
const PROCESS_STARTED_AT = Date.now();
const PORT = process.env.PORT || 8080;
const ENABLE_REQUEST_LOGS = process.env.ENABLE_REQUEST_LOGS === "true";
const REQUEST_LOG_SLOW_MS = readPositiveInt(
  process.env.REQUEST_LOG_SLOW_MS,
  1500,
);
const READINESS_ROUTE_PATHS = new Set([
  "/health",
  "/api/health",
  "/healthz",
  "/api/healthz",
  "/ready",
  "/api/ready",
  "/readyz",
  "/api/readyz",
]);
const LIVENESS_ROUTE_PATHS = new Set([
  "/live",
  "/api/live",
  "/livez",
  "/api/livez",
]);

let server = null;
let isShuttingDown = false;

// Required for deployment platforms like Railway / Render
app.set("trust proxy", 1);
app.disable("x-powered-by");

logEvent("info", "app_bootstrap_started", {
  pid: process.pid,
  nodeVersion: process.version,
  env: process.env.NODE_ENV || "development",
  port: Number(PORT),
  publicDirExists: fs.existsSync(publicDir),
  requestLoggingEnabled: ENABLE_REQUEST_LOGS,
  requestLogSlowMs: REQUEST_LOG_SLOW_MS,
  baseUrlConfigured: Boolean(process.env.BASE_URL),
});

// =========================================================
// 🌐 GLOBAL MIDDLEWARE CONFIGURATION
// =========================================================

/**
 * Enable CORS
 * Allows frontend to send cookies & requests
 */
function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrigin(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    return new URL(rawValue).origin;
  } catch (_error) {
    return "";
  }
}

function buildAllowedOrigins() {
  const explicitOrigins = String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  if (explicitOrigins.length) {
    return explicitOrigins;
  }

  if (process.env.NODE_ENV !== "production") {
    return [
      "http://localhost:3000",
      "http://localhost:4000",
      "http://localhost:5173",
      "http://localhost:8080",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:4000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:8080",
    ];
  }

  const baseOrigin = normalizeOrigin(process.env.BASE_URL);
  if (baseOrigin) {
    return [baseOrigin];
  }

  return [];
}

const allowedOrigins = new Set(buildAllowedOrigins());
const nonceDirective = (_req, res) => `'nonce-${res.locals.cspNonce}'`;

function normalizePathname(value) {
  const pathname = String(value || "").split("?")[0].trim();

  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/, "") || "/";
}

function getRequestPath(req) {
  return normalizePathname(req.originalUrl || req.url || req.path);
}

function isHealthRoutePath(pathname) {
  return (
    READINESS_ROUTE_PATHS.has(pathname) || LIVENESS_ROUTE_PATHS.has(pathname)
  );
}

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getMemoryUsageMb() {
  const usage = process.memoryUsage();
  return {
    rss: roundTo(usage.rss / (1024 * 1024)),
    heapTotal: roundTo(usage.heapTotal / (1024 * 1024)),
    heapUsed: roundTo(usage.heapUsed / (1024 * 1024)),
    external: roundTo(usage.external / (1024 * 1024)),
  };
}

function buildDbHealth() {
  const dbState = pool.dbState || {};
  const isReady = typeof pool.isReady === "function" ? pool.isReady() : false;

  return {
    status: isReady ? "ready" : dbState.status || "unknown",
    ready: isReady,
    readyAt: dbState.readyAt || null,
    lastError: dbState.lastError || null,
    lastErrorAt: dbState.lastErrorAt || null,
  };
}

function buildHealthPayload(kind) {
  const db = buildDbHealth();
  const ok = kind === "liveness" ? !isShuttingDown : db.ready && !isShuttingDown;

  return {
    status: ok ? "ok" : "degraded",
    kind,
    service: "india-inventory-management",
    uptimeSeconds: roundTo(process.uptime(), 3),
    timestamp: new Date().toISOString(),
    port: Number(PORT),
    nodeVersion: process.version,
    shuttingDown: isShuttingDown,
    serverListening: Boolean(server && server.listening),
    db,
    memoryMb: getMemoryUsageMb(),
  };
}

function sendHealthResponse(res, kind) {
  const payload = buildHealthPayload(kind);
  res.set("Cache-Control", "no-store");
  res.status(payload.status === "ok" ? 200 : 503).json(payload);
}

function getHtmlTemplate(fileName) {
  if (htmlTemplateCache.has(fileName)) {
    return htmlTemplateCache.get(fileName);
  }

  const fullPath = path.join(publicDir, fileName);
  const template = fs.readFileSync(fullPath, "utf8");
  htmlTemplateCache.set(fileName, template);
  return template;
}

function applyHtmlCacheHeaders(res) {
  res.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  res.set("Pragma", "no-cache");
}

function setStaticAssetCacheHeaders(res, filePath) {
  if (/\.html?$/i.test(filePath)) {
    applyHtmlCacheHeaders(res);
    return;
  }

  if (
    STATIC_ASSET_CACHE_MS > 0 &&
    /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i.test(filePath)
  ) {
    res.set(
      "Cache-Control",
      `public, max-age=${Math.floor(STATIC_ASSET_CACHE_MS / 1000)}, must-revalidate`,
    );
    return;
  }

  res.set("Cache-Control", "no-cache");
}

function sendHtmlTemplate(res, fileName, statusCode = 200) {
  const html = getHtmlTemplate(fileName).replace(
    /__CSP_NONCE__/g,
    res.locals.cspNonce || "",
  );

  applyHtmlCacheHeaders(res);
  res.status(statusCode).type("html").send(html);
}

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const requestId = req.get("x-request-id") || crypto.randomUUID();

  req.requestId = requestId;
  res.set("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const pathName = getRequestPath(req);
    const shouldLog =
      ENABLE_REQUEST_LOGS ||
      res.statusCode >= 500 ||
      durationMs >= REQUEST_LOG_SLOW_MS ||
      (isHealthRoutePath(pathName) && res.statusCode >= 400);

    if (!shouldLog) {
      return;
    }

    logEvent(
      res.statusCode >= 500 ? "error" : durationMs >= REQUEST_LOG_SLOW_MS
        ? "warn"
        : "info",
      "http_request",
      {
        requestId,
        method: req.method,
        path: pathName,
        statusCode: res.statusCode,
        durationMs: roundTo(durationMs, 2),
        ip: req.ip,
        userAgent: req.get("user-agent") || null,
        responseLength: res.getHeader("content-length") || null,
      },
    );
  });

  next();
});

app.get(Array.from(READINESS_ROUTE_PATHS), (req, res) => {
  sendHealthResponse(res, "readiness");
});

app.get(Array.from(LIVENESS_ROUTE_PATHS), (req, res) => {
  sendHealthResponse(res, "liveness");
});

app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: JSON_BODY_LIMIT })); // Parse incoming JSON requests
app.use(express.urlencoded({ extended: false, limit: URLENCODED_BODY_LIMIT }));
app.use(cookieParser()); // Parse cookies from client
app.use(compression({ threshold: 1024 })); // Compress larger responses only

// Rate Limiter
// Max 200 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip(req) {
    return isHealthRoutePath(getRequestPath(req));
  },
});
app.use("/api", limiter);

// =========================================================
// 🛡 CONTENT SECURITY POLICY (Helmet)
// Allows required CDN for Bootstrap & FontAwesome
// =========================================================
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
      "object-src": ["'none'"],
      "script-src": [
        "'self'",
        nonceDirective,
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
      ],
      "script-src-attr": ["'none'"],
      "style-src": [
        "'self'",
        nonceDirective,
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
      ],
      "style-src-attr": ["'none'"],
      "img-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
      "font-src": [
        "'self'",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
      ],
      "connect-src": [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
      ],
    },
  }),
);
app.use(helmet.frameguard({ action: "deny" }));
app.use(helmet.noSniff());
app.use(helmet.referrerPolicy({ policy: "same-origin" }));

// =========================================================
// 📡 API ROUTES REGISTRATION
// =========================================================
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/inventory"));
app.use("/api", require("./routes/business"));
app.use("/api", require("./routes/invoices"));

// =========================================================
// ❤️ HEALTH CHECK ROUTE (Railway stability)
// =========================================================
app.get(Array.from(READINESS_ROUTE_PATHS), (req, res) => {
  sendHealthResponse(res, "readiness");
});

app.get(Array.from(LIVENESS_ROUTE_PATHS), (req, res) => {
  sendHealthResponse(res, "liveness");
});

// =========================================================
// 🛠 DEBUG ROUTES (Only in Development Mode)
// =========================================================
if (
  process.env.NODE_ENV !== "production" &&
  process.env.ENABLE_DEBUG_ROUTES === "true"
) {
  // Check environment variables
  app.get("/debug-env", (req, res) => {
    res.json({
      NODE_ENV: process.env.NODE_ENV || "not set",
      PORT: process.env.PORT || "not set",
      DATABASE_URL: process.env.DATABASE_URL ? "✅ exists" : "❌ missing",
      JWT_SECRET: process.env.JWT_SECRET ? "✅ exists" : "❌ missing",
      BASE_URL: process.env.BASE_URL ? "✅ exists" : "❌ missing",
      MAIL_RELAY_URL: process.env.MAIL_RELAY_URL ? "✅ exists" : "❌ missing",
      MAIL_RELAY_KEY: process.env.MAIL_RELAY_KEY ? "✅ exists" : "❌ missing",
    });
  });

  // Test database connectivity
  app.get("/debug-db", async (req, res) => {
    try {
      const result = await pool.query("SELECT NOW()");
      res.json({ status: "✅ DB Connected", time: result.rows[0] });
    } catch (err) {
      res.status(500).json({ status: "❌ DB Error", message: err.message });
    }
  });
}

// =========================================================
// 🌍 FRONTEND STATIC FILE SERVING
// =========================================================
app.get("/", (req, res) => {
  sendHtmlTemplate(res, "login.html");
});

app.get("/login.html", (req, res) => {
  sendHtmlTemplate(res, "login.html");
});

app.get("/index.html", (req, res) => {
  sendHtmlTemplate(res, "index.html");
});

app.get("/invoice.html", (req, res) => {
  sendHtmlTemplate(res, "invoice.html");
});

app.get("/reset.html", (req, res) => {
  sendHtmlTemplate(res, "reset.html");
});

app.use(
  express.static(publicDir, {
    etag: true,
    lastModified: true,
    maxAge: STATIC_ASSET_CACHE_MS,
    setHeaders: setStaticAssetCacheHeaders,
  }),
);

/**
 * Fallback Route
 * - If API → return JSON 404
 * - Else → return login page
 */
app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API route not found" });
  }
  sendHtmlTemplate(res, "login.html");
});

// =========================================================
// 🔥 GLOBAL ERROR HANDLER
// Catches unhandled errors from anywhere in app
// =========================================================
app.use((err, req, res, next) => {
  console.error("🔥 Global Error:", err);

  logEvent("error", "http_unhandled_error", {
    requestId: req.requestId || null,
    method: req.method,
    path: getRequestPath(req),
    error: err,
  });

  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// =========================================================
// 🚀 START SERVER
// =========================================================
server = app.listen(PORT, "0.0.0.0", () => {
  logEvent("info", "http_server_listening", {
    host: "0.0.0.0",
    port: Number(PORT),
    uptimeSeconds: roundTo((Date.now() - PROCESS_STARTED_AT) / 1000, 3),
    allowedOriginsCount: allowedOrigins.size,
  });
  console.log(`🚀 Server running on port ${PORT}`);
});

// =========================================================
// 🛑 GRACEFUL SHUTDOWN
// Handles container shutdown safely
// =========================================================
server.on("error", (error) => {
  logEvent("error", "http_server_error", {
    host: "0.0.0.0",
    port: Number(PORT),
    error,
  });
});

server.keepAliveTimeout = 65 * 1000;
server.headersTimeout = 66 * 1000;
server.requestTimeout = 120 * 1000;

pool.readyPromise
  .then(() => {
    logEvent("info", "application_ready", {
      port: Number(PORT),
      uptimeSeconds: roundTo((Date.now() - PROCESS_STARTED_AT) / 1000, 3),
    });
  })
  .catch((error) => {
    logEvent("error", "application_dependency_init_failed", {
      error,
      port: Number(PORT),
    });
  });

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logEvent("warn", "shutdown_requested", {
    signal,
    uptimeSeconds: roundTo(process.uptime(), 3),
    memoryMb: getMemoryUsageMb(),
  });
  console.log(`${signal} received. Closing server...`);

  const forcedShutdownTimer = setTimeout(() => {
    logEvent("error", "shutdown_forced_timeout", {
      signal,
      timeoutMs: 10 * 1000,
    });
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10 * 1000);
  forcedShutdownTimer.unref();

  server.close(async () => {
    clearTimeout(forcedShutdownTimer);
    logEvent("info", "http_server_closed", {
      signal,
    });
    console.log("HTTP server closed.");

    try {
      await pool.end();
      logEvent("info", "db_pool_closed", {
        signal,
      });
      console.log("PostgreSQL pool closed.");
      process.exit(0);
    } catch (error) {
      logEvent("error", "db_pool_close_failed", {
        signal,
        error,
      });
      console.error("Error closing PostgreSQL pool:", error);
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));

// =========================================================
// ⚠ GLOBAL PROCESS ERROR HANDLERS
// =========================================================
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (err) => {
  logEvent("error", "process_unhandled_rejection", {
    error: err,
  });
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  logEvent("error", "process_uncaught_exception", {
    error: err,
  });
  console.error("Uncaught Exception:", err);
});
