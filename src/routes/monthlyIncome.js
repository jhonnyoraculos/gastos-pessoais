const express = require('express');
const pool = require('../db/pool');
const {
  parseMonth,
  toMoney,
  validateMonthlyIncomePayload,
} = require('../utils/validators');

const router = express.Router();

function formatRow(row) {
  const netSalary = toMoney(row.net_salary);
  const extraIncome = toMoney(row.extra_income);
  return {
    month: row.month,
    net_salary: netSalary,
    extra_income: extraIncome,
    salary_total: toMoney(netSalary + extraIncome),
    updated_at: row.updated_at || null,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const month = req.query.month ? parseMonth(String(req.query.month)) : null;
    if (req.query.month && !month) {
      return res.status(400).json({ error: 'month deve estar no formato YYYY-MM.' });
    }

    if (month) {
      const result = await pool.query(
        `
          SELECT month, net_salary, extra_income, updated_at
          FROM gp_monthly_income
          WHERE month = $1
        `,
        [month]
      );

      if (!result.rows.length) {
        return res.json({
          month,
          net_salary: 0,
          extra_income: 0,
          salary_total: 0,
          updated_at: null,
          exists: false,
        });
      }

      return res.json({
        ...formatRow(result.rows[0]),
        exists: true,
      });
    }

    const result = await pool.query(
      `
        SELECT month, net_salary, extra_income, updated_at
        FROM gp_monthly_income
        ORDER BY month DESC
        LIMIT 24
      `
    );

    return res.json({
      items: result.rows.map((row) => ({
        ...formatRow(row),
        exists: true,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:month', async (req, res, next) => {
  try {
    const month = parseMonth(String(req.params.month || ''));
    if (!month) {
      return res.status(400).json({ error: 'month deve estar no formato YYYY-MM.' });
    }

    const { errors, value } = validateMonthlyIncomePayload(req.body, { partial: false });
    if (errors.length) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const result = await pool.query(
      `
        INSERT INTO gp_monthly_income (month, net_salary, extra_income)
        VALUES ($1, $2, $3)
        ON CONFLICT (month)
        DO UPDATE
          SET net_salary = EXCLUDED.net_salary,
              extra_income = EXCLUDED.extra_income,
              updated_at = now()
        RETURNING month, net_salary, extra_income, updated_at
      `,
      [month, value.net_salary, value.extra_income]
    );

    return res.json({
      ...formatRow(result.rows[0]),
      exists: true,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:month', async (req, res, next) => {
  try {
    const month = parseMonth(String(req.params.month || ''));
    if (!month) {
      return res.status(400).json({ error: 'month deve estar no formato YYYY-MM.' });
    }

    const result = await pool.query('DELETE FROM gp_monthly_income WHERE month = $1', [month]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Registro mensal nao encontrado.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
