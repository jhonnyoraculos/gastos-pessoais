const express = require('express');
const pool = require('../db/pool');
const {
  parseMonth,
  toMoney,
  validateCreditCardMonthlyPayload,
} = require('../utils/validators');

const router = express.Router();

function formatRow(row) {
  return {
    month: row.month,
    planned_amount: toMoney(row.planned_amount),
    notes: row.notes || null,
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
          SELECT month, planned_amount, notes, updated_at
          FROM gp_credit_card_monthly
          WHERE month = $1
        `,
        [month]
      );

      if (!result.rows.length) {
        return res.json({
          month,
          planned_amount: 0,
          notes: null,
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
        SELECT month, planned_amount, notes, updated_at
        FROM gp_credit_card_monthly
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

    const { errors, value } = validateCreditCardMonthlyPayload(req.body, { partial: false });
    if (errors.length) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const result = await pool.query(
      `
        INSERT INTO gp_credit_card_monthly (month, planned_amount, notes)
        VALUES ($1, $2, $3)
        ON CONFLICT (month)
        DO UPDATE
          SET planned_amount = EXCLUDED.planned_amount,
              notes = EXCLUDED.notes,
              updated_at = now()
        RETURNING month, planned_amount, notes, updated_at
      `,
      [month, value.planned_amount, value.notes ?? null]
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

    const result = await pool.query('DELETE FROM gp_credit_card_monthly WHERE month = $1', [month]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Registro mensal de cartao nao encontrado.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
