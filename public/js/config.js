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
    els.paydayDay = document.getElementById('paydayDay');
    els.monthlyBudget = document.getElementById('monthlyBudget');
    els.summaryPayday = document.getElementById('summaryPaydayDay');
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
        payday_day: Number(els.paydayDay.value || 1),
        monthly_budget: Number(els.monthlyBudget.value || 0),
        // Mantem o app 100% orientado a salario mensal por competencia.
        net_salary: 0,
        extra_income: 0,
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
    const monthlyBudget = Number(settings.monthly_budget || 0);
    const paydayDay = Number(settings.payday_day || 1) || 1;

    els.paydayDay.value = paydayDay;
    els.monthlyBudget.value = monthlyBudget;

    els.summaryPayday.textContent = `Dia ${paydayDay}`;
    els.summaryBudget.textContent = formatBRL(monthlyBudget);
    els.updatedAt.textContent = settings.updated_at
      ? `Ultima atualizacao: ${new Date(settings.updated_at).toLocaleString('pt-BR')}`
      : 'Ultima atualizacao: -';

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
      els.monthlyIncomeNetSalary.value = 0;
      els.monthlyIncomeExtraIncome.value = 0;
      els.monthlyIncomeHint.textContent = `Sem registro mensal para ${monthLabel}.`;
    }

    els.deleteMonthlyIncomeBtn.disabled = !hasMonthly;
  }

  function renderSummaryCards() {
    const settings = state.settings || {};
    const monthlyBudget = Number(settings.monthly_budget || 0);
    const hasMonthly = Boolean(state.monthlyIncome?.exists);
    const monthlySalaryTotal = hasMonthly ? Number(state.monthlyIncome.salary_total || 0) : 0;
    const budgetLeft = monthlyBudget > 0 ? monthlySalaryTotal - monthlyBudget : monthlySalaryTotal;

    els.summaryMonthlySalary.textContent = formatBRL(monthlySalaryTotal);
    els.summaryMonthlySalaryMonth.textContent = hasMonthly
      ? `${formatMonthLabel(state.selectedMonth)} (registro mensal)`
      : `${formatMonthLabel(state.selectedMonth)} (sem registro)`;
    els.summaryLeft.textContent = formatBRL(budgetLeft);
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
