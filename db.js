// db.js
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set!");
}

console.log("🌍 DATABASE_URL (masked):", process.env.DATABASE_URL.replace(/:\/\/.*@/, "://****:****@"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test connection
(async () => {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Connected to PostgreSQL at", process.env.DATABASE_URL);
    console.log("Server Time:", result.rows[0]);
  } catch (err) {
    console.error("❌ DB Connection Error:", err);
  }
})();

module.exports = pool;
