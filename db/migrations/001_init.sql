CREATE TABLE IF NOT EXISTS gp_categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gp_settings (
  id INT PRIMARY KEY,
  monthly_budget NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
  extra_income NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payday_day INT NOT NULL DEFAULT 1 CHECK (payday_day BETWEEN 1 AND 28),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gp_expenses (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  category_id INT NOT NULL REFERENCES gp_categories(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('Essencial', 'Besteira', 'Investimento', 'Lazer', 'Outros')),
  method TEXT NOT NULL CHECK (method IN ('Pix', 'Cartão', 'Dinheiro', 'Outro')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gp_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gp_expenses_date ON gp_expenses(date);
CREATE INDEX IF NOT EXISTS idx_gp_expenses_category_id ON gp_expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_gp_expenses_type ON gp_expenses(type);

CREATE OR REPLACE FUNCTION gp_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gp_expenses_updated_at ON gp_expenses;
CREATE TRIGGER trg_gp_expenses_updated_at
BEFORE UPDATE ON gp_expenses
FOR EACH ROW
EXECUTE PROCEDURE gp_set_updated_at();

DROP TRIGGER IF EXISTS trg_gp_settings_updated_at ON gp_settings;
CREATE TRIGGER trg_gp_settings_updated_at
BEFORE UPDATE ON gp_settings
FOR EACH ROW
EXECUTE PROCEDURE gp_set_updated_at();

INSERT INTO gp_settings (id, monthly_budget, net_salary, extra_income, payday_day)
VALUES (1, 0, 0, 0, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO gp_categories (name)
VALUES
  ('Mercado'),
  ('Aluguel'),
  ('Transporte'),
  ('Internet'),
  ('Saúde'),
  ('Educação'),
  ('Lazer')
ON CONFLICT (name) DO NOTHING;
