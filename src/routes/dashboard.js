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

function monthStartFromYearMonth(monthText) {
  const [year, month] = monthText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function addUtcMonths(date, delta) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + delta);
  return next;
}

function formatYearMonthUtc(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
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

function buildIncomeFilterClause({ start, end, category }) {
  const params = [];
  const filters = [];
  const addParam = (input) => {
    params.push(input);
    return `$${params.length}`;
  };

  filters.push(`i.date >= ${addParam(start)} AND i.date < ${addParam(end)}`);

  if (category) {
    if (/^\d+$/.test(category)) {
      filters.push(`i.category_id = ${addParam(Number(category))}`);
    } else {
      filters.push(`LOWER(c.name) = LOWER(${addParam(category)})`);
    }
  }

  return {
    whereClause: `WHERE ${filters.join(' AND ')}`,
    params,
  };
}

async function getEffectiveSettings(month) {
  await pool.query('INSERT INTO gp_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const [baseRes, monthlyIncomeRes] = await Promise.all([
    pool.query(
      `
        SELECT id, monthly_budget, net_salary, extra_income, payday_day, updated_at
        FROM gp_settings
        WHERE id = 1
      `
    ),
    pool.query(
      `
        SELECT month, net_salary, extra_income, updated_at
        FROM gp_monthly_income
        WHERE month = $1
      `,
      [month]
    ),
  ]);

  const base = baseRes.rows[0];
  const monthlyIncome = monthlyIncomeRes.rows[0] || null;

  if (!monthlyIncome) {
    return {
      ...base,
      month,
      income_source: 'default',
      monthly_income_updated_at: null,
    };
  }

  return {
    ...base,
    month,
    net_salary: monthlyIncome.net_salary,
    extra_income: monthlyIncome.extra_income,
    income_source: 'monthly',
    monthly_income_updated_at: monthlyIncome.updated_at,
  };
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
    const selectedMonthStart = monthStartFromYearMonth(month);
    const monthlyStart = addUtcMonths(selectedMonthStart, -11);
    const monthlyEnd = addUtcMonths(selectedMonthStart, 1);
    const monthlyRangeStart = monthlyStart.toISOString().slice(0, 10);
    const monthlyRangeEnd = monthlyEnd.toISOString().slice(0, 10);

    const settingsRow = await getEffectiveSettings(month);
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
    const monthlyFilters = buildFilterClause({
      start: monthlyRangeStart,
      end: monthlyRangeEnd,
      type: type || null,
      category: category || null,
    });
    const incomeMonthFilters = buildIncomeFilterClause({
      start: monthRange.start,
      end: monthRange.end,
      category: category || null,
    });

    const [spendMonthRes, gainMonthRes, byTypeRes, byCategoryRes, dailyRes, monthlyRes, latestRes] = await Promise.all([
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
          SELECT COALESCE(SUM(i.amount), 0) AS total
          FROM gp_incomes i
          JOIN gp_categories c ON c.id = i.category_id
          ${incomeMonthFilters.whereClause}
        `,
        incomeMonthFilters.params
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
          SELECT to_char(date_trunc('month', e.date), 'YYYY-MM') AS month, COALESCE(SUM(e.amount), 0) AS total
          ${baseFrom}
          ${monthlyFilters.whereClause}
          GROUP BY 1
          ORDER BY 1
        `,
        monthlyFilters.params
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
    const gainMonth = toMoney(gainMonthRes.rows[0].total);
    const estimatedLeft = toMoney(salaryTotal - spendMonth);
    const realLeft = toMoney(salaryTotal + gainMonth - spendMonth);
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

    const monthlyMap = new Map(
      monthlyRes.rows.map((row) => [row.month, toMoney(row.total)])
    );
    const monthlySeries = [];
    for (let index = 0; index < 12; index += 1) {
      const iterMonth = addUtcMonths(monthlyStart, index);
      const yearMonth = formatYearMonthUtc(iterMonth);
      monthlySeries.push({
        month: yearMonth,
        total_spend: monthlyMap.get(yearMonth) || 0,
      });
    }

    let spendToday = 0;
    let spendWeek = 0;
    let gainToday = 0;
    let gainWeek = 0;

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
      const incomeTodayFilters = buildIncomeFilterClause({
        start: todayIso,
        end: tomorrowIso,
        category: category || null,
      });
      const incomeWeekFilters = buildIncomeFilterClause({
        start: weekStartIso,
        end: tomorrowIso,
        category: category || null,
      });

      const [todayRes, weekRes, gainTodayRes, gainWeekRes] = await Promise.all([
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
        pool.query(
          `
            SELECT COALESCE(SUM(i.amount), 0) AS total
            FROM gp_incomes i
            JOIN gp_categories c ON c.id = i.category_id
            ${incomeTodayFilters.whereClause}
          `,
          incomeTodayFilters.params
        ),
        pool.query(
          `
            SELECT COALESCE(SUM(i.amount), 0) AS total
            FROM gp_incomes i
            JOIN gp_categories c ON c.id = i.category_id
            ${incomeWeekFilters.whereClause}
          `,
          incomeWeekFilters.params
        ),
      ]);

      spendToday = toMoney(todayRes.rows[0].total);
      spendWeek = toMoney(weekRes.rows[0].total);
      gainToday = toMoney(gainTodayRes.rows[0].total);
      gainWeek = toMoney(gainWeekRes.rows[0].total);
    }

    res.json({
      month,
      income_source: settingsRow.income_source,
      monthly_income_updated_at: settingsRow.monthly_income_updated_at,
      salary_total: salaryTotal,
      net_salary: netSalary,
      extra_income: extraIncome,
      monthly_budget: monthlyBudget,
      totals: {
        spend_today: spendToday,
        spend_week: spendWeek,
        gain_today: gainToday,
        gain_week: gainWeek,
        spend_month: spendMonth,
        gain_month: gainMonth,
        salary_spent_percent: salarySpentPercent,
        estimated_left: estimatedLeft,
        real_left: realLeft,
        budget_left: budgetLeft,
      },
      by_type: byType,
      by_category: byCategory,
      daily_series: dailySeries,
      monthly_series: monthlySeries,
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
