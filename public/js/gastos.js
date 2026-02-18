(() => {
  const { apiFetch, closeModal, currentMonthISO, formatBRL, formatDateBR, openModal, setLoading, toast, todayISO } = window.UI;

  const state = {
    categories: [],
    expenses: [],
    total: 0,
    limit: 20,
    offset: 0,
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();

    els.expenseDate.value = todayISO();
    els.listMonth.value = currentMonthISO();

    await loadCategories();
    await reloadExpenses();
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

    els.newCategoryName = document.getElementById('newCategoryName');
    els.newCategoryBtn = document.getElementById('newCategoryBtn');

    els.listMonth = document.getElementById('listMonth');
    els.searchInput = document.getElementById('searchInput');
    els.filterCategory = document.getElementById('filterCategory');
    els.filterType = document.getElementById('filterType');
    els.applyFiltersBtn = document.getElementById('applyFiltersBtn');
    els.clearFiltersBtn = document.getElementById('clearFiltersBtn');

    els.expensesBody = document.getElementById('expensesBody');
    els.loadMoreBtn = document.getElementById('loadMoreBtn');
    els.listMeta = document.getElementById('listMeta');

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
    els.expenseForm.addEventListener('submit', async (event) => {
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
    });

    els.newCategoryBtn.addEventListener('click', async () => {
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
        els.expenseCategory.value = String(category.id);
      } catch (error) {
        toast('error', error.message);
      } finally {
        setLoading(false);
      }
    });

    els.applyFiltersBtn.addEventListener('click', async () => {
      await reloadExpenses();
    });

    els.clearFiltersBtn.addEventListener('click', async () => {
      els.searchInput.value = '';
      els.filterCategory.value = '';
      els.filterType.value = '';
      els.listMonth.value = currentMonthISO();
      await reloadExpenses();
    });

    els.searchInput.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        await reloadExpenses();
      }
    });

    els.loadMoreBtn.addEventListener('click', async () => {
      await loadExpenses(false);
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

    els.editForm.addEventListener('submit', async (event) => {
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
    });
  }

  function buildListParams() {
    const month = els.listMonth.value || currentMonthISO();
    const params = new URLSearchParams({
      month,
      limit: String(state.limit),
      offset: String(state.offset),
    });

    const q = els.searchInput.value.trim();
    const category = els.filterCategory.value;
    const type = els.filterType.value;

    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (type) params.set('type', type);

    return params;
  }

  async function reloadExpenses() {
    state.offset = 0;
    state.expenses = [];
    await loadExpenses(true);
  }

  async function loadExpenses(replace = false) {
    try {
      setLoading(true, 'Carregando gastos...');
      const params = buildListParams();
      const data = await apiFetch(`/api/expenses?${params.toString()}`);

      if (replace) {
        state.expenses = data.items || [];
      } else {
        state.expenses = state.expenses.concat(data.items || []);
      }

      state.total = Number(data.total || 0);
      state.offset = state.expenses.length;

      renderExpenses();
      refreshPagingState();
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

  function refreshPagingState() {
    const hasMore = state.offset < state.total;
    els.loadMoreBtn.style.display = hasMore ? 'inline-flex' : 'none';
    els.listMeta.textContent = `Mostrando ${state.expenses.length} de ${state.total} gastos`;
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

    els.expenseCategory.innerHTML = '<option value="">Selecione</option>' + categoryOptions;
    els.editCategory.innerHTML = '<option value="">Selecione</option>' + categoryOptions;
    els.filterCategory.innerHTML = '<option value="">Todas categorias</option>' + categoryOptions;
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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
