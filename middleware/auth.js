/**
 * =========================================================
 * FILE: middleware/auth.js
 * MODULE: Authentication Middleware
 * PURPOSE:
 *  - Verify JWT token
 *  - Attach authenticated user to request
 *  - Provide helper to extract user ID
 * =========================================================
 */
const jwt = require("jsonwebtoken");



// =========================================================
// 🔐 ENVIRONMENT CONFIGURATION CHECK
// Ensures JWT_SECRET exists before server starts
// =========================================================
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET not found in environment variables.");
  process.exit(1);
}

// =========================================================
// 🔐 AUTHENTICATION MIDDLEWARE
// Verifies JWT from:
//   1️⃣ Authorization Header (Bearer token)
//   2️⃣ Cookie (fallback for downloads / navigation)
// If valid → attaches decoded user to req.user
// If invalid → returns 401 Unauthorized
// =========================================================
function authMiddleware(req, res, next) {
  try {

    // 1️⃣ Extract Token
    let token = null;

    // Check Authorization Header
    const header = req.headers["authorization"];
    if (header && header.startsWith("Bearer ")) {
      token = header.split(" ")[1];
    }

    // Fallback: Check Cookie (for file downloads)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    // 2️⃣ If No Token → Reject
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    // 3️⃣ Verify JWT Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach user data to request object
    req.user = decoded;
    // Continue to next middleware / route
    next();
  } catch (err) {
    // Log detailed error only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("JWT verification failed:", err.message);
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// =========================================================
// 👤 USER ID HELPER
// Safely extracts authenticated user's ID from req.user
// Used inside routes to ensure user context exists
// =========================================================
function getUserId(req) {
  if (!req.user || !req.user.id) {
    throw new Error("Missing user_id in request context");
  }
  return req.user.id;
}
// 📦 EXPORTS
module.exports = { authMiddleware, getUserId };
