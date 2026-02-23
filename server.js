// server.js
// require("dotenv").config(); // for local run, safe on Railway too

const rateLimit = require("express-rate-limit");
const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser"); // ✅ ADD
const pool = require("./db");

const app = express();
app.set("trust proxy", 1);

// -------------------- MIDDLEWARE --------------------
app.use(cors({
  origin: true,
  credentials: true, // ✅ cookie allow
}));
app.use(express.json());
app.use(cookieParser());
app.use(compression());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // 15 min e 200 request
});

app.use(limiter);


// ✅ Helmet: allow CDN + inline scripts for Bootstrap, FontAwesome
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": [
        "'self'",
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net"
      ],
      "style-src": [
        "'self'",
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net"
      ],
      "img-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
      "font-src": [
        "'self'",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net"
      ],
      "connect-src": [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],
    },
  })
);

// -------------------- ROUTES --------------------
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/inventory"));
app.use("/api", require("./routes/invoices")); // ✅ invoice routes

// -------------------- DEBUG ROUTES --------------------
if (process.env.NODE_ENV !== "production") {

  app.get("/debug-env", (req, res) => {
    res.json({
      NODE_ENV: process.env.NODE_ENV || "not set",
      PORT: process.env.PORT || "not set",
      DATABASE_URL: process.env.DATABASE_URL ? "✅ exists" : "❌ missing",
      JWT_SECRET: process.env.JWT_SECRET ? "✅ exists" : "❌ missing",
      EMAIL_USER: process.env.EMAIL_USER ? "✅ exists" : "❌ missing",
      EMAIL_PASS: process.env.EMAIL_PASS ? "✅ exists" : "❌ missing",
    });
  });

  app.get("/debug-db", async (req, res) => {
    try {
      const result = await pool.query("SELECT NOW()");
      res.json({ status: "✅ DB Connected", time: result.rows[0] });
    } catch (err) {
      res.status(500).json({ status: "❌ DB Error", message: err.message });
    }
  });

}

// -------------------- FRONTEND --------------------
app.use(express.static(path.join(__dirname, "public")));

// ✅ Default route: login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ✅ Fallback (non-API → login.html, API → JSON 404)
app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API route not found" });
  }
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// -------------------- GLOBAL ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  console.error("🔥 Global Error:", err);

  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development"
      ? err.message
      : "Something went wrong"
  });
});


// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown (Railway container stop)
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received. Closing server...");

  server.close(async () => {
    console.log("🔌 HTTP server closed.");

    await pool.end();
    console.log("🔌 PostgreSQL pool closed.");

    process.exit(0);
  });
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// optional Loader.io verification
// app.get('/loaderio-xxxx.txt', (req, res) => {
//   res.type('text/plain').send('loaderio-xxxx');
// });
