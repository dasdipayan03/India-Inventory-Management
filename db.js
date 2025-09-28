const { Pool } = require("pg");

console.log(">>> From db.js, DATABASE_URL =", process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false, // required for Render
  },
});

module.exports = pool;
