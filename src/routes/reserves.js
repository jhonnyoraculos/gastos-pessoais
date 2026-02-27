const express = require('express');
const pool = require('../db/pool');
const {
  getMonthRange,
  toMoney,
  validateReservePayload,
  validateReservesQuery,
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

function mapReserve(row) {
  return {
    id: Number(row.id),
    date: toDateString(row.date),
    amount: toMoney(row.amount),
    description: row.description,
    movement_type: row.movement_type,
    method: row.method,
    notes: row.notes || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { errors, value } = validateReservesQuery(req.query);
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

    filters.push(`r.date >= ${addParam(range.start)} AND r.date < ${addParam(range.end)}`);

    if (value.movement_type) {
      filters.push(`r.movement_type = ${addParam(value.movement_type)}`);
    }

    if (value.q) {
      const needle = `%${value.q}%`;
      filters.push(`(r.description ILIKE ${addParam(needle)} OR COALESCE(r.notes, '') ILIKE ${addParam(needle)})`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const baseFrom = `FROM gp_reserves r ${whereSql}`;

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
          r.id,
          r.date,
          r.amount,
          r.description,
          r.movement_type,
          r.method,
          r.notes,
          r.created_at,
          r.updated_at
        ${baseFrom}
        ORDER BY r.date DESC, r.id DESC
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `,
      dataParams
    );

    return res.json({
      items: dataRes.rows.map(mapReserve),
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
    const { errors, value } = validateReservePayload(req.body, { partial: false });
    if (errors.length) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const result = await pool.query(
      `
        INSERT INTO gp_reserves (date, amount, description, movement_type, method, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, date, amount, description, movement_type, method, notes, created_at, updated_at
      `,
      [value.date, value.amount, value.description, value.movement_type, value.method, value.notes ?? null]
    );

    return res.status(201).json(mapReserve(result.rows[0]));
  } catch (error) {
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Dados invalidos para tipo ou metodo.' });
    }
    return next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const reserveId = Number(req.params.id);
    if (!Number.isInteger(reserveId) || reserveId <= 0) {
      return res.status(400).json({ error: 'ID invalido.' });
    }

    const { errors, value } = validateReservePayload(req.body, { partial: true });
    if (errors.length) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const currentRes = await pool.query('SELECT * FROM gp_reserves WHERE id = $1', [reserveId]);
    if (!currentRes.rows.length) {
      return res.status(404).json({ error: 'Reserva nao encontrada.' });
    }

    const current = currentRes.rows[0];
    const merged = {
      date: value.date ?? toDateString(current.date),
      amount: value.amount ?? toMoney(current.amount),
      description: value.description ?? current.description,
      movement_type: value.movement_type ?? current.movement_type,
      method: value.method ?? current.method,
      notes: value.notes === undefined ? current.notes : value.notes,
    };

    const result = await pool.query(
      `
        UPDATE gp_reserves
        SET
          date = $1,
          amount = $2,
          description = $3,
          movement_type = $4,
          method = $5,
          notes = $6,
          updated_at = now()
        WHERE id = $7
        RETURNING id, date, amount, description, movement_type, method, notes, created_at, updated_at
      `,
      [
        merged.date,
        merged.amount,
        merged.description,
        merged.movement_type,
        merged.method,
        merged.notes ?? null,
        reserveId,
      ]
    );

    return res.json(mapReserve(result.rows[0]));
  } catch (error) {
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Dados invalidos para tipo ou metodo.' });
    }
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const reserveId = Number(req.params.id);
    if (!Number.isInteger(reserveId) || reserveId <= 0) {
      return res.status(400).json({ error: 'ID invalido.' });
    }

    const result = await pool.query('DELETE FROM gp_reserves WHERE id = $1', [reserveId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reserva nao encontrada.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
