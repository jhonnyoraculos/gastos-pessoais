const express = require('express');
const pool = require('../db/pool');
const {
  parseMonth,
  toMoney,
  validateCreditCardMonthlyPayload,
} = require('../utils/validators');

const router = express.Router();

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

function formatSummaryRow(row) {
  const manualAmount = toMoney(row.manual_amount);
  const purchasesAmount = toMoney(row.purchases_amount);
  return {
    month: row.month,
    manual_amount: manualAmount,
    purchases_amount: purchasesAmount,
    planned_amount: toMoney(manualAmount + purchasesAmount),
    updated_at: row.updated_at || null,
    exists: manualAmount > 0 || purchasesAmount > 0,
  };
}

async function getMonthSummary(client, month) {
  const summary = await client.query(
    `
      WITH manual AS (
        SELECT month, planned_amount, updated_at
        FROM gp_credit_card_monthly
        WHERE month = $1
      ),
      purchases AS (
        SELECT
          a.month,
          COALESCE(SUM(a.amount), 0) AS purchases_amount,
          MAX(p.updated_at) AS updated_at
        FROM gp_credit_card_purchase_allocations a
        JOIN gp_credit_card_purchases p ON p.id = a.purchase_id
        WHERE a.month = $1
        GROUP BY a.month
      )
      SELECT
        $1::text AS month,
        COALESCE((SELECT planned_amount FROM manual), 0) AS manual_amount,
        COALESCE((SELECT purchases_amount FROM purchases), 0) AS purchases_amount,
        GREATEST(
          COALESCE((SELECT updated_at FROM manual), 'epoch'::timestamp),
          COALESCE((SELECT updated_at FROM purchases), 'epoch'::timestamp)
        ) AS updated_at
    `,
    [month]
  );
  return summary.rows[0];
}

async function createPurchaseWithAllocations(client, { startMonth, totalAmount, installments, notes }) {
  const inserted = await client.query(
    `
      INSERT INTO gp_credit_card_purchases (start_month, total_amount, installments, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [startMonth, totalAmount, installments, notes]
  );

  const purchaseId = Number(inserted.rows[0].id);
  const distribution = splitIntoInstallments(totalAmount, installments);
  const touchedMonths = [];

  for (let index = 0; index < distribution.length; index += 1) {
    const targetMonth = addMonthsToYearMonth(startMonth, index);
    const amountPart = distribution[index];
    if (amountPart <= 0) continue;
    await client.query(
      `
        INSERT INTO gp_credit_card_purchase_allocations (purchase_id, month, amount)
        VALUES ($1, $2, $3)
      `,
      [purchaseId, targetMonth, amountPart]
    );
    touchedMonths.push({
      month: targetMonth,
      planned_amount: toMoney(amountPart),
    });
  }

  return { purchaseId, touchedMonths };
}

router.get('/', async (req, res, next) => {
  try {
    const month = req.query.month ? parseMonth(String(req.query.month)) : null;
    if (req.query.month && !month) {
      return res.status(400).json({ error: 'month deve estar no formato YYYY-MM.' });
    }

    if (month) {
      const row = await getMonthSummary(pool, month);
      return res.json(formatSummaryRow(row));
    }

    const result = await pool.query(
      `
        WITH all_months AS (
          SELECT month FROM gp_credit_card_monthly
          UNION
          SELECT month FROM gp_credit_card_purchase_allocations
        ),
        manual AS (
          SELECT month, planned_amount, updated_at
          FROM gp_credit_card_monthly
        ),
        purchases AS (
          SELECT
            a.month,
            COALESCE(SUM(a.amount), 0) AS purchases_amount,
            MAX(p.updated_at) AS updated_at
          FROM gp_credit_card_purchase_allocations a
          JOIN gp_credit_card_purchases p ON p.id = a.purchase_id
          GROUP BY a.month
        )
        SELECT
          m.month,
          COALESCE(manual.planned_amount, 0) AS manual_amount,
          COALESCE(purchases.purchases_amount, 0) AS purchases_amount,
          GREATEST(
            COALESCE(manual.updated_at, 'epoch'::timestamp),
            COALESCE(purchases.updated_at, 'epoch'::timestamp)
          ) AS updated_at
        FROM all_months m
        LEFT JOIN manual ON manual.month = m.month
        LEFT JOIN purchases ON purchases.month = m.month
        ORDER BY m.month DESC
        LIMIT 24
      `
    );

    return res.json({
      items: result.rows.map((row) => formatSummaryRow(row)),
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
      const creation = await createPurchaseWithAllocations(client, {
        startMonth: month,
        totalAmount: value.planned_amount,
        installments,
        notes,
      });

      const summaryRow = await getMonthSummary(client, month);
      await client.query('COMMIT');

      return res.json({
        ...formatSummaryRow(summaryRow),
        purchase_id: creation.purchaseId,
        installments,
        added_total: value.planned_amount,
        distribution: creation.touchedMonths,
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

router.put('/manual/:month', async (req, res, next) => {
  try {
    const month = parseMonth(String(req.params.month || ''));
    if (!month) {
      return res.status(400).json({ error: 'month deve estar no formato YYYY-MM.' });
    }

    const plannedAmount = Number(req.body?.planned_amount);
    if (!Number.isFinite(plannedAmount) || plannedAmount < 0) {
      return res.status(400).json({ error: 'planned_amount deve ser numerico e >= 0.' });
    }

    let notes = null;
    if (req.body?.notes !== undefined && req.body?.notes !== null) {
      if (typeof req.body.notes !== 'string') {
        return res.status(400).json({ error: 'notes precisa ser texto.' });
      }
      const trimmed = req.body.notes.trim();
      if (trimmed.length > 500) {
        return res.status(400).json({ error: 'notes nao pode exceder 500 caracteres.' });
      }
      notes = trimmed || null;
    }

    const amount = toMoney(plannedAmount);
    if (amount === 0 && !notes) {
      await pool.query('DELETE FROM gp_credit_card_monthly WHERE month = $1', [month]);
    } else {
      await pool.query(
        `
          INSERT INTO gp_credit_card_monthly (month, planned_amount, notes)
          VALUES ($1, $2, $3)
          ON CONFLICT (month)
          DO UPDATE
            SET planned_amount = EXCLUDED.planned_amount,
                notes = EXCLUDED.notes,
                updated_at = now()
        `,
        [month, amount, notes]
      );
    }

    const summaryRow = await getMonthSummary(pool, month);
    return res.json({
      ...formatSummaryRow(summaryRow),
      manual_updated: true,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/manual/:month', async (req, res, next) => {
  try {
    const month = parseMonth(String(req.params.month || ''));
    if (!month) {
      return res.status(400).json({ error: 'month deve estar no formato YYYY-MM.' });
    }

    const result = await pool.query(
      'DELETE FROM gp_credit_card_monthly WHERE month = $1',
      [month]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Ajuste manual de cartao nao encontrado para este mes.' });
    }

    const summaryRow = await getMonthSummary(pool, month);
    return res.json({
      ok: true,
      month,
      summary: formatSummaryRow(summaryRow),
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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const manualRes = await client.query(
        'DELETE FROM gp_credit_card_monthly WHERE month = $1',
        [month]
      );

      const purchasesRes = await client.query(
        'DELETE FROM gp_credit_card_purchases WHERE start_month = $1',
        [month]
      );

      await client.query('COMMIT');

      if (manualRes.rowCount === 0 && purchasesRes.rowCount === 0) {
        return res.status(404).json({ error: 'Nenhum registro de cartao encontrado para este mes.' });
      }

      return res.json({
        ok: true,
        deleted_manual: manualRes.rowCount,
        deleted_purchases: purchasesRes.rowCount,
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

module.exports = router;
