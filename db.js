// db.js
const { Pool } = require("pg");

// ✅ Check if DATABASE_URL is loaded
console.log("🔍 DATABASE_URL from env:", process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false, // Important for Render
  },
});

pool.connect()
  .then(() => console.log("✅ PostgreSQL connected successfully"))
  .catch((err) => console.error("❌ Database connection error:", err.message));

module.exports = pool;
