const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Render free DB
  },
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch(err => {
    console.error("❌ DB Connection Error:");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
  });

module.exports = pool;
