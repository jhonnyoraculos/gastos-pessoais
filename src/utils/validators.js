const EXPENSE_TYPES = Object.freeze([
  'Essencial',
  'Besteira',
  'Investimento',
  'Lazer',
  'Outros',
]);

const PAYMENT_METHODS = Object.freeze(['Pix', 'Cartão', 'Dinheiro', 'Outro']);

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function parseMonth(value) {
  if (typeof value !== 'string') return null;
  const month = value.trim();
  if (!MONTH_PATTERN.test(month)) return null;
  return month;
}

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMonthRange(monthValue) {
  const month = parseMonth(monthValue);
  if (!month) return null;

  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    daysInMonth,
  };
}

function toMoney(value) {
  const num = Number(value || 0);
  return Number(num.toFixed(2));
}

function round1(value) {
  const num = Number(value || 0);
  return Number(num.toFixed(1));
}

function parseMoneyField(raw, fieldName, { min = 0, allowZero = true } = {}) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { error: `${fieldName} precisa ser numerico.` };
  }
  if (!allowZero && value <= 0) {
    return { error: `${fieldName} deve ser maior que zero.` };
  }
  if (value < min) {
    return { error: `${fieldName} nao pode ser negativo.` };
  }
  return { value: toMoney(value) };
}

function parseOptionalString(raw, { max = 1000 } = {}) {
  if (raw === undefined) return { absent: true };
  if (raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: 'Texto invalido.' };

  const text = raw.trim();
  if (!text) return { value: null };
  if (text.length > max) return { error: `Texto excede ${max} caracteres.` };
  return { value: text };
}

function isValidDateString(dateText) {
  if (!DATE_PATTERN.test(dateText)) return false;
  const asDate = new Date(`${dateText}T00:00:00Z`);
  return !Number.isNaN(asDate.getTime()) && asDate.toISOString().slice(0, 10) === dateText;
}

function validateSettingsPayload(payload, { partial = true } = {}) {
  const errors = [];
  const value = {};

  if (!payload || typeof payload !== 'object') {
    return { errors: ['Payload invalido.'], value };
  }

  if ('net_salary' in payload) {
    const parsed = parseMoneyField(payload.net_salary, 'net_salary');
    if (parsed.error) errors.push(parsed.error);
    else value.net_salary = parsed.value;
  } else if (!partial) {
    errors.push('net_salary e obrigatorio.');
  }

  if ('extra_income' in payload) {
    const parsed = parseMoneyField(payload.extra_income, 'extra_income');
    if (parsed.error) errors.push(parsed.error);
    else value.extra_income = parsed.value;
  } else if (!partial) {
    errors.push('extra_income e obrigatorio.');
  }

  if ('monthly_budget' in payload) {
    const parsed = parseMoneyField(payload.monthly_budget, 'monthly_budget');
    if (parsed.error) errors.push(parsed.error);
    else value.monthly_budget = parsed.value;
  } else if (!partial) {
    errors.push('monthly_budget e obrigatorio.');
  }

  if ('payday_day' in payload) {
    const payday = Number(payload.payday_day);
    if (!Number.isInteger(payday) || payday < 1 || payday > 28) {
      errors.push('payday_day deve ser um inteiro entre 1 e 28.');
    } else {
      value.payday_day = payday;
    }
  } else if (!partial) {
    errors.push('payday_day e obrigatorio.');
  }

  if (partial && Object.keys(value).length === 0) {
    errors.push('Nenhum campo valido enviado para atualizar settings.');
  }

  return { errors, value };
}

function validateCategoryPayload(payload) {
  const errors = [];
  const value = {};

  if (!payload || typeof payload !== 'object') {
    return { errors: ['Payload invalido.'], value };
  }

  if (typeof payload.name !== 'string') {
    errors.push('name e obrigatorio.');
    return { errors, value };
  }

  const name = payload.name.trim();
  if (name.length < 2 || name.length > 80) {
    errors.push('name deve ter entre 2 e 80 caracteres.');
  } else {
    value.name = name;
  }

  return { errors, value };
}

function validateExpensePayload(payload, { partial = false } = {}) {
  const errors = [];
  const value = {};

  if (!payload || typeof payload !== 'object') {
    return { errors: ['Payload invalido.'], value };
  }

  if ('date' in payload) {
    if (typeof payload.date !== 'string' || !isValidDateString(payload.date.trim())) {
      errors.push('date deve estar no formato YYYY-MM-DD.');
    } else {
      value.date = payload.date.trim();
    }
  } else if (!partial) {
    errors.push('date e obrigatorio.');
  }

  if ('amount' in payload) {
    const parsed = parseMoneyField(payload.amount, 'amount', { min: 0, allowZero: false });
    if (parsed.error) errors.push(parsed.error);
    else value.amount = parsed.value;
  } else if (!partial) {
    errors.push('amount e obrigatorio.');
  }

  if ('description' in payload) {
    if (typeof payload.description !== 'string') {
      errors.push('description precisa ser texto.');
    } else {
      const description = payload.description.trim();
      if (description.length < 2 || description.length > 180) {
        errors.push('description deve ter entre 2 e 180 caracteres.');
      } else {
        value.description = description;
      }
    }
  } else if (!partial) {
    errors.push('description e obrigatorio.');
  }

  if ('category_id' in payload) {
    const categoryId = Number(payload.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      errors.push('category_id deve ser inteiro positivo.');
    } else {
      value.category_id = categoryId;
    }
  } else if (!partial) {
    errors.push('category_id e obrigatorio.');
  }

  if ('type' in payload) {
    if (typeof payload.type !== 'string' || !EXPENSE_TYPES.includes(payload.type.trim())) {
      errors.push(`type invalido. Use: ${EXPENSE_TYPES.join(', ')}.`);
    } else {
      value.type = payload.type.trim();
    }
  } else if (!partial) {
    errors.push('type e obrigatorio.');
  }

  if ('method' in payload) {
    if (typeof payload.method !== 'string' || !PAYMENT_METHODS.includes(payload.method.trim())) {
      errors.push(`method invalido. Use: ${PAYMENT_METHODS.join(', ')}.`);
    } else {
      value.method = payload.method.trim();
    }
  } else if (!partial) {
    errors.push('method e obrigatorio.');
  }

  if ('notes' in payload) {
    const parsed = parseOptionalString(payload.notes, { max: 1200 });
    if (parsed.error) errors.push(parsed.error);
    else if (!parsed.absent) value.notes = parsed.value;
  } else if (!partial) {
    value.notes = null;
  }

  if (partial && Object.keys(value).length === 0) {
    errors.push('Nenhum campo valido enviado para atualizar gasto.');
  }

  return { errors, value };
}

function validateExpensesQuery(query) {
  const errors = [];
  const value = {};

  const month = parseMonth(query.month);
  if (!month) {
    errors.push('month e obrigatorio no formato YYYY-MM.');
  } else {
    value.month = month;
  }

  if (query.category !== undefined && query.category !== null && String(query.category).trim() !== '') {
    value.category = String(query.category).trim();
  }

  if (query.type !== undefined && query.type !== null && String(query.type).trim() !== '') {
    const type = String(query.type).trim();
    if (!EXPENSE_TYPES.includes(type)) {
      errors.push(`type invalido. Use: ${EXPENSE_TYPES.join(', ')}.`);
    } else {
      value.type = type;
    }
  }

  if (query.q !== undefined && query.q !== null && String(query.q).trim() !== '') {
    const text = String(query.q).trim();
    if (text.length > 140) {
      errors.push('q nao pode ter mais de 140 caracteres.');
    } else {
      value.q = text;
    }
  }

  let limit = 20;
  if (query.limit !== undefined) {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      errors.push('limit deve ser inteiro entre 1 e 100.');
    } else {
      limit = parsed;
    }
  }
  value.limit = limit;

  let offset = 0;
  if (query.offset !== undefined) {
    const parsed = Number(query.offset);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.push('offset deve ser inteiro >= 0.');
    } else {
      offset = parsed;
    }
  }
  value.offset = offset;

  return { errors, value };
}

module.exports = {
  EXPENSE_TYPES,
  PAYMENT_METHODS,
  getCurrentMonth,
  getMonthRange,
  parseMonth,
  round1,
  toMoney,
  validateCategoryPayload,
  validateExpensePayload,
  validateExpensesQuery,
  validateSettingsPayload,
};
