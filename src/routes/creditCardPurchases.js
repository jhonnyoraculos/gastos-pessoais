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

async function createAllocations(client, purchaseId, startMonth, totalAmount, installments) {
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
      amount: toMoney(amountPart),
    });
  }

  return touchedMonths;
}

function parsePurchasePayload(body) {
  const startMonth = parseMonth(String(body?.start_month || ''));
  if (!startMonth) {
    return { error: 'start_month deve estar no formato YYYY-MM.' };
  }

  const payload = {
    planned_amount: body?.total_amount,
    installments: body?.installments,
    notes: body?.notes,
  };
  const { errors, value } = validateCreditCardMonthlyPayload(payload, { partial: false });
  if (errors.length) {
    return { error: errors.join(' ') };
  }

  return {
    value: {
      start_month: startMonth,
      total_amount: value.planned_amount,
      installments: Number(value.installments || 1),
      notes: value.notes ?? null,
    },
  };
}

router.get('/', async (req, res, next) => {
  try {
    const month = req.query.month ? parseMonth(String(req.query.month)) : null;
    if (!month) {
      return res.status(400).json({ error: 'month e obrigatorio no formato YYYY-MM.' });
    }

    const result = await pool.query(
      `
        SELECT
          p.id,
          p.start_month,
          p.total_amount,
          p.installments,
          p.notes,
          p.updated_at,
          a.amount AS amount_in_month
        FROM gp_credit_card_purchases p
        JOIN gp_credit_card_purchase_allocations a
          ON a.purchase_id = p.id
        WHERE a.month = $1
        ORDER BY p.updated_at DESC, p.id DESC
      `,
      [month]
    );

    return res.json({
      items: result.rows.map((row) => ({
        id: Number(row.id),
        start_month: row.start_month,
        total_amount: toMoney(row.total_amount),
        installments: Number(row.installments),
        notes: row.notes || null,
        amount_in_month: toMoney(row.amount_in_month),
        updated_at: row.updated_at || null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = parsePurchasePayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    const value = parsed.value;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `
          INSERT INTO gp_credit_card_purchases (start_month, total_amount, installments, notes)
          VALUES ($1, $2, $3, $4)
          RETURNING id, start_month, total_amount, installments, notes, updated_at
        `,
        [value.start_month, value.total_amount, value.installments, value.notes]
      );
      const purchase = inserted.rows[0];
      const distribution = await createAllocations(
        client,
        purchase.id,
        value.start_month,
        value.total_amount,
        value.installments
      );
      await client.query('COMMIT');

      return res.status(201).json({
        id: Number(purchase.id),
        start_month: purchase.start_month,
        total_amount: toMoney(purchase.total_amount),
        installments: Number(purchase.installments),
        notes: purchase.notes || null,
        updated_at: purchase.updated_at || null,
        distribution,
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

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id invalido.' });
    }

    const parsed = parsePurchasePayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    const value = parsed.value;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT id FROM gp_credit_card_purchases WHERE id = $1',
        [id]
      );
      if (!existing.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Compra no cartao nao encontrada.' });
      }

      const updated = await client.query(
        `
          UPDATE gp_credit_card_purchases
          SET
            start_month = $2,
            total_amount = $3,
            installments = $4,
            notes = $5,
            updated_at = now()
          WHERE id = $1
          RETURNING id, start_month, total_amount, installments, notes, updated_at
        `,
        [id, value.start_month, value.total_amount, value.installments, value.notes]
      );

      await client.query(
        'DELETE FROM gp_credit_card_purchase_allocations WHERE purchase_id = $1',
        [id]
      );

      const distribution = await createAllocations(
        client,
        id,
        value.start_month,
        value.total_amount,
        value.installments
      );

      await client.query('COMMIT');

      const purchase = updated.rows[0];
      return res.json({
        id: Number(purchase.id),
        start_month: purchase.start_month,
        total_amount: toMoney(purchase.total_amount),
        installments: Number(purchase.installments),
        notes: purchase.notes || null,
        updated_at: purchase.updated_at || null,
        distribution,
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

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id invalido.' });
    }

    const result = await pool.query(
      'DELETE FROM gp_credit_card_purchases WHERE id = $1',
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Compra no cartao nao encontrada.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
