const express = require('express');
const pool = require('../db/pool');
const { validateCategoryPayload } = require('../utils/validators');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT id, name, created_at
        FROM gp_categories
        ORDER BY name ASC
      `
    );
    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { errors, value } = validateCategoryPayload(req.body);
    if (errors.length) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const result = await pool.query(
      `
        INSERT INTO gp_categories (name)
        VALUES ($1)
        RETURNING id, name, created_at
      `,
      [value.name]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Categoria ja existe.' });
    }
    next(error);
  }
});

module.exports = router;
