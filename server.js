const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./db"); // Database connection

console.log("Render provided PORT:", process.env.PORT);

const app = express();

// -------------------- MIDDLEWARE --------------------
app.use(cors());
app.use(express.json());

// -------------------- API ROUTES --------------------
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/inventory"));

// -------------------- DEBUG ROUTES --------------------
// Check environment variables
app.get("/debug-env", (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV || "not set",
    PORT: process.env.PORT || "not set",
    DATABASE_URL: process.env.DATABASE_URL ? "✅ exists" : "❌ missing",
    JWT_SECRET: process.env.JWT_SECRET ? "✅ exists" : "❌ missing",
  });
});

// Test DB connection
app.get("/debug-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "✅ DB Connected", time: result.rows[0] });
  } catch (err) {
    console.error("❌ DB Error:", err);
    res.status(500).json({ status: "❌ DB Error", message: err.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "Server running 🚀", time: new Date() });
});

// -------------------- FRONTEND --------------------
// Serve static frontend files (from "public" folder)
app.use(express.static(path.join(__dirname, "public")));

// Catch-all for frontend (must be LAST)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 4000;

// 👇 Force listening on all network interfaces (required by Render)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("🌐 Listening on all interfaces (0.0.0.0)");
  console.log("🔧 NODE_ENV:", process.env.NODE_ENV);
});

// Safety: Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
  process.exit(1);
});
