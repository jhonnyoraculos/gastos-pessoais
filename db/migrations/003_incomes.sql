CREATE TABLE IF NOT EXISTS gp_incomes (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  category_id INT NOT NULL REFERENCES gp_categories(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method IN ('Pix', 'Cartão', 'Dinheiro', 'Outro')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gp_incomes_date ON gp_incomes(date);
CREATE INDEX IF NOT EXISTS idx_gp_incomes_category_id ON gp_incomes(category_id);
CREATE INDEX IF NOT EXISTS idx_gp_incomes_method ON gp_incomes(method);

DROP TRIGGER IF EXISTS trg_gp_incomes_updated_at ON gp_incomes;
CREATE TRIGGER trg_gp_incomes_updated_at
BEFORE UPDATE ON gp_incomes
FOR EACH ROW
EXECUTE PROCEDURE gp_set_updated_at();
