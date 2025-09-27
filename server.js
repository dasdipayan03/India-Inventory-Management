require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
dotenv.config();

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

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/inventory", require("./routes/inventory"));

// Serve frontend (for login.html, index.html)
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// 👉 Handle unhandled promise rejections (safety)
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
  process.exit(1);
});
