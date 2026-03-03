CREATE TABLE IF NOT EXISTS gp_credit_card_purchases (
  id SERIAL PRIMARY KEY,
  start_month TEXT NOT NULL CHECK (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
  installments INT NOT NULL CHECK (installments BETWEEN 1 AND 36),
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gp_credit_card_purchase_allocations (
  id SERIAL PRIMARY KEY,
  purchase_id INT NOT NULL REFERENCES gp_credit_card_purchases(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gp_credit_card_purchases_start_month ON gp_credit_card_purchases(start_month);
CREATE INDEX IF NOT EXISTS idx_gp_credit_card_purchase_allocations_purchase_id ON gp_credit_card_purchase_allocations(purchase_id);
CREATE INDEX IF NOT EXISTS idx_gp_credit_card_purchase_allocations_month ON gp_credit_card_purchase_allocations(month);

DROP TRIGGER IF EXISTS trg_gp_credit_card_purchases_updated_at ON gp_credit_card_purchases;
CREATE TRIGGER trg_gp_credit_card_purchases_updated_at
BEFORE UPDATE ON gp_credit_card_purchases
FOR EACH ROW
EXECUTE PROCEDURE gp_set_updated_at();
