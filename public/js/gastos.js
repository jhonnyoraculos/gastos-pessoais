(() => {
  const { apiFetch, closeModal, currentMonthISO, formatBRL, formatDateBR, openModal, setLoading, toast, todayISO } = window.UI;

  const state = {
    categories: [],
    expenses: [],
    expensesTotal: 0,
    expensesLimit: 20,
    expensesOffset: 0,
    incomes: [],
    incomesTotal: 0,
    incomesLimit: 20,
    incomesOffset: 0,
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();

    const today = todayISO();
    const month = currentMonthISO();

    els.expenseDate.value = today;
    els.incomeDate.value = today;
    els.listMonth.value = month;
    els.incomeListMonth.value = month;

    await loadCategories();
    await reloadExpenses();
    await reloadIncomes();
  }

  function cacheElements() {
    els.expenseForm = document.getElementById('expenseForm');
    els.expenseDate = document.getElementById('expenseDate');
    els.expenseAmount = document.getElementById('expenseAmount');
    els.expenseDescription = document.getElementById('expenseDescription');
    els.expenseCategory = document.getElementById('expenseCategory');
    els.expenseType = document.getElementById('expenseType');
    els.expenseMethod = document.getElementById('expenseMethod');
    els.expenseNotes = document.getElementById('expenseNotes');

    els.incomeForm = document.getElementById('incomeForm');
    els.incomeDate = document.getElementById('incomeDate');
    els.incomeAmount = document.getElementById('incomeAmount');
    els.incomeDescription = document.getElementById('incomeDescription');
    els.incomeCategory = document.getElementById('incomeCategory');
    els.incomeMethod = document.getElementById('incomeMethod');
    els.incomeNotes = document.getElementById('incomeNotes');

    els.newCategoryName = document.getElementById('newCategoryName');
    els.newCategoryBtn = document.getElementById('newCategoryBtn');

    els.listMonth = document.getElementById('listMonth');
    els.searchInput = document.getElementById('searchInput');
    els.filterCategory = document.getElementById('filterCategory');
    els.filterType = document.getElementById('filterType');
    els.applyFiltersBtn = document.getElementById('applyFiltersBtn');
    els.clearFiltersBtn = document.getElementById('clearFiltersBtn');

    els.incomeListMonth = document.getElementById('incomeListMonth');
    els.incomeSearchInput = document.getElementById('incomeSearchInput');
    els.incomeFilterCategory = document.getElementById('incomeFilterCategory');
    els.incomeFilterMethod = document.getElementById('incomeFilterMethod');
    els.applyIncomeFiltersBtn = document.getElementById('applyIncomeFiltersBtn');
    els.clearIncomeFiltersBtn = document.getElementById('clearIncomeFiltersBtn');

    els.expensesBody = document.getElementById('expensesBody');
    els.loadMoreBtn = document.getElementById('loadMoreBtn');
    els.listMeta = document.getElementById('listMeta');

    els.incomesBody = document.getElementById('incomesBody');
    els.loadMoreIncomesBtn = document.getElementById('loadMoreIncomesBtn');
    els.incomeListMeta = document.getElementById('incomeListMeta');

    els.editForm = document.getElementById('editExpenseForm');
    els.editId = document.getElementById('editExpenseId');
    els.editDate = document.getElementById('editDate');
    els.editAmount = document.getElementById('editAmount');
    els.editDescription = document.getElementById('editDescription');
    els.editCategory = document.getElementById('editCategory');
    els.editType = document.getElementById('editType');
    els.editMethod = document.getElementById('editMethod');
    els.editNotes = document.getElementById('editNotes');

    els.editIncomeForm = document.getElementById('editIncomeForm');
    els.editIncomeId = document.getElementById('editIncomeId');
    els.editIncomeDate = document.getElementById('editIncomeDate');
    els.editIncomeAmount = document.getElementById('editIncomeAmount');
    els.editIncomeDescription = document.getElementById('editIncomeDescription');
    els.editIncomeCategory = document.getElementById('editIncomeCategory');
    els.editIncomeMethod = document.getElementById('editIncomeMethod');
    els.editIncomeNotes = document.getElementById('editIncomeNotes');
  }

  function bindEvents() {
    els.expenseForm.addEventListener('submit', handleCreateExpense);
    els.incomeForm.addEventListener('submit', handleCreateIncome);

    els.newCategoryBtn.addEventListener('click', handleCreateCategory);

    els.applyFiltersBtn.addEventListener('click', reloadExpenses);
    els.clearFiltersBtn.addEventListener('click', async () => {
      els.searchInput.value = '';
      els.filterCategory.value = '';
      els.filterType.value = '';
      els.listMonth.value = currentMonthISO();
      await reloadExpenses();
    });
    els.searchInput.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      await reloadExpenses();
    });

    els.applyIncomeFiltersBtn.addEventListener('click', reloadIncomes);
    els.clearIncomeFiltersBtn.addEventListener('click', async () => {
      els.incomeSearchInput.value = '';
      els.incomeFilterCategory.value = '';
      els.incomeFilterMethod.value = '';
      els.incomeListMonth.value = currentMonthISO();
      await reloadIncomes();
    });
    els.incomeSearchInput.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      await reloadIncomes();
    });

    els.loadMoreBtn.addEventListener('click', async () => {
      await loadExpenses(false);
    });
    els.loadMoreIncomesBtn.addEventListener('click', async () => {
      await loadIncomes(false);
    });

    els.expensesBody.addEventListener('click', async (event) => {
      const target = event.target.closest('button[data-action]');
      if (!target) return;
      const expenseId = Number(target.dataset.id);
      if (target.dataset.action === 'edit') {
        openEditModal(expenseId);
      }
      if (target.dataset.action === 'delete') {
        await deleteExpense(expenseId);
      }
    });

    els.incomesBody.addEventListener('click', async (event) => {
      const target = event.target.closest('button[data-action]');
      if (!target) return;
      const incomeId = Number(target.dataset.id);
      if (target.dataset.action === 'edit') {
        openEditIncomeModal(incomeId);
      }
      if (target.dataset.action === 'delete') {
        await deleteIncome(incomeId);
      }
    });

    els.editForm.addEventListener('submit', handleEditExpense);
    els.editIncomeForm.addEventListener('submit', handleEditIncome);
  }

  async function handleCreateExpense(event) {
    event.preventDefault();

    const payload = {
      date: els.expenseDate.value,
      amount: Number(els.expenseAmount.value),
      description: els.expenseDescription.value,
      category_id: Number(els.expenseCategory.value),
      type: els.expenseType.value,
      method: els.expenseMethod.value,
      notes: els.expenseNotes.value || null,
    };

    try {
      setLoading(true, 'Salvando gasto...');
      await apiFetch('/api/expenses', { method: 'POST', body: payload });
      toast('success', 'Gasto cadastrado com sucesso.');
      els.expenseAmount.value = '';
      els.expenseDescription.value = '';
      els.expenseNotes.value = '';
      els.expenseDate.value = todayISO();
      await reloadExpenses();
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateIncome(event) {
    event.preventDefault();

    const payload = {
      date: els.incomeDate.value,
      amount: Number(els.incomeAmount.value),
      description: els.incomeDescription.value,
      category_id: Number(els.incomeCategory.value),
      method: els.incomeMethod.value,
      notes: els.incomeNotes.value || null,
    };

    try {
      setLoading(true, 'Salvando ganho...');
      await apiFetch('/api/incomes', { method: 'POST', body: payload });
      toast('success', 'Ganho cadastrado com sucesso.');
      els.incomeAmount.value = '';
      els.incomeDescription.value = '';
      els.incomeNotes.value = '';
      els.incomeDate.value = todayISO();
      await reloadIncomes();
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCategory() {
    const name = els.newCategoryName.value.trim();
    if (!name) {
      toast('error', 'Informe o nome da nova categoria.');
      return;
    }

    try {
      setLoading(true, 'Criando categoria...');
      const category = await apiFetch('/api/categories', {
        method: 'POST',
        body: { name },
      });
      els.newCategoryName.value = '';
      toast('success', `Categoria "${category.name}" criada.`);
      await loadCategories();
      const categoryId = String(category.id);
      els.expenseCategory.value = categoryId;
      els.incomeCategory.value = categoryId;
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEditExpense(event) {
    event.preventDefault();
    const expenseId = Number(els.editId.value);
    if (!expenseId) return;

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
      setLoading(true, 'Atualizando gasto...');
      await apiFetch(`/api/expenses/${expenseId}`, { method: 'PUT', body: payload });
      closeModal('editExpenseModal');
      toast('success', 'Gasto atualizado.');
      await reloadExpenses();
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEditIncome(event) {
    event.preventDefault();
    const incomeId = Number(els.editIncomeId.value);
    if (!incomeId) return;

    const payload = {
      date: els.editIncomeDate.value,
      amount: Number(els.editIncomeAmount.value),
      description: els.editIncomeDescription.value,
      category_id: Number(els.editIncomeCategory.value),
      method: els.editIncomeMethod.value,
      notes: els.editIncomeNotes.value || null,
    };

    try {
      setLoading(true, 'Atualizando ganho...');
      await apiFetch(`/api/incomes/${incomeId}`, { method: 'PUT', body: payload });
      closeModal('editIncomeModal');
      toast('success', 'Ganho atualizado.');
      await reloadIncomes();
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function buildExpenseParams() {
    const month = els.listMonth.value || currentMonthISO();
    const params = new URLSearchParams({
      month,
      limit: String(state.expensesLimit),
      offset: String(state.expensesOffset),
    });

    const q = els.searchInput.value.trim();
    const category = els.filterCategory.value;
    const type = els.filterType.value;

    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (type) params.set('type', type);

    return params;
  }

  function buildIncomeParams() {
    const month = els.incomeListMonth.value || currentMonthISO();
    const params = new URLSearchParams({
      month,
      limit: String(state.incomesLimit),
      offset: String(state.incomesOffset),
    });

    const q = els.incomeSearchInput.value.trim();
    const category = els.incomeFilterCategory.value;
    const method = els.incomeFilterMethod.value;

    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (method) params.set('method', method);

    return params;
  }

  async function reloadExpenses() {
    state.expensesOffset = 0;
    state.expenses = [];
    await loadExpenses(true);
  }

  async function loadExpenses(replace = false) {
    try {
      setLoading(true, 'Carregando gastos...');
      const params = buildExpenseParams();
      const data = await apiFetch(`/api/expenses?${params.toString()}`);

      if (replace) {
        state.expenses = data.items || [];
      } else {
        state.expenses = state.expenses.concat(data.items || []);
      }

      state.expensesTotal = Number(data.total || 0);
      state.expensesOffset = state.expenses.length;

      renderExpenses();
      refreshExpensePagingState();
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function reloadIncomes() {
    state.incomesOffset = 0;
    state.incomes = [];
    await loadIncomes(true);
  }

  async function loadIncomes(replace = false) {
    try {
      setLoading(true, 'Carregando ganhos...');
      const params = buildIncomeParams();
      const data = await apiFetch(`/api/incomes?${params.toString()}`);

      if (replace) {
        state.incomes = data.items || [];
      } else {
        state.incomes = state.incomes.concat(data.items || []);
      }

      state.incomesTotal = Number(data.total || 0);
      state.incomesOffset = state.incomes.length;

      renderIncomes();
      refreshIncomePagingState();
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function renderExpenses() {
    if (!state.expenses.length) {
      els.expensesBody.innerHTML = '<tr><td class="empty-row" colspan="8">Nenhum gasto encontrado.</td></tr>';
      return;
    }

    els.expensesBody.innerHTML = state.expenses
      .map(
        (expense) => `
          <tr>
            <td>${formatDateBR(expense.date)}</td>
            <td>${escapeHtml(expense.description)}</td>
            <td>${escapeHtml(expense.category_name || '-')}</td>
            <td>${escapeHtml(expense.type)}</td>
            <td>${escapeHtml(expense.method)}</td>
            <td>${formatBRL(expense.amount)}</td>
            <td>${escapeHtml(expense.notes || '-')}</td>
            <td class="action-row">
              <button class="btn btn-secondary" data-action="edit" data-id="${expense.id}">Editar</button>
              <button class="btn btn-danger" data-action="delete" data-id="${expense.id}">Excluir</button>
            </td>
          </tr>
        `
      )
      .join('');
  }

  function renderIncomes() {
    if (!state.incomes.length) {
      els.incomesBody.innerHTML = '<tr><td class="empty-row" colspan="7">Nenhum ganho encontrado.</td></tr>';
      return;
    }

    els.incomesBody.innerHTML = state.incomes
      .map(
        (income) => `
          <tr>
            <td>${formatDateBR(income.date)}</td>
            <td>${escapeHtml(income.description)}</td>
            <td>${escapeHtml(income.category_name || '-')}</td>
            <td>${escapeHtml(income.method)}</td>
            <td>${formatBRL(income.amount)}</td>
            <td>${escapeHtml(income.notes || '-')}</td>
            <td class="action-row">
              <button class="btn btn-secondary" data-action="edit" data-id="${income.id}">Editar</button>
              <button class="btn btn-danger" data-action="delete" data-id="${income.id}">Excluir</button>
            </td>
          </tr>
        `
      )
      .join('');
  }

  function refreshExpensePagingState() {
    const hasMore = state.expensesOffset < state.expensesTotal;
    els.loadMoreBtn.style.display = hasMore ? 'inline-flex' : 'none';
    els.listMeta.textContent = `Mostrando ${state.expenses.length} de ${state.expensesTotal} gastos`;
  }

  function refreshIncomePagingState() {
    const hasMore = state.incomesOffset < state.incomesTotal;
    els.loadMoreIncomesBtn.style.display = hasMore ? 'inline-flex' : 'none';
    els.incomeListMeta.textContent = `Mostrando ${state.incomes.length} de ${state.incomesTotal} ganhos`;
  }

  async function loadCategories() {
    try {
      const response = await apiFetch('/api/categories');
      state.categories = response.items || [];
      renderCategoryOptions();
    } catch (error) {
      toast('error', error.message);
    }
  }

  function renderCategoryOptions() {
    const categoryOptions = state.categories
      .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
      .join('');

    const baseSelect = '<option value="">Selecione</option>';
    const baseFilter = '<option value="">Todas categorias</option>';

    els.expenseCategory.innerHTML = baseSelect + categoryOptions;
    els.incomeCategory.innerHTML = baseSelect + categoryOptions;
    els.editCategory.innerHTML = baseSelect + categoryOptions;
    els.editIncomeCategory.innerHTML = baseSelect + categoryOptions;
    els.filterCategory.innerHTML = baseFilter + categoryOptions;
    els.incomeFilterCategory.innerHTML = baseFilter + categoryOptions;
  }

  function openEditModal(expenseId) {
    const expense = state.expenses.find((item) => item.id === expenseId);
    if (!expense) {
      toast('error', 'Gasto nao encontrado na lista carregada.');
      return;
    }

    els.editId.value = expense.id;
    els.editDate.value = expense.date;
    els.editAmount.value = expense.amount;
    els.editDescription.value = expense.description;
    els.editCategory.value = String(expense.category_id);
    els.editType.value = expense.type;
    els.editMethod.value = expense.method;
    els.editNotes.value = expense.notes || '';

    openModal('editExpenseModal');
  }

  function openEditIncomeModal(incomeId) {
    const income = state.incomes.find((item) => item.id === incomeId);
    if (!income) {
      toast('error', 'Ganho nao encontrado na lista carregada.');
      return;
    }

    els.editIncomeId.value = income.id;
    els.editIncomeDate.value = income.date;
    els.editIncomeAmount.value = income.amount;
    els.editIncomeDescription.value = income.description;
    els.editIncomeCategory.value = String(income.category_id);
    els.editIncomeMethod.value = income.method;
    els.editIncomeNotes.value = income.notes || '';

    openModal('editIncomeModal');
  }

  async function deleteExpense(expenseId) {
    const confirmed = window.confirm('Confirma a exclusao deste gasto?');
    if (!confirmed) return;

    try {
      setLoading(true, 'Excluindo gasto...');
      await apiFetch(`/api/expenses/${expenseId}`, { method: 'DELETE' });
      toast('success', 'Gasto excluido.');
      await reloadExpenses();
    } catch (error) {
      toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteIncome(incomeId) {
    const confirmed = window.confirm('Confirma a exclusao deste ganho?');
    if (!confirmed) return;

    try {
      setLoading(true, 'Excluindo ganho...');
      await apiFetch(`/api/incomes/${incomeId}`, { method: 'DELETE' });
      toast('success', 'Ganho excluido.');
      await reloadIncomes();
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
