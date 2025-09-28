const { Pool } = require("pg");

console.log(">>> From db.js, DB_URL =", process.env.DB_URL);

const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false, // required for Render
  },
});

module.exports = pool;
