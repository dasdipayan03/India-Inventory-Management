BEGIN;

ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS invoice_id INT REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_debts_invoice_id
  ON debts (invoice_id);

COMMIT;
