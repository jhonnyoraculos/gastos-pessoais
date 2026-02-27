const express = require('express');
const pool = require('../db/pool');
const {
  getMonthRange,
  toMoney,
  validateIncomePayload,
  validateIncomesQuery,
} = require('../utils/validators');

const router = express.Router();

function isDateObject(value) {
  return Object.prototype.toString.call(value) === '[object Date]';
}

function toDateString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (isDateObject(value)) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapIncome(row) {
  return {
    id: Number(row.id),
    date: toDateString(row.date),
    amount: toMoney(row.amount),
    description: row.description,
    category_id: Number(row.category_id),
    category_name: row.category_name,
    method: row.method,
    notes: row.notes || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { errors, value } = validateIncomesQuery(req.query);
    if (errors.length) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const range = getMonthRange(value.month);
    const params = [];
    const filters = [];
    const addParam = (input) => {
      params.push(input);
      return `$${params.length}`;
    };

    filters.push(`i.date >= ${addParam(range.start)} AND i.date < ${addParam(range.end)}`);

    if (value.category) {
      if (/^\d+$/.test(value.category)) {
        filters.push(`i.category_id = ${addParam(Number(value.category))}`);
      } else {
        filters.push(`LOWER(c.name) = LOWER(${addParam(value.category)})`);
      }
    }

    if (value.method) {
      filters.push(`i.method = ${addParam(value.method)}`);
    }

    if (value.q) {
      const needle = `%${value.q}%`;
      filters.push(`(i.description ILIKE ${addParam(needle)} OR COALESCE(i.notes, '') ILIKE ${addParam(needle)})`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const baseFrom = `
      FROM gp_incomes i
      JOIN gp_categories c ON c.id = i.category_id
      ${whereSql}
    `;

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${baseFrom}`, params);
    const total = Number(countRes.rows[0].total || 0);

    const dataParams = [...params];
    dataParams.push(value.limit);
    const limitPlaceholder = `$${dataParams.length}`;
    dataParams.push(value.offset);
    const offsetPlaceholder = `$${dataParams.length}`;

    const dataRes = await pool.query(
      `
        SELECT
          i.id,
          i.date,
          i.amount,
          i.description,
          i.category_id,
          c.name AS category_name,
          i.method,
          i.notes,
          i.created_at,
          i.updated_at
        ${baseFrom}
        ORDER BY i.date DESC, i.id DESC
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `,
      dataParams
    );

    return res.json({
      items: dataRes.rows.map(mapIncome),
      total,
      limit: value.limit,
      offset: value.offset,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { errors, value } = validateIncomePayload(req.body, { partial: false });
    if (errors.length) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const result = await pool.query(
      `
        WITH inserted AS (
          INSERT INTO gp_incomes (date, amount, description, category_id, method, notes)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, date, amount, description, category_id, method, notes, created_at, updated_at
        )
        SELECT
          i.id,
          i.date,
          i.amount,
          i.description,
          i.category_id,
          c.name AS category_name,
          i.method,
          i.notes,
          i.created_at,
          i.updated_at
        FROM inserted i
        JOIN gp_categories c ON c.id = i.category_id
      `,
      [value.date, value.amount, value.description, value.category_id, value.method, value.notes ?? null]
    );

    return res.status(201).json(mapIncome(result.rows[0]));
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Categoria informada nao existe.' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Dados invalidos para metodo.' });
    }
    return next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const incomeId = Number(req.params.id);
    if (!Number.isInteger(incomeId) || incomeId <= 0) {
      return res.status(400).json({ error: 'ID invalido.' });
    }

    const { errors, value } = validateIncomePayload(req.body, { partial: true });
    if (errors.length) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const currentRes = await pool.query('SELECT * FROM gp_incomes WHERE id = $1', [incomeId]);
    if (!currentRes.rows.length) {
      return res.status(404).json({ error: 'Ganho nao encontrado.' });
    }

    const current = currentRes.rows[0];
    const merged = {
      date: value.date ?? toDateString(current.date),
      amount: value.amount ?? toMoney(current.amount),
      description: value.description ?? current.description,
      category_id: value.category_id ?? Number(current.category_id),
      method: value.method ?? current.method,
      notes: value.notes === undefined ? current.notes : value.notes,
    };

    const result = await pool.query(
      `
        UPDATE gp_incomes
        SET
          date = $1,
          amount = $2,
          description = $3,
          category_id = $4,
          method = $5,
          notes = $6,
          updated_at = now()
        WHERE id = $7
        RETURNING id, date, amount, description, category_id, method, notes, created_at, updated_at
      `,
      [
        merged.date,
        merged.amount,
        merged.description,
        merged.category_id,
        merged.method,
        merged.notes ?? null,
        incomeId,
      ]
    );

    const row = result.rows[0];
    const categoryRes = await pool.query('SELECT id, name FROM gp_categories WHERE id = $1', [row.category_id]);
    row.category_name = categoryRes.rows[0]?.name || null;

    return res.json(mapIncome(row));
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Categoria informada nao existe.' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Dados invalidos para metodo.' });
    }
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const incomeId = Number(req.params.id);
    if (!Number.isInteger(incomeId) || incomeId <= 0) {
      return res.status(400).json({ error: 'ID invalido.' });
    }

    const result = await pool.query('DELETE FROM gp_incomes WHERE id = $1', [incomeId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Ganho nao encontrado.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
