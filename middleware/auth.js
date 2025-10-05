// middleware/auth.js/
const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const parts = authHeader.split(" ");
  if (parts.length !== 2) return res.status(401).json({ error: "Token format invalid" });

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification error:", err.message);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

module.exports = verifyToken;
