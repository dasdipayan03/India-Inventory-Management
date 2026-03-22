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

// Required for deployment platforms like Railway / Render
app.set("trust proxy", 1);
app.disable("x-powered-by");

// =========================================================
// 🌐 GLOBAL MIDDLEWARE CONFIGURATION
// =========================================================

/**
 * Enable CORS
 * Allows frontend to send cookies & requests
 */
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
app.get("/health", (req, res) => {
  res.status(200).send("OK");
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
const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// =========================================================
// 🛑 GRACEFUL SHUTDOWN
// Handles container shutdown safely
// =========================================================
server.keepAliveTimeout = 65 * 1000;
server.headersTimeout = 66 * 1000;
server.requestTimeout = 120 * 1000;

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Closing server...`);

  server.close(async () => {
    console.log("HTTP server closed.");

    try {
      await pool.end();
      console.log("PostgreSQL pool closed.");
      process.exit(0);
    } catch (error) {
      console.error("Error closing PostgreSQL pool:", error);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10 * 1000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));

// =========================================================
// ⚠ GLOBAL PROCESS ERROR HANDLERS
// =========================================================
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
