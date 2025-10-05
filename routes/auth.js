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

// --- Added /me endpoint for frontend token verification ---
const jwt = require("jsonwebtoken");
const pool = require("../db");

router.get("/me", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query("SELECT id, name, email FROM users WHERE id=$1", [decoded.id]);
    if (!result || result.rowCount === 0) return res.status(401).json({ error: "Invalid user" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("/me error:", err.message);
    res.status(401).json({ error: "Unauthorized" });
  }
});
