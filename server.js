const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const pool = require("./db");

const app = express();

// -------------------- MIDDLEWARE --------------------
app.use(cors());
app.use(express.json());
app.use(compression());

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
      "font-src": ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
    },
  })
);

// -------------------- ROUTES --------------------
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/inventory"));

// -------------------- DEBUG ROUTES --------------------
app.get("/debug-env", (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV || "not set",
    PORT: process.env.PORT || "not set",
    DATABASE_URL: process.env.DATABASE_URL ? "✅ exists" : "❌ missing",
    JWT_SECRET: process.env.JWT_SECRET ? "✅ exists" : "❌ missing",
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

// -------------------- FRONTEND --------------------
app.use(express.static(path.join(__dirname, "public")));

// ✅ Default route: login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ✅ Fallback (non-API → login.html, API → JSON 404)
app.use((req, res) => {
  if (req.path.startsWith("/api"))
    return res.status(404).json({ error: "API route not found" });
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// replace LOADER_TOKEN with your token (string)
// app.get('/loaderio-96829aec98b43bb91c1324f1e38c518f.txt', (req, res) => {
//   res.type('text/plain').send('loaderio-96829aec98b43bb91c1324f1e38c518f');
// });


