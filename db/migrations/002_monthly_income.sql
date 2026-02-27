CREATE TABLE IF NOT EXISTS gp_monthly_income (
  id SERIAL PRIMARY KEY,
  month TEXT UNIQUE NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  net_salary NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (net_salary >= 0),
  extra_income NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (extra_income >= 0),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gp_monthly_income_month ON gp_monthly_income(month);

DROP TRIGGER IF EXISTS trg_gp_monthly_income_updated_at ON gp_monthly_income;
CREATE TRIGGER trg_gp_monthly_income_updated_at
BEFORE UPDATE ON gp_monthly_income
FOR EACH ROW
EXECUTE PROCEDURE gp_set_updated_at();
