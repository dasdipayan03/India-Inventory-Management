// db.js
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not defined");
  process.exit(1);
}

// Create a global connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});

// Optional: Listen for connection and error events
pool.on("connect", () => {
  console.log("✅ PostgreSQL pool connected");
});

pool.on("error", (err) => {
  console.error("⚠️ Unexpected PostgreSQL error:", err);
  // Don’t exit here — allow auto-reconnect
});

// Export pool for use in queries
module.exports = pool;
