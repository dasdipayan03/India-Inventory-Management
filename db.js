/**
 * =========================================================
 * FILE: db.js
 * MODULE: PostgreSQL Database Connection
 *
 * PURPOSE:
 *  - Create and manage a global PostgreSQL connection pool
 *  - Ensure environment variables are configured properly
 *  - Maintain stable database connectivity
 *  - Export pool for use across the application
 *
 * NOTE:
 *  This file runs once when the server starts.
 * =========================================================
 */
const { Pool } = require("pg");
const { logEvent } = require("./utils/runtime-log");

function shouldUseSsl(databaseUrl) {
  if (process.env.DB_SSL === "true") {
    return true;
  }

  if (process.env.DB_SSL === "false") {
    return false;
  }

  return !/localhost|127\.0\.0\.1/i.test(databaseUrl);
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// =========================================================
// ENVIRONMENT VARIABLE CHECK
// Ensures DATABASE_URL exists before server starts.
// Without this, database connection is impossible.
// =========================================================
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not defined");
  process.exit(1);
}

// =========================================================
// CREATE POSTGRESQL CONNECTION POOL
//
// Instead of creating a new DB connection for every request,
// we create a pool (connection manager).
//
// Why Pool?
//  - Reuses connections
//  - Improves performance
//  - Prevents DB overload
// =========================================================
const SSL_ENABLED = shouldUseSsl(process.env.DATABASE_URL);
const PG_POOL_MAX = readPositiveInt(process.env.PG_POOL_MAX, 10);
const PG_CONNECTION_TIMEOUT_MS = readPositiveInt(
  process.env.PG_CONNECTION_TIMEOUT_MS,
  10000,
);
const PG_IDLE_TIMEOUT_MS = readPositiveInt(process.env.PG_IDLE_TIMEOUT_MS, 30000);
const PG_KEEP_ALIVE_DELAY_MS = readPositiveInt(
  process.env.PG_KEEP_ALIVE_DELAY_MS,
  10000,
);
const PG_MAX_USES = readPositiveInt(process.env.PG_MAX_USES, 7500);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: SSL_ENABLED
    ? {
        require: true,
        rejectUnauthorized: false,
      }
    : false,
  max: PG_POOL_MAX,
  connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
  keepAlive: true,
  keepAliveInitialDelayMillis: PG_KEEP_ALIVE_DELAY_MS,
  maxUses: PG_MAX_USES,
});

const dbState = {
  startedAt: new Date().toISOString(),
  status: "starting",
  readyAt: null,
  lastError: null,
  lastErrorAt: null,
};

// =========================================================
// GLOBAL ERROR LISTENER
// =========================================================
pool.on("error", (err) => {
  dbState.lastError = err.message;
  dbState.lastErrorAt = new Date().toISOString();
  logEvent("error", "db_pool_error", { error: err });
});

async function ensureSchemaCompatibility() {
  await pool.query(`
    ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS default_profit_percent NUMERIC(8,2) NOT NULL DEFAULT 30.00
  `);

  await pool.query(`
    ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0
  `);

  await pool.query(`
    UPDATE sales AS s
    SET cost_price = COALESCE(i.buying_rate, 0)
    FROM items AS i
    WHERE i.id = s.item_id
      AND (s.cost_price IS NULL OR s.cost_price = 0)
  `);

  await pool.query(`
    ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash'
  `);

  await pool.query(`
    ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'paid'
  `);

  await pool.query(`
    ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12,2) NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE debts
    ADD COLUMN IF NOT EXISTS invoice_id INT REFERENCES invoices(id) ON DELETE SET NULL
  `);

  await pool.query(`
    UPDATE invoices
    SET amount_paid = total_amount,
        amount_due = 0
    WHERE payment_status = 'paid'
      AND amount_due = 0
      AND amount_paid = 0
      AND COALESCE(total_amount, 0) > 0
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      mobile_number VARCHAR(10),
      address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT suppliers_mobile_number_format CHECK (
        mobile_number IS NULL OR mobile_number ~ '^[0-9]{10}$'
      )
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      bill_no VARCHAR(80),
      purchase_date TIMESTAMPTZ DEFAULT NOW(),
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
      payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash',
      payment_status VARCHAR(20) NOT NULL DEFAULT 'paid',
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id SERIAL PRIMARY KEY,
      purchase_id INT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      item_name VARCHAR(200) NOT NULL,
      quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
      buying_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
      selling_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
      line_total NUMERIC(12,2) NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(160) NOT NULL,
      category VARCHAR(80) NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash',
      expense_date TIMESTAMPTZ DEFAULT NOW(),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_items_user_name
      ON items (user_id, LOWER(TRIM(name)))
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_items_user_id
      ON items (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_user_date
      ON sales (user_id, created_at)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_user_id
      ON sales (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_accounts_owner_user_id
      ON staff_accounts (owner_user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_accounts_username_lookup
      ON staff_accounts (LOWER(TRIM(username)))
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_email_lookup
      ON users (LOWER(email))
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_invoices_user_date
      ON invoices (user_id, date DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_invoices_user_id
      ON invoices (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
      ON invoice_items (invoice_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_invoice_counter_user_id
      ON user_invoice_counter (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_debts_user_id
      ON debts (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_debts_user_number_created
      ON debts (user_id, customer_number, created_at ASC, id ASC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_invoices_user_contact_due_date
      ON invoices (user_id, contact, date ASC)
      WHERE amount_due > 0
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_suppliers_user_name
      ON suppliers (user_id, LOWER(TRIM(name)))
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_suppliers_user_mobile
      ON suppliers (user_id, mobile_number)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_purchases_user_date
      ON purchases (user_id, purchase_date DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id
      ON purchases (supplier_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase
      ON purchase_items (purchase_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expenses_user_date
      ON expenses (user_id, expense_date DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_debts_invoice_id
      ON debts (invoice_id)
  `);
}

// =========================================================
// INITIAL CONNECTION TEST
// Ensures the latest schema additions are available.
// =========================================================
async function initializeDatabase() {
  const startedAt = Date.now();
  dbState.status = "connecting";

  logEvent("info", "db_init_started", {
    sslEnabled: SSL_ENABLED,
    poolMax: PG_POOL_MAX,
    connectionTimeoutMs: PG_CONNECTION_TIMEOUT_MS,
    idleTimeoutMs: PG_IDLE_TIMEOUT_MS,
    keepAliveDelayMs: PG_KEEP_ALIVE_DELAY_MS,
    maxUses: PG_MAX_USES,
  });

  try {
    await pool.query("SELECT 1");
    logEvent("info", "db_connection_ready", {
      durationMs: Date.now() - startedAt,
    });

    dbState.status = "migrating";
    const schemaStartedAt = Date.now();
    await ensureSchemaCompatibility();

    dbState.status = "ready";
    dbState.readyAt = new Date().toISOString();
    dbState.lastError = null;
    dbState.lastErrorAt = null;

    logEvent("info", "db_schema_ready", {
      schemaDurationMs: Date.now() - schemaStartedAt,
      totalStartupMs: Date.now() - startedAt,
    });

    return dbState;
  } catch (err) {
    dbState.status = "error";
    dbState.lastError = err.message;
    dbState.lastErrorAt = new Date().toISOString();

    logEvent("error", "db_init_failed", {
      durationMs: Date.now() - startedAt,
      error: err,
    });

    throw err;
  }
}

pool.dbState = dbState;
pool.isReady = () => dbState.status === "ready";
pool.readyPromise = initializeDatabase();

module.exports = pool;
