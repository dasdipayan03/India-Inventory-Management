//middleware/auth.js
const jwt = require("jsonwebtoken");

// -------------------- ENV CHECK --------------------
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET not found in environment variables.");
  process.exit(1);
}

// -------------------- AUTH MIDDLEWARE --------------------
function authMiddleware(req, res, next) {
  try {
    let token = null;

    // 1️⃣ Authorization header
    const header = req.headers["authorization"];
    if (header && header.startsWith("Bearer ")) {
      token = header.split(" ")[1];
    }

    // 2️⃣ Cookie fallback (for downloads)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // attach user info
    next();

  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("JWT verification failed:", err.message);
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// -------------------- USER ID HELPER --------------------
function getUserId(req) {
  if (!req.user || !req.user.id) {
    throw new Error("Missing user_id in request context");
  }
  return req.user.id;
}

module.exports = { authMiddleware, getUserId };
