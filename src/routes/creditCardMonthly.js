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

function addMonthsToYearMonth(monthText, offset) {
  const [year, month] = String(monthText).split('-').map(Number);
  if (!year || !month) return monthText;
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + offset);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function splitIntoInstallments(totalAmount, installments) {
  const totalCents = Math.round(Number(totalAmount || 0) * 100);
  const base = Math.floor(totalCents / installments);
  const remainder = totalCents - base * installments;

  const parts = [];
  for (let index = 0; index < installments; index += 1) {
    const cents = base + (index < remainder ? 1 : 0);
    parts.push(cents / 100);
  }
  return parts;
}

async function upsertPlannedMonth(client, { month, amount, notes }) {
  const result = await client.query(
    `
      INSERT INTO gp_credit_card_monthly (month, planned_amount, notes)
      VALUES ($1, $2, $3)
      ON CONFLICT (month)
      DO UPDATE
        SET planned_amount = gp_credit_card_monthly.planned_amount + EXCLUDED.planned_amount,
            notes = CASE
              WHEN gp_credit_card_monthly.notes IS NULL OR gp_credit_card_monthly.notes = ''
              THEN EXCLUDED.notes
              ELSE gp_credit_card_monthly.notes
            END,
            updated_at = now()
      RETURNING month, planned_amount, notes, updated_at
    `,
    [month, amount, notes]
  );
  return result.rows[0];
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

    const installments = Number(value.installments || 1);
    const notes = value.notes ?? null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const distribution = splitIntoInstallments(value.planned_amount, installments);
      const touchedMonths = [];

      for (let index = 0; index < distribution.length; index += 1) {
        const targetMonth = addMonthsToYearMonth(month, index);
        const amountPart = distribution[index];
        if (amountPart <= 0) continue;
        await upsertPlannedMonth(client, {
          month: targetMonth,
          amount: amountPart,
          notes,
        });
        touchedMonths.push({
          month: targetMonth,
          planned_amount: toMoney(amountPart),
        });
      }

      const selectedMonthRes = await client.query(
        `
          SELECT month, planned_amount, notes, updated_at
          FROM gp_credit_card_monthly
          WHERE month = $1
        `,
        [month]
      );

      await client.query('COMMIT');

      return res.json({
        ...formatRow(selectedMonthRes.rows[0]),
        exists: true,
        installments,
        added_total: value.planned_amount,
        distribution: touchedMonths,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
