(() => {
  const { apiFetch, closeModal, currentMonthISO, formatBRL, formatDateBR, formatPercent, openModal, setLoading, toast } =
    window.UI;

  const TYPES = ['Essencial', 'Besteira', 'Investimento', 'Lazer', 'Outros'];
  const TYPE_COLORS = ['#38bdf8', '#f97316', '#22c55e', '#f59e0b', '#a78bfa'];

  const barValueLabelPlugin = {
    id: 'barValueLabel',
    afterDatasetsDraw(chart, _args, pluginOptions) {
      const datasetIndex = Number(pluginOptions?.datasetIndex ?? 0);
      const dataset = chart.data?.datasets?.[datasetIndex];
      const meta = chart.getDatasetMeta(datasetIndex);

      if (!dataset || !meta || meta.hidden) {
        return;
      }

      const ctx = chart.ctx;
      const color = pluginOptions?.color || '#dbeafe';
      const font = pluginOptions?.font || '600 12px Inter, system-ui, sans-serif';
      const offsetY = Number.isFinite(Number(pluginOptions?.offsetY)) ? Number(pluginOptions.offsetY) : 6;

      ctx.save();
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      meta.data.forEach((bar, index) => {
        const raw = Number(dataset.data[index] || 0);
        if (!Number.isFinite(raw) || raw <= 0) {
          return;
        }

        const point = bar.tooltipPosition();
        ctx.fillText(`${raw.toFixed(1)}%`, point.x, point.y - offsetY);
      });

      ctx.restore();
    },
  };

  const lineValueLabelPlugin = {
    id: 'lineValueLabel',
    afterDatasetsDraw(chart, _args, pluginOptions) {
      if (chart.config.type !== 'line') {
        return;
      }

      const datasets = chart.data?.datasets || [];
      if (!datasets.length) return;

      const ctx = chart.ctx;
      const font = pluginOptions?.font || '600 11px Inter, system-ui, sans-serif';
      const hideZero = pluginOptions?.hideZero !== false;
      const minValue = Number.isFinite(Number(pluginOptions?.minValue)) ? Number(pluginOptions.minValue) : 0;
      const offsetY = Number.isFinite(Number(pluginOptions?.offsetY)) ? Number(pluginOptions.offsetY) : 10;
      const formatter =
        typeof pluginOptions?.formatter === 'function' ? pluginOptions.formatter : (value) => String(value);
      const strokeColor = pluginOptions?.strokeColor || 'rgba(7, 12, 24, 0.95)';
      const strokeWidth = Number.isFinite(Number(pluginOptions?.strokeWidth)) ? Number(pluginOptions.strokeWidth) : 3;
      const maxLabelsPerDataset = Number.isFinite(Number(pluginOptions?.maxLabelsPerDataset))
        ? Number(pluginOptions.maxLabelsPerDataset)
        : null;

      ctx.save();
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round';

      datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (!meta || meta.hidden) {
          return;
        }

        const color =
          (Array.isArray(dataset.borderColor) ? dataset.borderColor[0] : dataset.borderColor) ||
          (Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[0] : dataset.backgroundColor) ||
          '#dbeafe';

        ctx.fillStyle = color;
        const candidates = meta.data
          .map((point, pointIndex) => ({
            point,
            pointIndex,
            raw: Number(dataset.data?.[pointIndex] || 0),
          }))
          .filter((entry) => Number.isFinite(entry.raw) && (!hideZero || entry.raw > minValue));

        const selected = maxLabelsPerDataset && candidates.length > maxLabelsPerDataset
          ? candidates
              .slice()
              .sort((a, b) => b.raw - a.raw)
              .slice(0, maxLabelsPerDataset)
              .sort((a, b) => a.pointIndex - b.pointIndex)
          : candidates;

        selected.forEach(({ point, pointIndex, raw }) => {
          const position = point.tooltipPosition();
          const lift = offsetY + datasetIndex * 12;
          const text = formatter(raw, dataset, pointIndex);
          if (!text) return;
          ctx.lineWidth = strokeWidth;
          ctx.strokeStyle = strokeColor;
          ctx.strokeText(text, position.x, position.y - lift);
          ctx.fillText(text, position.x, position.y - lift);
        });
      });

      ctx.restore();
    },
  };

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
    els.gainMonth = document.getElementById('metricGainMonth');
    els.salaryPercent = document.getElementById('metricSalaryPercent');
    els.estimatedLeft = document.getElementById('metricEstimatedLeft');
    els.realLeft = document.getElementById('metricRealLeft');
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
      const payload = await refreshDashboard({ withLoading: false });
      const salaryTotal = Number(payload?.salary_total || 0);

      if (salaryTotal <= 0) {
        const settings = await apiFetch('/api/settings');
        els.onboardingNetSalary.value = '';
        els.onboardingExtraIncome.value = Number(settings.extra_income || 0);
        els.onboardingPayday.value = Number(settings.payday_day || 1);
        els.onboardingBudget.value = Number(settings.monthly_budget || 0);
        openModal('onboardingModal', { locked: true });
      } else {
        closeModal('onboardingModal', { force: true });
      }
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

  async function refreshDashboard(options = {}) {
    const { withLoading = true } = options;
    try {
      if (withLoading) {
        setLoading(true, 'Atualizando dashboard...');
      }
      const payload = await apiFetch(dashboardUrl());
      state.latest = payload.latest_expenses || [];

      renderMetrics(payload);
      renderCharts(payload);
      renderLatestTable(state.latest);
      els.lastRefresh.textContent = `Atualizado em ${new Date().toLocaleTimeString('pt-BR')}`;
      return payload;
    } catch (error) {
      toast('error', error.message);
      return null;
    } finally {
      if (withLoading) {
        setLoading(false);
      }
    }
  }

  function renderMetrics(payload) {
    const totals = payload.totals || {};

    els.salaryTotal.textContent = formatBRL(payload.salary_total || 0);
    els.spendMonth.textContent = formatBRL(totals.spend_month || 0);
    els.gainMonth.textContent = formatBRL(totals.gain_month || 0);
    els.salaryPercent.textContent =
      totals.salary_spent_percent === null ? 'Configure seu salario' : formatPercent(totals.salary_spent_percent);
    els.estimatedLeft.textContent = formatBRL(totals.estimated_left || 0);
    els.realLeft.textContent = formatBRL(totals.real_left || 0);
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

    const typePieEntries = payload.by_type
      .map((item, index) => ({
        label: item.type,
        value: Number(item.total_spend || 0),
        color: TYPE_COLORS[index] || TYPE_COLORS[TYPE_COLORS.length - 1],
      }))
      .filter((item) => item.value > 0);

    const typePieLabels = typePieEntries.length ? typePieEntries.map((item) => item.label) : ['Sem dados'];
    const typePieValues = typePieEntries.length ? typePieEntries.map((item) => item.value) : [1];
    const typePieColors = typePieEntries.length ? typePieEntries.map((item) => item.color) : ['rgba(148, 163, 184, 0.5)'];

    const categoryPalette = ['#60a5fa', '#22d3ee', '#f59e0b', '#a3e635', '#34d399', '#fb7185', '#f97316', '#818cf8', '#facc15', '#4ade80'];
    const categoryEntries = payload.by_category
      .map((item, index) => ({
        label: item.category_name,
        value: Number(item.total_spend || 0),
        color: categoryPalette[index % categoryPalette.length],
      }))
      .filter((item) => item.value > 0);

    const categoryLabels = categoryEntries.length ? categoryEntries.map((item) => item.label) : ['Sem dados'];
    const categoryValues = categoryEntries.length ? categoryEntries.map((item) => item.value) : [1];
    const categoryColors = categoryEntries.length
      ? categoryEntries.map((item) => item.color)
      : ['rgba(148, 163, 184, 0.5)'];

    const dailyLabels = payload.daily_series.map((item) => String(item.day).padStart(2, '0'));
    const dailyValues = payload.daily_series.map((item) => Number(item.total_spend || 0));
    const dailyGainValues = payload.daily_series.map((item) => Number(item.total_gain || 0));
    const monthlySeries = Array.isArray(payload.monthly_series) ? payload.monthly_series : [];
    const monthlyLabels = monthlySeries.map((item) => formatMonthLabel(item.month));
    const monthlyValues = monthlySeries.map((item) => Number(item.total_spend || 0));

    renderOrReplaceChart('typeSpendChart', document.getElementById('chartTypeSpend'), {
      type: 'doughnut',
      data: {
        labels: typePieLabels,
        datasets: [
          {
            data: typePieValues,
            backgroundColor: typePieColors,
            borderWidth: 1,
            borderColor: '#0c172d',
          },
        ],
      },
      options: chartOptions({
        plugins: {
          legend: buildPieLegendWithValues({ position: pieLegendPosition() }),
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
        layout: {
          padding: {
            top: 16,
          },
        },
        plugins: {
          barValueLabel: {
            datasetIndex: 0,
            color: '#dbeafe',
            offsetY: 8,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grace: '12%',
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
      plugins: [barValueLabelPlugin],
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
            borderWidth: 3,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
            yAxisID: 'ySpend',
          },
          {
            label: 'Ganho por dia',
            data: dailyGainValues,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.16)',
            borderWidth: 3,
            fill: false,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: 'yGain',
          },
        ],
      },
      options: chartOptions({
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          lineValueLabel: {
            formatter: (value) => formatBRL(value),
            offsetY: 10,
            hideZero: true,
            minValue: 20,
            maxLabelsPerDataset: 4,
          },
        },
        scales: {
          ySpend: {
            beginAtZero: true,
            ticks: {
              color: '#c8d7f5',
              callback: (value) => formatBRL(value),
            },
            grid: { color: 'rgba(148, 163, 184, 0.15)' },
          },
          yGain: {
            beginAtZero: true,
            position: 'right',
            ticks: {
              color: '#86efac',
              callback: (value) => formatBRL(value),
            },
            grid: {
              drawOnChartArea: false,
            },
          },
          x: {
            ticks: { color: '#c8d7f5' },
            grid: { color: 'rgba(148, 163, 184, 0.08)' },
          },
        },
      }),
      plugins: [lineValueLabelPlugin],
    });

    renderOrReplaceChart('categoryChart', document.getElementById('chartCategory'), {
      type: 'pie',
      data: {
        labels: categoryLabels,
        datasets: [
          {
            data: categoryValues,
            backgroundColor: categoryColors,
            borderColor: '#0c172d',
            borderWidth: 1,
          },
        ],
      },
      options: chartOptions({
        plugins: { legend: buildPieLegendWithValues({ position: pieLegendPosition() }) },
      }),
    });

    renderOrReplaceChart('monthlyChart', document.getElementById('chartMonthly'), {
      type: 'line',
      data: {
        labels: monthlyLabels,
        datasets: [
          {
            label: 'Gasto mensal',
            data: monthlyValues,
            borderColor: '#22d3ee',
            backgroundColor: 'rgba(34, 211, 238, 0.16)',
            borderWidth: 3,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
          },
        ],
      },
      options: chartOptions({
        plugins: {
          lineValueLabel: {
            formatter: (value) => formatBRL(value),
            offsetY: 10,
            hideZero: true,
            minValue: 20,
            maxLabelsPerDataset: 6,
          },
        },
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
      plugins: [lineValueLabelPlugin],
    });
  }

  function pieLegendPosition() {
    return window.innerWidth <= 980 ? 'bottom' : 'right';
  }

  function buildPieLegendWithValues(options = {}) {
    const position = options.position || 'right';
    return {
      position,
      align: 'start',
      labels: {
        color: '#ffffff',
        usePointStyle: true,
        boxWidth: 10,
        boxHeight: 10,
        padding: 12,
        font: {
          size: 12,
          weight: 600,
        },
        generateLabels(chart) {
          const labels = Array.isArray(chart.data?.labels) ? chart.data.labels : [];
          const dataset = chart.data?.datasets?.[0] || {};
          const datasetValues = Array.isArray(dataset.data) ? dataset.data : [];
          const colors = Array.isArray(dataset.backgroundColor)
            ? dataset.backgroundColor
            : labels.map(() => dataset.backgroundColor || '#60a5fa');

          return labels.map((label, index) => {
            const labelText = String(label || '');
            const value = Number(datasetValues[index] ?? 0);
            return {
              text: labelText === 'Sem dados' ? labelText : `${labelText}: ${formatBRL(value)}`,
              fontColor: '#ffffff',
              fillStyle: colors[index],
              strokeStyle: '#0c172d',
              lineWidth: 1,
              hidden: !chart.getDataVisibility(index),
              index,
              datasetIndex: 0,
              pointStyle: 'circle',
            };
          });
        },
      },
    };
  }

  function formatMonthLabel(monthText) {
    if (!monthText || typeof monthText !== 'string' || !monthText.includes('-')) {
      return String(monthText || '');
    }
    const [year, month] = monthText.split('-').map(Number);
    if (!year || !month) return monthText;
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
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
