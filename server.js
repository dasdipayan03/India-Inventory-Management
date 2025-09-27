require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 👉 Load API routes BEFORE frontend catch-all
const authRoutes = require("./routes/auth");
const inventoryRoutes = require("./routes/inventory");

app.use("/api/auth", authRoutes);
app.use("/api", inventoryRoutes);

// 👉 Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// 👉 Catch-all for frontend (must be last)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
