const express = require('express');
const pool = require('../db/pool');
const {
  EXPENSE_TYPES,
  getCurrentMonth,
  getMonthRange,
  parseMonth,
  round1,
  toMoney,
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

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nextDay(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return formatIsoDate(date);
}

function mondayOfCurrentWeek(reference) {
  const date = new Date(reference);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildFilterClause({ start, end, type, category }) {
  const params = [];
  const filters = [];
  const addParam = (input) => {
    params.push(input);
    return `$${params.length}`;
  };

  filters.push(`e.date >= ${addParam(start)} AND e.date < ${addParam(end)}`);

  if (type) {
    filters.push(`e.type = ${addParam(type)}`);
  }

  if (category) {
    if (/^\d+$/.test(category)) {
      filters.push(`e.category_id = ${addParam(Number(category))}`);
    } else {
      filters.push(`LOWER(c.name) = LOWER(${addParam(category)})`);
    }
  }

  return {
    whereClause: `WHERE ${filters.join(' AND ')}`,
    params,
  };
}

async function getSettings() {
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

router.get('/', async (req, res, next) => {
  try {
    const month = req.query.month ? parseMonth(String(req.query.month)) : getCurrentMonth();
    if (!month) {
      return res.status(400).json({ error: 'month deve estar no formato YYYY-MM.' });
    }

    const type = req.query.type ? String(req.query.type).trim() : '';
    if (type && !EXPENSE_TYPES.includes(type)) {
      return res.status(400).json({ error: `type invalido. Use: ${EXPENSE_TYPES.join(', ')}.` });
    }

    const category = req.query.category ? String(req.query.category).trim() : '';
    const monthRange = getMonthRange(month);

    const settingsRow = await getSettings();
    const netSalary = toMoney(settingsRow.net_salary);
    const extraIncome = toMoney(settingsRow.extra_income);
    const monthlyBudget = toMoney(settingsRow.monthly_budget);
    const salaryTotal = toMoney(netSalary + extraIncome);

    const baseFrom = 'FROM gp_expenses e JOIN gp_categories c ON c.id = e.category_id';
    const monthFilters = buildFilterClause({
      start: monthRange.start,
      end: monthRange.end,
      type: type || null,
      category: category || null,
    });

    const [spendMonthRes, byTypeRes, byCategoryRes, dailyRes, latestRes] = await Promise.all([
      pool.query(
        `
          SELECT COALESCE(SUM(e.amount), 0) AS total
          ${baseFrom}
          ${monthFilters.whereClause}
        `,
        monthFilters.params
      ),
      pool.query(
        `
          SELECT e.type, COALESCE(SUM(e.amount), 0) AS total
          ${baseFrom}
          ${monthFilters.whereClause}
          GROUP BY e.type
        `,
        monthFilters.params
      ),
      pool.query(
        `
          SELECT c.name AS category_name, COALESCE(SUM(e.amount), 0) AS total
          ${baseFrom}
          ${monthFilters.whereClause}
          GROUP BY c.name
          ORDER BY total DESC
          LIMIT 10
        `,
        monthFilters.params
      ),
      pool.query(
        `
          SELECT EXTRACT(DAY FROM e.date)::int AS day, COALESCE(SUM(e.amount), 0) AS total
          ${baseFrom}
          ${monthFilters.whereClause}
          GROUP BY day
          ORDER BY day
        `,
        monthFilters.params
      ),
      pool.query(
        `
          SELECT
            e.id,
            e.date,
            e.amount,
            e.description,
            e.category_id,
            c.name AS category_name,
            e.type,
            e.method,
            e.notes
          ${baseFrom}
          ${monthFilters.whereClause}
          ORDER BY e.date DESC, e.id DESC
          LIMIT 10
        `,
        monthFilters.params
      ),
    ]);

    const spendMonth = toMoney(spendMonthRes.rows[0].total);
    const estimatedLeft = toMoney(salaryTotal - spendMonth);
    const budgetLeft = monthlyBudget > 0 ? toMoney(monthlyBudget - spendMonth) : null;
    const salarySpentPercent = salaryTotal > 0 ? round1((spendMonth / salaryTotal) * 100) : null;

    const byTypeMap = new Map(
      byTypeRes.rows.map((row) => [row.type, toMoney(row.total)])
    );
    const byType = EXPENSE_TYPES.map((expenseType) => {
      const totalSpend = byTypeMap.get(expenseType) || 0;
      return {
        type: expenseType,
        total_spend: toMoney(totalSpend),
        percent_of_salary: salaryTotal > 0 ? round1((totalSpend / salaryTotal) * 100) : null,
        percent_of_month_spend: spendMonth > 0 ? round1((totalSpend / spendMonth) * 100) : 0,
      };
    });

    const byCategory = byCategoryRes.rows.map((row) => {
      const totalSpend = toMoney(row.total);
      return {
        category_name: row.category_name,
        total_spend: totalSpend,
        percent_of_salary: salaryTotal > 0 ? round1((totalSpend / salaryTotal) * 100) : null,
      };
    });

    const dailyMap = new Map(dailyRes.rows.map((row) => [Number(row.day), toMoney(row.total)]));
    const dailySeries = [];
    for (let day = 1; day <= monthRange.daysInMonth; day += 1) {
      dailySeries.push({
        day,
        total_spend: dailyMap.get(day) || 0,
      });
    }

    let spendToday = 0;
    let spendWeek = 0;

    const currentMonth = getCurrentMonth();
    if (month === currentMonth) {
      const today = new Date();
      const todayIso = formatIsoDate(today);
      const tomorrowIso = nextDay(todayIso);
      const weekStartIso = formatIsoDate(mondayOfCurrentWeek(today));

      const todayFilters = buildFilterClause({
        start: todayIso,
        end: tomorrowIso,
        type: type || null,
        category: category || null,
      });
      const weekFilters = buildFilterClause({
        start: weekStartIso,
        end: tomorrowIso,
        type: type || null,
        category: category || null,
      });

      const [todayRes, weekRes] = await Promise.all([
        pool.query(
          `
            SELECT COALESCE(SUM(e.amount), 0) AS total
            ${baseFrom}
            ${todayFilters.whereClause}
          `,
          todayFilters.params
        ),
        pool.query(
          `
            SELECT COALESCE(SUM(e.amount), 0) AS total
            ${baseFrom}
            ${weekFilters.whereClause}
          `,
          weekFilters.params
        ),
      ]);

      spendToday = toMoney(todayRes.rows[0].total);
      spendWeek = toMoney(weekRes.rows[0].total);
    }

    res.json({
      month,
      salary_total: salaryTotal,
      net_salary: netSalary,
      extra_income: extraIncome,
      monthly_budget: monthlyBudget,
      totals: {
        spend_today: spendToday,
        spend_week: spendWeek,
        spend_month: spendMonth,
        salary_spent_percent: salarySpentPercent,
        estimated_left: estimatedLeft,
        budget_left: budgetLeft,
      },
      by_type: byType,
      by_category: byCategory,
      daily_series: dailySeries,
      latest_expenses: latestRes.rows.map((row) => ({
        id: Number(row.id),
        date: toDateString(row.date),
        amount: toMoney(row.amount),
        description: row.description,
        category_id: Number(row.category_id),
        category_name: row.category_name,
        type: row.type,
        method: row.method,
        notes: row.notes || null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
