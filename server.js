require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Load DB connection
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// 👉 API routes
const authRoutes = require("./routes/auth");
const inventoryRoutes = require("./routes/inventory");

app.use("/api/auth", authRoutes);
app.use("/api", inventoryRoutes);

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
