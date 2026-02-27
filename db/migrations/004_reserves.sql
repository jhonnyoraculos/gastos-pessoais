CREATE TABLE IF NOT EXISTS gp_reserves (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('Aporte', 'Resgate')),
  method TEXT NOT NULL CHECK (method IN ('Pix', 'Cartão', 'Dinheiro', 'Outro')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gp_reserves_date ON gp_reserves(date);
CREATE INDEX IF NOT EXISTS idx_gp_reserves_movement_type ON gp_reserves(movement_type);

DROP TRIGGER IF EXISTS trg_gp_reserves_updated_at ON gp_reserves;
CREATE TRIGGER trg_gp_reserves_updated_at
BEFORE UPDATE ON gp_reserves
FOR EACH ROW
EXECUTE PROCEDURE gp_set_updated_at();
