(() => {
  const { apiFetch, closeModal, currentMonthISO, formatBRL, formatDateBR, formatPercent, openModal, setLoading, toast } =
    window.UI;

  const TYPES = ['Essencial', 'Besteira', 'Investimento', 'Lazer', 'Outros'];
  const TYPE_COLORS = ['#38bdf8', '#f97316', '#22c55e', '#f59e0b', '#a78bfa'];

  const state = {
    month: currentMonthISO(),
    type: '',
    category: '',
    categories: [],
    latest: [],
    charts: {},
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();

    els.monthSelect.value = state.month;

    await loadCategories();
    await loadDashboardFlow();
  }

  function cacheElements() {
    els.monthSelect = document.getElementById('monthSelect');
    els.typeFilter = document.getElementById('typeFilter');
    els.categoryFilter = document.getElementById('categoryFilter');
    els.latestBody = document.getElementById('latestExpensesBody');
    els.lastRefresh = document.getElementById('lastRefreshAt');

    els.salaryTotal = document.getElementById('metricSalaryTotal');
    els.spendMonth = document.getElementById('metricSpendMonth');
    els.salaryPercent = document.getElementById('metricSalaryPercent');
    els.estimatedLeft = document.getElementById('metricEstimatedLeft');
    els.budget = document.getElementById('metricBudget');
    els.budgetLeft = document.getElementById('metricBudgetLeft');
    els.spendToday = document.getElementById('metricSpendToday');
    els.spendWeek = document.getElementById('metricSpendWeek');
    els.salaryCta = document.getElementById('salaryCta');

    els.onboardingForm = document.getElementById('onboardingForm');
    els.onboardingNetSalary = document.getElementById('onboardingNetSalary');
    els.onboardingExtraIncome = document.getElementById('onboardingExtraIncome');
    els.onboardingPayday = document.getElementById('onboardingPayday');
    els.onboardingBudget = document.getElementById('onboardingBudget');

    els.editForm = document.getElementById('editExpenseForm');
    els.editId = document.getElementById('editExpenseId');
    els.editDate = document.getElementById('editDate');
    els.editAmount = document.getElementById('editAmount');
    els.editDescription = document.getElementById('editDescription');
    els.editCategory = document.getElementById('editCategory');
    els.editType = document.getElementById('editType');
    els.editMethod = document.getElementById('editMethod');
    els.editNotes = document.getElementById('editNotes');
  }

  function bindEvents() {
    els.monthSelect.addEventListener('change', async () => {
      state.month = els.monthSelect.value || currentMonthISO();
      await refreshDashboard();
    });

    els.typeFilter.addEventListener('change', async () => {
      state.type = els.typeFilter.value;
      await refreshDashboard();
    });

    els.categoryFilter.addEventListener('change', async () => {
      state.category = els.categoryFilter.value;
      await refreshDashboard();
    });

    els.latestBody.addEventListener('click', async (event) => {
      const target = event.target.closest('button[data-action]');
      if (!target) return;
      const expenseId = Number(target.dataset.id);
      const action = target.dataset.action;

      if (action === 'edit') {
        openEditModal(expenseId);
      }

      if (action === 'delete') {
        await deleteExpense(expenseId);
      }
    });

    els.editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = Number(els.editId.value);
      if (!id) return;

      const payload = {
        date: els.editDate.value,
        amount: Number(els.editAmount.value),
        description: els.editDescription.value,
        category_id: Number(els.editCategory.value),
        type: els.editType.value,
        method: els.editMethod.value,
        notes: els.editNotes.value || null,
      };

      try {
        setLoading(true, 'Salvando gasto...');
        await apiFetch(`/api/expenses/${id}`, { method: 'PUT', body: payload });
        closeModal('editExpenseModal');
        toast('success', 'Gasto atualizado.');
        await refreshDashboard();
      } catch (error) {
        toast('error', error.message);
      } finally {
        setLoading(false);
      }
    });

    els.onboardingForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const payload = {
        net_salary: Number(els.onboardingNetSalary.value),
        extra_income: Number(els.onboardingExtraIncome.value || 0),
        payday_day: Number(els.onboardingPayday.value || 1),
        monthly_budget: Number(els.onboardingBudget.value || 0),
      };

      if (!Number.isFinite(payload.net_salary) || payload.net_salary <= 0) {
        toast('error', 'Informe um salario liquido maior que zero.');
        return;
      }

      try {
        setLoading(true, 'Salvando configuracoes...');
        await apiFetch('/api/settings', { method: 'PUT', body: payload });
        closeModal('onboardingModal', { force: true });
        toast('success', 'Configuracoes salvas.');
        await refreshDashboard();
      } catch (error) {
        toast('error', error.message);
      } finally {
        setLoading(false);
      }
    });
  }

  async function loadCategories() {
    try {
      const response = await apiFetch('/api/categories');
      state.categories = response.items || [];
      populateCategorySelects();
    } catch (error) {
      toast('error', `Falha ao carregar categorias: ${error.message}`);
    }
  }

  function populateCategorySelects() {
    const filterSelect = els.categoryFilter;
    const editSelect = els.editCategory;

    filterSelect.innerHTML = '<option value="">Todas categorias</option>';
    editSelect.innerHTML = '<option value="">Selecione</option>';

    for (const category of state.categories) {
      filterSelect.insertAdjacentHTML(
        'beforeend',
        `<option value="${category.id}">${escapeHtml(category.name)}</option>`
      );
      editSelect.insertAdjacentHTML(
        'beforeend',
        `<option value="${category.id}">${escapeHtml(category.name)}</option>`
      );
    }
  }

  async function loadDashboardFlow() {
    try {
      setLoading(true, 'Carregando dashboard...');
      const settings = await apiFetch('/api/settings');
      const salaryTotal = Number(settings.net_salary || 0) + Number(settings.extra_income || 0);

      if (salaryTotal <= 0) {
        els.onboardingNetSalary.value = '';
        els.onboardingExtraIncome.value = Number(settings.extra_income || 0);
        els.onboardingPayday.value = Number(settings.payday_day || 1);
        els.onboardingBudget.value = Number(settings.monthly_budget || 0);
        openModal('onboardingModal', { locked: true });
      } else {
        closeModal('onboardingModal', { force: true });
      }

      await refreshDashboard();
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function dashboardUrl() {
    const params = new URLSearchParams({ month: state.month });
    if (state.type) params.set('type', state.type);
    if (state.category) params.set('category', state.category);
    return `/api/dashboard?${params.toString()}`;
  }

  async function refreshDashboard() {
    try {
      setLoading(true, 'Atualizando dashboard...');
      const payload = await apiFetch(dashboardUrl());
      state.latest = payload.latest_expenses || [];

      renderMetrics(payload);
      renderCharts(payload);
      renderLatestTable(state.latest);
      els.lastRefresh.textContent = `Atualizado em ${new Date().toLocaleTimeString('pt-BR')}`;
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function renderMetrics(payload) {
    const totals = payload.totals || {};

    els.salaryTotal.textContent = formatBRL(payload.salary_total || 0);
    els.spendMonth.textContent = formatBRL(totals.spend_month || 0);
    els.salaryPercent.textContent =
      totals.salary_spent_percent === null ? 'Configure seu salario' : formatPercent(totals.salary_spent_percent);
    els.estimatedLeft.textContent = formatBRL(totals.estimated_left || 0);
    els.budget.textContent = formatBRL(payload.monthly_budget || 0);
    els.budgetLeft.textContent = totals.budget_left === null ? '-' : formatBRL(totals.budget_left);
    els.spendToday.textContent = formatBRL(totals.spend_today || 0);
    els.spendWeek.textContent = formatBRL(totals.spend_week || 0);

    if (totals.salary_spent_percent === null) {
      els.salaryCta.innerHTML =
        'Percentuais por salario estao desabilitados. <a href="/config.html">Configurar agora</a>.';
    } else {
      els.salaryCta.textContent = '';
    }
  }

  function renderCharts(payload) {
    const typeLabels = payload.by_type.map((item) => item.type);
    const typeSpendValues = payload.by_type.map((item) => Number(item.total_spend || 0));
    const typeSalaryPercents = payload.by_type.map((item) =>
      item.percent_of_salary === null ? 0 : Number(item.percent_of_salary)
    );

    const categoryLabels = payload.by_category.map((item) => item.category_name);
    const categoryValues = payload.by_category.map((item) => Number(item.total_spend || 0));

    const dailyLabels = payload.daily_series.map((item) => String(item.day).padStart(2, '0'));
    const dailyValues = payload.daily_series.map((item) => Number(item.total_spend || 0));

    renderOrReplaceChart('typeSpendChart', document.getElementById('chartTypeSpend'), {
      type: 'doughnut',
      data: {
        labels: typeLabels,
        datasets: [
          {
            data: typeSpendValues,
            backgroundColor: TYPE_COLORS,
            borderWidth: 1,
            borderColor: '#0c172d',
          },
        ],
      },
      options: chartOptions({
        plugins: {
          legend: { labels: { color: '#dbeafe' } },
        },
      }),
    });

    renderOrReplaceChart('typeSalaryChart', document.getElementById('chartTypeSalary'), {
      type: 'bar',
      data: {
        labels: typeLabels,
        datasets: [
          {
            label: '% do salario',
            data: typeSalaryPercents,
            backgroundColor: TYPE_COLORS,
            borderRadius: 6,
            valueType: 'percent',
          },
        ],
      },
      options: chartOptions({
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#c8d7f5',
              callback: (value) => `${value}%`,
            },
            grid: { color: 'rgba(148, 163, 184, 0.15)' },
          },
          x: {
            ticks: { color: '#c8d7f5' },
            grid: { display: false },
          },
        },
      }),
    });

    renderOrReplaceChart('dailyChart', document.getElementById('chartDaily'), {
      type: 'line',
      data: {
        labels: dailyLabels,
        datasets: [
          {
            label: 'Gasto por dia',
            data: dailyValues,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.24)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          },
        ],
      },
      options: chartOptions({
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#c8d7f5',
              callback: (value) => formatBRL(value),
            },
            grid: { color: 'rgba(148, 163, 184, 0.15)' },
          },
          x: {
            ticks: { color: '#c8d7f5' },
            grid: { color: 'rgba(148, 163, 184, 0.08)' },
          },
        },
      }),
    });

    renderOrReplaceChart('categoryChart', document.getElementById('chartCategory'), {
      type: 'pie',
      data: {
        labels: categoryLabels.length ? categoryLabels : ['Sem dados'],
        datasets: [
          {
            data: categoryValues.length ? categoryValues : [1],
            backgroundColor: categoryValues.length
              ? ['#60a5fa', '#22d3ee', '#f59e0b', '#a3e635', '#34d399', '#fb7185', '#f97316', '#818cf8', '#facc15', '#4ade80']
              : ['rgba(148, 163, 184, 0.5)'],
            borderColor: '#0c172d',
            borderWidth: 1,
          },
        ],
      },
      options: chartOptions({
        plugins: { legend: { labels: { color: '#dbeafe' } } },
      }),
    });
  }

  function chartOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label(context) {
              const raw = context.raw;
              const number = Number(raw);
              if (Number.isFinite(number)) {
                if (context.dataset.valueType === 'percent') {
                  return `${context.dataset.label ? `${context.dataset.label}: ` : ''}${number.toFixed(1)}%`;
                }
                return `${context.dataset.label ? `${context.dataset.label}: ` : ''}${formatBRL(number)}`;
              }
              return String(raw);
            },
          },
        },
      },
      ...extra,
    };
  }

  function renderOrReplaceChart(key, canvas, config) {
    if (!canvas) return;
    if (state.charts[key]) {
      state.charts[key].destroy();
    }
    state.charts[key] = new Chart(canvas, config);
  }

  function renderLatestTable(expenses) {
    if (!expenses.length) {
      els.latestBody.innerHTML = '<tr><td class="empty-row" colspan="7">Nenhum gasto encontrado para o periodo.</td></tr>';
      return;
    }

    els.latestBody.innerHTML = expenses
      .map(
        (expense) => `
          <tr>
            <td>${formatDateBR(expense.date)}</td>
            <td>${escapeHtml(expense.description)}</td>
            <td>${escapeHtml(expense.category_name || '-')}</td>
            <td><span class="chip">${escapeHtml(expense.type)}</span></td>
            <td>${escapeHtml(expense.method)}</td>
            <td>${formatBRL(expense.amount)}</td>
            <td class="action-row">
              <button class="btn btn-secondary" data-action="edit" data-id="${expense.id}">Editar</button>
              <button class="btn btn-danger" data-action="delete" data-id="${expense.id}">Excluir</button>
            </td>
          </tr>
        `
      )
      .join('');
  }

  function openEditModal(expenseId) {
    const expense = state.latest.find((item) => item.id === expenseId);
    if (!expense) {
      toast('error', 'Gasto nao encontrado na listagem atual.');
      return;
    }

    els.editId.value = String(expense.id);
    els.editDate.value = expense.date;
    els.editAmount.value = expense.amount;
    els.editDescription.value = expense.description;
    els.editCategory.value = String(expense.category_id);
    els.editType.value = expense.type;
    els.editMethod.value = expense.method;
    els.editNotes.value = expense.notes || '';

    openModal('editExpenseModal');
  }

  async function deleteExpense(expenseId) {
    const confirmed = window.confirm('Deseja realmente excluir este gasto?');
    if (!confirmed) return;

    try {
      setLoading(true, 'Excluindo gasto...');
      await apiFetch(`/api/expenses/${expenseId}`, { method: 'DELETE' });
      toast('success', 'Gasto excluido.');
      await refreshDashboard();
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
