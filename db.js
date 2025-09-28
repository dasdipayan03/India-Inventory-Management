const { Pool } = require("pg");

console.log(">>> From db.js, DATABASE_URL =", process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL from db.js"))
  .catch(err => console.error("❌ DB Error in db.js:", err.message));

module.exports = pool;
