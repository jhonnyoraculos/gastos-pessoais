CREATE TABLE IF NOT EXISTS gp_credit_card_monthly (
  id SERIAL PRIMARY KEY,
  month TEXT UNIQUE NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  planned_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gp_credit_card_monthly_month ON gp_credit_card_monthly(month);

DROP TRIGGER IF EXISTS trg_gp_credit_card_monthly_updated_at ON gp_credit_card_monthly;
CREATE TRIGGER trg_gp_credit_card_monthly_updated_at
BEFORE UPDATE ON gp_credit_card_monthly
FOR EACH ROW
EXECUTE PROCEDURE gp_set_updated_at();
