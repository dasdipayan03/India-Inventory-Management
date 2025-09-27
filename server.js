// Load dotenv only in development
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const cors = require("cors");
const path = require("path");

// Load DB connection
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// 👉 Sanity check for env vars
if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error("❌ Missing DATABASE_URL or JWT_SECRET in environment!");
  process.exit(1);
}

// 👉 API routes
const authRoutes = require("./routes/auth");
const inventoryRoutes = require("./routes/inventory");

app.use("/api/auth", authRoutes);
app.use("/api", inventoryRoutes);

// 👉 Health check route
app.get("/health", (req, res) => {
  res.json({ status: "Server running 🚀", time: new Date() });
});

// 👉 DB Test Route
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "DB Connected ✅", time: result.rows[0] });
  } catch (err) {
    console.error("❌ DB Test Error:", err);
    res.status(500).json({ status: "DB Error", message: err.message });
  }
});

// 👉 Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// 👉 Catch-all for frontend (must be last)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Debug: Show environment variables (safe subset)
app.get("/debug-env", (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV || "not set",
    PORT: process.env.PORT || "not set",
    DATABASE_URL: process.env.DATABASE_URL ? "✅ exists" : "❌ missing",
    JWT_SECRET: process.env.JWT_SECRET ? "✅ exists" : "❌ missing"
  });
});

// Debug: Test DB connection
app.get("/debug-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "✅ DB Connected", time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: "❌ DB Error", message: err.message });
  }
});



const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// 👉 Handle unhandled promise rejections (safety)
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
  process.exit(1);
});
