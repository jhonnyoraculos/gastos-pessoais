(() => {
  const { apiFetch, formatBRL, setLoading, toast } = window.UI;

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();
    await loadSettings();
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
        renderSettings(updated);
        toast('success', 'Configuracoes atualizadas.');
      } catch (error) {
        toast('error', error.message);
      } finally {
        setLoading(false);
      }
    });
  }

  async function loadSettings() {
    try {
      setLoading(true, 'Carregando configuracoes...');
      const settings = await apiFetch('/api/settings');
      renderSettings(settings);
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function renderSettings(settings) {
    const netSalary = Number(settings.net_salary || 0);
    const extraIncome = Number(settings.extra_income || 0);
    const monthlyBudget = Number(settings.monthly_budget || 0);
    const salaryTotal = netSalary + extraIncome;
    const budgetLeft = monthlyBudget > 0 ? salaryTotal - monthlyBudget : salaryTotal;

    els.netSalary.value = netSalary;
    els.extraIncome.value = extraIncome;
    els.paydayDay.value = Number(settings.payday_day || 1);
    els.monthlyBudget.value = monthlyBudget;

    els.summarySalary.textContent = formatBRL(salaryTotal);
    els.summaryBudget.textContent = formatBRL(monthlyBudget);
    els.summaryLeft.textContent = formatBRL(budgetLeft);
    els.updatedAt.textContent = settings.updated_at
      ? `Ultima atualizacao: ${new Date(settings.updated_at).toLocaleString('pt-BR')}`
      : 'Ultima atualizacao: -';
  }
})();
