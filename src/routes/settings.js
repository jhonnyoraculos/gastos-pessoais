const express = require('express');
const pool = require('../db/pool');
const { toMoney, validateSettingsPayload } = require('../utils/validators');

const router = express.Router();

async function ensureSettings() {
  await pool.query('INSERT INTO gp_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const result = await pool.query(
    `
      SELECT id, monthly_budget, net_salary, extra_income, payday_day, updated_at
      FROM gp_settings
      WHERE id = 1
    `
  );
  return result.rows[0];
}

function formatSettings(row) {
  const netSalary = toMoney(row.net_salary);
  const extraIncome = toMoney(row.extra_income);
  const monthlyBudget = toMoney(row.monthly_budget);

  return {
    net_salary: netSalary,
    extra_income: extraIncome,
    payday_day: Number(row.payday_day),
    monthly_budget: monthlyBudget,
    salary_total: toMoney(netSalary + extraIncome),
    updated_at: row.updated_at,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    res.json(formatSettings(settings));
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const { errors, value } = validateSettingsPayload(req.body, { partial: true });
    if (errors.length) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const current = await ensureSettings();
    const merged = {
      net_salary: value.net_salary ?? toMoney(current.net_salary),
      extra_income: value.extra_income ?? toMoney(current.extra_income),
      monthly_budget: value.monthly_budget ?? toMoney(current.monthly_budget),
      payday_day: value.payday_day ?? Number(current.payday_day),
    };

    const result = await pool.query(
      `
        UPDATE gp_settings
        SET
          net_salary = $1,
          extra_income = $2,
          monthly_budget = $3,
          payday_day = $4,
          updated_at = now()
        WHERE id = 1
        RETURNING id, monthly_budget, net_salary, extra_income, payday_day, updated_at
      `,
      [merged.net_salary, merged.extra_income, merged.monthly_budget, merged.payday_day]
    );

    res.json(formatSettings(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
