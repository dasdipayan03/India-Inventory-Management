// db.js
const { Pool } = require("pg");

// ✅ Log the env check early
console.log("🔍 Loaded DATABASE_URL:", process.env.DATABASE_URL ? "✅ Exists" : "❌ Missing");

if (!process.env.DATABASE_URL) {
  console.error("🚨 ERROR: DATABASE_URL is not defined in environment!");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false, // Required for Render SSL
  },
});

pool.connect()
  .then(() => console.log("✅ PostgreSQL connected successfully"))
  .catch((err) => {
    console.error("❌ Database connection error:", err.message);
    process.exit(1);
  });

module.exports = pool;
