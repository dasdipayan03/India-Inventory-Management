// db.js
const { Pool } = require("pg");

// -------------------- VALIDATE ENV --------------------
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not defined in environment variables.");
  process.exit(1);
}

// -------------------- CREATE CONNECTION POOL --------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { require: true, rejectUnauthorized: false }
    : false,
  max: 10, // ✅ Limit concurrent DB connections (safe for Railway free tier)
  idleTimeoutMillis: 30000, // ✅ Close idle connections after 30s
  connectionTimeoutMillis: 5000, // ✅ Prevent long hangs if DB is unreachable
});

// -------------------- CONNECTION CHECK --------------------
pool.connect()
  .then(() => console.log("✅ PostgreSQL connected successfully"))
  .catch((err) => console.error("❌ Database connection error:", err.message));

// -------------------- EXPORT POOL --------------------
module.exports = pool;
