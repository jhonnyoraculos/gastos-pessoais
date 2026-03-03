(() => {
  const { apiFetch, currentMonthISO, formatBRL, setLoading, toast } = window.UI;

  const state = {
    settings: null,
    selectedMonth: currentMonthISO(),
    monthlyIncome: null,
    selectedCreditCardMonth: currentMonthISO(),
    creditCardMonthly: null,
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();

    els.monthlyIncomeMonth.value = state.selectedMonth;
    els.creditCardMonth.value = state.selectedCreditCardMonth;

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

    els.creditCardForm = document.getElementById('creditCardForm');
    els.creditCardMonth = document.getElementById('creditCardMonth');
    els.creditCardPlannedAmount = document.getElementById('creditCardPlannedAmount');
    els.creditCardInstallments = document.getElementById('creditCardInstallments');
    els.creditCardNotes = document.getElementById('creditCardNotes');
    els.creditCardHint = document.getElementById('creditCardHint');
    els.deleteCreditCardBtn = document.getElementById('deleteCreditCardBtn');

    els.summaryMonthlySalary = document.getElementById('summaryMonthlySalary');
    els.summaryMonthlySalaryMonth = document.getElementById('summaryMonthlySalaryMonth');
    els.summaryCreditCardMonth = document.getElementById('summaryCreditCardMonth');
    els.summaryCreditCardMonthLabel = document.getElementById('summaryCreditCardMonthLabel');
  }

  function bindEvents() {
    els.form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const payload = {
        payday_day: Number(els.paydayDay.value || 1),
        monthly_budget: Number(els.monthlyBudget.value || 0),
        // Mantem o app orientado a salario mensal por competencia.
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

    els.creditCardMonth.addEventListener('change', async () => {
      state.selectedCreditCardMonth = normalizeMonthValue(els.creditCardMonth.value);
      els.creditCardMonth.value = state.selectedCreditCardMonth;
      await loadCreditCardForSelectedMonth();
    });

    els.creditCardForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const month = normalizeMonthValue(els.creditCardMonth.value);
      if (!month) {
        toast('error', 'Informe um mes valido.');
        return;
      }

      const payload = {
        planned_amount: Number(els.creditCardPlannedAmount.value || 0),
        installments: Number(els.creditCardInstallments.value || 1),
        notes: els.creditCardNotes.value || null,
      };

      if (!Number.isFinite(payload.planned_amount) || payload.planned_amount <= 0) {
        toast('error', 'Valor previsto do cartao invalido.');
        return;
      }

      if (!Number.isInteger(payload.installments) || payload.installments < 1 || payload.installments > 36) {
        toast('error', 'Parcelas devem ser entre 1 e 36.');
        return;
      }

      try {
        setLoading(true, 'Salvando cartao previsto...');
        const saved = await apiFetch(`/api/credit-card-monthly/${encodeURIComponent(month)}`, {
          method: 'PUT',
          body: payload,
        });

        state.selectedCreditCardMonth = month;
        state.creditCardMonthly = {
          ...saved,
          exists: true,
        };
        renderCreditCardCard();
        renderSummaryCards();
        els.creditCardPlannedAmount.value = '';
        els.creditCardInstallments.value = 1;
        els.creditCardNotes.value = '';
        toast('success', `Compra adicionada em ${payload.installments}x.`);
      } catch (error) {
        toast('error', error.message);
      } finally {
        setLoading(false);
      }
    });

    els.deleteCreditCardBtn.addEventListener('click', async () => {
      const month = normalizeMonthValue(els.creditCardMonth.value);
      if (!month) {
        toast('error', 'Informe um mes valido.');
        return;
      }

      if (!state.creditCardMonthly?.exists) {
        toast('error', 'Nao existe previsao mensal de cartao para remover.');
        return;
      }

      const confirmed = window.confirm(`Remover previsao de cartao de ${formatMonthLabel(month)}?`);
      if (!confirmed) return;

      try {
        setLoading(true, 'Removendo cartao previsto...');
        await apiFetch(`/api/credit-card-monthly/${encodeURIComponent(month)}`, { method: 'DELETE' });
        state.creditCardMonthly = {
          month,
          planned_amount: 0,
          notes: null,
          updated_at: null,
          exists: false,
        };
        renderCreditCardCard();
        renderSummaryCards();
        toast('success', 'Previsao mensal de cartao removida.');
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
      await Promise.all([
        loadMonthlyIncomeForSelectedMonth({ withLoading: false }),
        loadCreditCardForSelectedMonth({ withLoading: false }),
      ]);
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

  async function loadCreditCardForSelectedMonth(options = {}) {
    const { withLoading = true } = options;
    const month = normalizeMonthValue(state.selectedCreditCardMonth);
    state.selectedCreditCardMonth = month;
    els.creditCardMonth.value = month;

    try {
      if (withLoading) {
        setLoading(true, 'Carregando cartao mensal...');
      }

      state.creditCardMonthly = await apiFetch(`/api/credit-card-monthly?month=${encodeURIComponent(month)}`);
      renderCreditCardCard();
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

  function renderCreditCardCard() {
    const cardMonthly = state.creditCardMonthly || {};
    const hasCardMonthly = Boolean(cardMonthly.exists);
    const monthLabel = formatMonthLabel(state.selectedCreditCardMonth);

    if (hasCardMonthly) {
      els.creditCardHint.textContent = cardMonthly.updated_at
        ? `Total previsto acumulado em ${monthLabel}: ${formatBRL(cardMonthly.planned_amount || 0)}. Atualizado em ${new Date(cardMonthly.updated_at).toLocaleString('pt-BR')}.`
        : `Total previsto acumulado em ${monthLabel}: ${formatBRL(cardMonthly.planned_amount || 0)}.`;
    } else {
      els.creditCardPlannedAmount.value = '';
      els.creditCardInstallments.value = 1;
      els.creditCardNotes.value = '';
      els.creditCardHint.textContent = `Sem previsao de cartao para ${monthLabel}.`;
    }

    els.deleteCreditCardBtn.disabled = !hasCardMonthly;
  }

  function renderSummaryCards() {
    const settings = state.settings || {};
    const monthlyBudget = Number(settings.monthly_budget || 0);
    const hasMonthly = Boolean(state.monthlyIncome?.exists);
    const monthlySalaryTotal = hasMonthly ? Number(state.monthlyIncome.salary_total || 0) : 0;
    const budgetLeft = monthlyBudget > 0 ? monthlySalaryTotal - monthlyBudget : monthlySalaryTotal;

    const hasCardMonthly = Boolean(state.creditCardMonthly?.exists);
    const cardPlannedAmount = hasCardMonthly ? Number(state.creditCardMonthly.planned_amount || 0) : 0;

    els.summaryMonthlySalary.textContent = formatBRL(monthlySalaryTotal);
    els.summaryMonthlySalaryMonth.textContent = hasMonthly
      ? `${formatMonthLabel(state.selectedMonth)} (registro mensal)`
      : `${formatMonthLabel(state.selectedMonth)} (sem registro)`;

    els.summaryCreditCardMonth.textContent = formatBRL(cardPlannedAmount);
    els.summaryCreditCardMonthLabel.textContent = hasCardMonthly
      ? `${formatMonthLabel(state.selectedCreditCardMonth)} (previsao ativa)`
      : `${formatMonthLabel(state.selectedCreditCardMonth)} (sem previsao)`;

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
