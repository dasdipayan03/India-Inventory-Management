// db.js
const { Pool } = require("pg");

console.log("🔍 Loaded DATABASE_URL:", process.env.DATABASE_URL ? "✅ Exists" : "❌ Missing");

if (!process.env.DATABASE_URL) {
  console.error("🚨 DATABASE_URL missing! Exiting...");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});

pool.connect()
  .then(() => console.log("✅ PostgreSQL connected successfully"))
  .catch((err) => {
    console.error("❌ Database connection error:", err.stack);
    process.exit(1);
  });

module.exports = pool;
