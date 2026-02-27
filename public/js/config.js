(() => {
  const { apiFetch, currentMonthISO, formatBRL, setLoading, toast } = window.UI;

  const state = {
    settings: null,
    selectedMonth: currentMonthISO(),
    monthlyIncome: null,
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();
    els.monthlyIncomeMonth.value = state.selectedMonth;
    await loadInitialData();
  }

  function cacheElements() {
    els.form = document.getElementById('settingsForm');
    els.netSalary = document.getElementById('netSalary');
    els.extraIncome = document.getElementById('extraIncome');
    els.paydayDay = document.getElementById('paydayDay');
    els.monthlyBudget = document.getElementById('monthlyBudget');
    els.summarySalary = document.getElementById('summarySalaryTotal');
    els.summaryBudget = document.getElementById('summaryBudget');
    els.summaryLeft = document.getElementById('summaryBudgetLeft');
    els.updatedAt = document.getElementById('settingsUpdatedAt');

    els.monthlyIncomeForm = document.getElementById('monthlyIncomeForm');
    els.monthlyIncomeMonth = document.getElementById('monthlyIncomeMonth');
    els.monthlyIncomeNetSalary = document.getElementById('monthlyIncomeNetSalary');
    els.monthlyIncomeExtraIncome = document.getElementById('monthlyIncomeExtraIncome');
    els.monthlyIncomeHint = document.getElementById('monthlyIncomeHint');
    els.deleteMonthlyIncomeBtn = document.getElementById('deleteMonthlyIncomeBtn');

    els.summaryMonthlySalary = document.getElementById('summaryMonthlySalary');
    els.summaryMonthlySalaryMonth = document.getElementById('summaryMonthlySalaryMonth');
  }

  function bindEvents() {
    els.form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const payload = {
        net_salary: Number(els.netSalary.value || 0),
        extra_income: Number(els.extraIncome.value || 0),
        payday_day: Number(els.paydayDay.value || 1),
        monthly_budget: Number(els.monthlyBudget.value || 0),
      };

      try {
        setLoading(true, 'Salvando configuracoes...');
        const updated = await apiFetch('/api/settings', {
          method: 'PUT',
          body: payload,
        });
        state.settings = updated;
        renderSettings();
        toast('success', 'Configuracoes atualizadas.');
      } catch (error) {
        toast('error', error.message);
      } finally {
        setLoading(false);
      }
    });

    els.monthlyIncomeMonth.addEventListener('change', async () => {
      state.selectedMonth = normalizeMonthValue(els.monthlyIncomeMonth.value);
      els.monthlyIncomeMonth.value = state.selectedMonth;
      await loadMonthlyIncomeForSelectedMonth();
    });

    els.monthlyIncomeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const month = normalizeMonthValue(els.monthlyIncomeMonth.value);
      if (!month) {
        toast('error', 'Informe um mes valido.');
        return;
      }

      const payload = {
        net_salary: Number(els.monthlyIncomeNetSalary.value || 0),
        extra_income: Number(els.monthlyIncomeExtraIncome.value || 0),
      };

      if (!Number.isFinite(payload.net_salary) || payload.net_salary < 0) {
        toast('error', 'Salario do mes invalido.');
        return;
      }

      if (!Number.isFinite(payload.extra_income) || payload.extra_income < 0) {
        toast('error', 'Renda extra do mes invalida.');
        return;
      }

      try {
        setLoading(true, 'Salvando salario mensal...');
        const saved = await apiFetch(`/api/monthly-income/${encodeURIComponent(month)}`, {
          method: 'PUT',
          body: payload,
        });

        state.selectedMonth = month;
        state.monthlyIncome = {
          ...saved,
          exists: true,
        };
        renderMonthlyIncomeCard();
        renderSummaryCards();
        toast('success', 'Salario mensal salvo.');
      } catch (error) {
        toast('error', error.message);
      } finally {
        setLoading(false);
      }
    });

    els.deleteMonthlyIncomeBtn.addEventListener('click', async () => {
      const month = normalizeMonthValue(els.monthlyIncomeMonth.value);
      if (!month) {
        toast('error', 'Informe um mes valido.');
        return;
      }

      if (!state.monthlyIncome?.exists) {
        toast('error', 'Nao existe registro mensal para remover.');
        return;
      }

      const confirmed = window.confirm(`Remover o registro mensal de ${formatMonthLabel(month)}?`);
      if (!confirmed) return;

      try {
        setLoading(true, 'Removendo salario mensal...');
        await apiFetch(`/api/monthly-income/${encodeURIComponent(month)}`, { method: 'DELETE' });
        state.monthlyIncome = {
          month,
          net_salary: 0,
          extra_income: 0,
          salary_total: 0,
          updated_at: null,
          exists: false,
        };
        renderMonthlyIncomeCard();
        renderSummaryCards();
        toast('success', 'Registro mensal removido.');
      } catch (error) {
        toast('error', error.message);
      } finally {
        setLoading(false);
      }
    });
  }

  async function loadInitialData() {
    try {
      setLoading(true, 'Carregando configuracoes...');
      state.settings = await apiFetch('/api/settings');
      renderSettings();
      await loadMonthlyIncomeForSelectedMonth({ withLoading: false });
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMonthlyIncomeForSelectedMonth(options = {}) {
    const { withLoading = true } = options;
    const month = normalizeMonthValue(state.selectedMonth);
    state.selectedMonth = month;
    els.monthlyIncomeMonth.value = month;

    try {
      if (withLoading) {
        setLoading(true, 'Carregando salario mensal...');
      }

      state.monthlyIncome = await apiFetch(`/api/monthly-income?month=${encodeURIComponent(month)}`);
      renderMonthlyIncomeCard();
      renderSummaryCards();
    } catch (error) {
      toast('error', error.message);
    } finally {
      if (withLoading) {
        setLoading(false);
      }
    }
  }

  function renderSettings() {
    const settings = state.settings || {};
    const netSalary = Number(settings.net_salary || 0);
    const extraIncome = Number(settings.extra_income || 0);
    const monthlyBudget = Number(settings.monthly_budget || 0);
    const salaryTotal = netSalary + extraIncome;
    const budgetLeft = monthlyBudget > 0 ? salaryTotal - monthlyBudget : salaryTotal;

    els.netSalary.value = netSalary;
    els.extraIncome.value = extraIncome;
    els.paydayDay.value = Number(settings.payday_day || 1) || 1;
    els.monthlyBudget.value = monthlyBudget;

    els.summarySalary.textContent = formatBRL(salaryTotal);
    els.summaryBudget.textContent = formatBRL(monthlyBudget);
    els.summaryLeft.textContent = formatBRL(budgetLeft);
    els.updatedAt.textContent = settings.updated_at
      ? `Ultima atualizacao: ${new Date(settings.updated_at).toLocaleString('pt-BR')}`
      : 'Ultima atualizacao: -';

    if (!state.monthlyIncome?.exists) {
      els.monthlyIncomeNetSalary.value = netSalary;
      els.monthlyIncomeExtraIncome.value = extraIncome;
    }

    renderSummaryCards();
  }

  function renderMonthlyIncomeCard() {
    const monthly = state.monthlyIncome || {};
    const hasMonthly = Boolean(monthly.exists);
    const monthLabel = formatMonthLabel(state.selectedMonth);

    if (hasMonthly) {
      els.monthlyIncomeNetSalary.value = Number(monthly.net_salary || 0);
      els.monthlyIncomeExtraIncome.value = Number(monthly.extra_income || 0);
      els.monthlyIncomeHint.textContent = monthly.updated_at
        ? `Registro mensal ativo para ${monthLabel}. Atualizado em ${new Date(monthly.updated_at).toLocaleString('pt-BR')}.`
        : `Registro mensal ativo para ${monthLabel}.`;
    } else {
      const defaultNet = Number(state.settings?.net_salary || 0);
      const defaultExtra = Number(state.settings?.extra_income || 0);
      els.monthlyIncomeNetSalary.value = defaultNet;
      els.monthlyIncomeExtraIncome.value = defaultExtra;
      els.monthlyIncomeHint.textContent = `Sem registro mensal para ${monthLabel}. O dashboard usa o salario padrao.`;
    }

    els.deleteMonthlyIncomeBtn.disabled = !hasMonthly;
  }

  function renderSummaryCards() {
    const settings = state.settings || {};
    const defaultSalaryTotal = Number(settings.net_salary || 0) + Number(settings.extra_income || 0);
    const hasMonthly = Boolean(state.monthlyIncome?.exists);
    const monthlySalaryTotal = hasMonthly
      ? Number(state.monthlyIncome.salary_total || 0)
      : defaultSalaryTotal;

    els.summaryMonthlySalary.textContent = formatBRL(monthlySalaryTotal);
    els.summaryMonthlySalaryMonth.textContent = hasMonthly
      ? `${formatMonthLabel(state.selectedMonth)} (registro mensal)`
      : `${formatMonthLabel(state.selectedMonth)} (salario padrao)`;
  }

  function normalizeMonthValue(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value.trim())) {
      return value.trim();
    }
    return currentMonthISO();
  }

  function formatMonthLabel(month) {
    const normalized = normalizeMonthValue(month);
    const [year, monthNumber] = normalized.split('-').map(Number);
    if (!year || !monthNumber) return normalized;
    return new Date(year, monthNumber - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }
})();
