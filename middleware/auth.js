// middleware/auth.js
const jwt = require("jsonwebtoken");

// -------------------- ENV CHECK --------------------
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET not found in environment variables.");
  process.exit(1);
}

// -------------------- AUTH MIDDLEWARE --------------------
function authMiddleware(req, res, next) {
  const header = req.headers["authorization"];

  // ✅ Support BOTH:
  // 1. Authorization: Bearer <token>  (fetch calls)
  // 2. Cookie: token=<token>           (window.location.href downloads)
  const token =
    header && header.startsWith("Bearer ")
      ? header.split(" ")[1]
      : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // attach user info to request
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
