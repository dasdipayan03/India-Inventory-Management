const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const pool = require("./db");

const app = express();

// -------------------- MIDDLEWARE --------------------
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());

// -------------------- ROUTES --------------------
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/inventory"));

// -------------------- DEBUG ROUTES --------------------
app.get("/debug-env", (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV || "not set",
    PORT: process.env.PORT || "not set",
    DATABASE_URL: process.env.DATABASE_URL ? "✅ exists" : "❌ missing",
    JWT_SECRET: process.env.JWT_SECRET ? "✅ exists" : "❌ missing"
  });
});

app.get("/debug-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "✅ DB Connected", time: result.rows[0] });
  } catch (err) {
    console.error("❌ DB Error:", err);
    res.status(500).json({ status: "❌ DB Error", message: err.message });
  }
});

// -------------------- FRONTEND --------------------

// ✅ Serve static frontend files (all .html, .css, .js)
app.use(express.static(path.join(__dirname, "public")));

// ✅ Default route goes to login.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ✅ Optional fallback for unknown files (optional)
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "login.html"));
});


// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("🌐 Listening on all interfaces (0.0.0.0)");
});
