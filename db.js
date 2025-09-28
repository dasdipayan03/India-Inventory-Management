const { Pool } = require("pg");

// Debug log — helps verify which DB URL is being used
console.log("DATABASE_URL from env:", process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required on Render
  },
});

// Optional test connection at startup
pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) =>
    console.error("❌ DB Connection Error:", err.message)
  );

module.exports = pool;
