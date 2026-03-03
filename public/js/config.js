(() => {
  const { apiFetch, currentMonthISO, formatBRL, setLoading, toast } = window.UI;

  const state = {
    settings: null,
    selectedMonth: currentMonthISO(),
    monthlyIncome: null,
    selectedCreditCardMonth: currentMonthISO(),
    creditCardMonthly: null,
    creditCardPurchases: [],
    editingCreditCardPurchaseId: null,
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
    els.cancelCreditCardEditBtn = document.getElementById('cancelCreditCardEditBtn');
    els.saveCreditCardBtn = document.getElementById('saveCreditCardBtn');
    els.creditCardPurchasesBody = document.getElementById('creditCardPurchasesBody');

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
      resetCreditCardEditMode();
      await loadCreditCardForSelectedMonth();
    });

    els.creditCardForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveCreditCardPurchase();
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

      const confirmed = window.confirm(
        `Remover compras iniciadas em ${formatMonthLabel(month)} e ajustes manuais deste mes?`
      );
      if (!confirmed) return;

      try {
        setLoading(true, 'Removendo cartao do mes...');
        await apiFetch(`/api/credit-card-monthly/${encodeURIComponent(month)}`, { method: 'DELETE' });
        resetCreditCardEditMode();
        await loadCreditCardForSelectedMonth({ withLoading: false });
        toast('success', 'Registros de cartao do mes removidos.');
      } catch (error) {
        toast('error', error.message);
      } finally {
        setLoading(false);
      }
    });

    els.cancelCreditCardEditBtn.addEventListener('click', () => {
      resetCreditCardEditMode();
    });

    els.creditCardPurchasesBody.addEventListener('click', async (event) => {
      const target = event.target.closest('button[data-action]');
      if (!target) return;
      const id = Number(target.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;

      if (target.dataset.action === 'edit') {
        startEditCreditCardPurchase(id);
        return;
      }

      if (target.dataset.action === 'delete') {
        const confirmed = window.confirm('Excluir esta compra de cartao?');
        if (!confirmed) return;

        try {
          setLoading(true, 'Excluindo compra de cartao...');
          await apiFetch(`/api/credit-card-purchases/${id}`, { method: 'DELETE' });
          if (state.editingCreditCardPurchaseId === id) {
            resetCreditCardEditMode();
          }
          await loadCreditCardForSelectedMonth({ withLoading: false });
          toast('success', 'Compra de cartao excluida.');
        } catch (error) {
          toast('error', error.message);
        } finally {
          setLoading(false);
        }
      }
    });
  }

  async function saveCreditCardPurchase() {
    const month = normalizeMonthValue(els.creditCardMonth.value);
    if (!month) {
      toast('error', 'Informe um mes valido.');
      return;
    }

    const payload = {
      start_month: month,
      total_amount: Number(els.creditCardPlannedAmount.value || 0),
      installments: Number(els.creditCardInstallments.value || 1),
      notes: els.creditCardNotes.value || null,
    };

    if (!Number.isFinite(payload.total_amount) || payload.total_amount <= 0) {
      toast('error', 'Valor da compra invalido.');
      return;
    }

    if (!Number.isInteger(payload.installments) || payload.installments < 1 || payload.installments > 36) {
      toast('error', 'Parcelas devem ser entre 1 e 36.');
      return;
    }

    try {
      const isEditing = Number.isInteger(state.editingCreditCardPurchaseId) && state.editingCreditCardPurchaseId > 0;
      setLoading(true, isEditing ? 'Atualizando compra...' : 'Adicionando compra parcelada...');

      if (isEditing) {
        await apiFetch(`/api/credit-card-purchases/${state.editingCreditCardPurchaseId}`, {
          method: 'PUT',
          body: payload,
        });
      } else {
        await apiFetch('/api/credit-card-purchases', {
          method: 'POST',
          body: payload,
        });
      }

      resetCreditCardEditMode();
      await loadCreditCardForSelectedMonth({ withLoading: false });
      toast('success', isEditing ? 'Compra de cartao atualizada.' : `Compra adicionada em ${payload.installments}x.`);
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
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

      const [monthly, purchases] = await Promise.all([
        apiFetch(`/api/credit-card-monthly?month=${encodeURIComponent(month)}`),
        apiFetch(`/api/credit-card-purchases?month=${encodeURIComponent(month)}`),
      ]);

      state.creditCardMonthly = monthly;
      state.creditCardPurchases = purchases.items || [];
      renderCreditCardCard();
      renderCreditCardPurchases();
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
      const manual = Number(cardMonthly.manual_amount || 0);
      const purchases = Number(cardMonthly.purchases_amount || 0);
      els.creditCardHint.textContent = cardMonthly.updated_at
        ? `Total previsto em ${monthLabel}: ${formatBRL(cardMonthly.planned_amount || 0)} (compras: ${formatBRL(purchases)}, ajuste manual legado: ${formatBRL(manual)}). Atualizado em ${new Date(cardMonthly.updated_at).toLocaleString('pt-BR')}.`
        : `Total previsto em ${monthLabel}: ${formatBRL(cardMonthly.planned_amount || 0)}.`;
    } else {
      els.creditCardHint.textContent = `Sem previsao de cartao para ${monthLabel}.`;
    }

    els.deleteCreditCardBtn.disabled = !hasCardMonthly && state.creditCardPurchases.length === 0;
  }

  function renderCreditCardPurchases() {
    if (!state.creditCardPurchases.length) {
      els.creditCardPurchasesBody.innerHTML =
        '<tr><td class="empty-row" colspan="6">Nenhuma compra de cartao neste mes.</td></tr>';
      return;
    }

    els.creditCardPurchasesBody.innerHTML = state.creditCardPurchases
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(formatMonthLabel(item.start_month))}</td>
            <td>${formatBRL(item.total_amount)}</td>
            <td>${item.installments}x</td>
            <td>${formatBRL(item.amount_in_month)}</td>
            <td>${escapeHtml(item.notes || '-')}</td>
            <td class="action-row">
              <button class="btn btn-secondary" data-action="edit" data-id="${item.id}">Editar</button>
              <button class="btn btn-danger" data-action="delete" data-id="${item.id}">Excluir</button>
            </td>
          </tr>
        `
      )
      .join('');
  }

  function startEditCreditCardPurchase(id) {
    const purchase = state.creditCardPurchases.find((item) => item.id === id);
    if (!purchase) {
      toast('error', 'Compra nao encontrada.');
      return;
    }

    state.editingCreditCardPurchaseId = id;
    els.creditCardMonth.value = purchase.start_month;
    state.selectedCreditCardMonth = purchase.start_month;
    els.creditCardPlannedAmount.value = Number(purchase.total_amount || 0);
    els.creditCardInstallments.value = Number(purchase.installments || 1);
    els.creditCardNotes.value = purchase.notes || '';
    els.saveCreditCardBtn.textContent = 'Salvar edicao';
    els.cancelCreditCardEditBtn.style.display = 'inline-flex';
  }

  function resetCreditCardEditMode() {
    state.editingCreditCardPurchaseId = null;
    els.creditCardPlannedAmount.value = '';
    els.creditCardInstallments.value = 1;
    els.creditCardNotes.value = '';
    els.saveCreditCardBtn.textContent = 'Adicionar compra parcelada';
    els.cancelCreditCardEditBtn.style.display = 'none';
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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
