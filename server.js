// server.js - upgraded by assistant
const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const pool = require("./db");
const verifyToken = require("./middleware/auth");

const app = express();

app.use(cors());
app.use(express.json());
app.use(compression());

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
      "img-src": ["'self'", "data:"],
      "font-src": ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"]
    }
  })
);

// Keep your existing API route mounts
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/inventory"));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Public login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Protected dashboard route - backend checks token before serving
app.get("/dashboard", verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// API 404 => JSON, other unknown routes => login page
app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API route not found" });
  }
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
