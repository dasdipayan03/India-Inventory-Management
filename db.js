const { Pool } = require("pg");

console.log(">>> From db.js, DB_URL =", process.env.DB_URL);

const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL from db.js"))
  .catch(err => console.error("❌ DB Error in db.js:", err.message));

module.exports = pool;
