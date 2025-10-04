// india_inventory_management_app/middleware/auth.js
const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // attach user info to request
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function getUserId(req) {
  if (!req.user || !req.user.id) {
    throw new Error("Missing user_id");
  }
  return req.user.id;
}

module.exports = { authMiddleware, getUserId };
