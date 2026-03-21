BEGIN;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE sales AS s
SET cost_price = COALESCE(i.buying_rate, 0)
FROM items AS i
WHERE i.id = s.item_id
  AND (s.cost_price IS NULL OR s.cost_price = 0);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'paid';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE invoices
SET amount_paid = total_amount,
    amount_due = 0
WHERE payment_status = 'paid'
  AND amount_due = 0
  AND amount_paid = 0
  AND COALESCE(total_amount, 0) > 0;

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
);

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
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  item_name VARCHAR(200) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  buying_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0
);

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
);

CREATE INDEX IF NOT EXISTS idx_suppliers_user_name
  ON suppliers (user_id, LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_suppliers_user_mobile
  ON suppliers (user_id, mobile_number);

CREATE INDEX IF NOT EXISTS idx_purchases_user_date
  ON purchases (user_id, purchase_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id
  ON purchases (supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase
  ON purchase_items (purchase_id);

CREATE INDEX IF NOT EXISTS idx_expenses_user_date
  ON expenses (user_id, expense_date DESC);

COMMIT;
