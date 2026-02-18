(() => {
  const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const dateFormatter = new Intl.DateTimeFormat('pt-BR');

  function ensureToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function ensureLoadingOverlay() {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="loading-card">Carregando...</div>';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function parseDateLike(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  function formatBRL(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return currencyFormatter.format(0);
    return currencyFormatter.format(numeric);
  }

  function formatDateBR(value) {
    const parsed = parseDateLike(value);
    if (!parsed) return '-';
    return dateFormatter.format(parsed);
  }

  function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '-';
    }
    return `${Number(value).toFixed(1)}%`;
  }

  function toast(type, message, duration = 3200) {
    const container = ensureToastContainer();
    const node = document.createElement('div');
    node.className = `toast ${type === 'error' ? 'error' : 'success'}`;
    node.textContent = message;
    container.appendChild(node);

    window.setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(-6px)';
      window.setTimeout(() => node.remove(), 200);
    }, duration);
  }

  function openModal(id, options = {}) {
    const modal = document.getElementById(id);
    if (!modal) return;
    const locked = Boolean(options.locked);
    modal.dataset.locked = locked ? 'true' : 'false';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id, options = {}) {
    const modal = document.getElementById(id);
    if (!modal) return;
    const forced = Boolean(options.force);
    if (modal.dataset.locked === 'true' && !forced) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function setLoading(isLoading, text = 'Carregando...') {
    const overlay = ensureLoadingOverlay();
    overlay.querySelector('.loading-card').textContent = text;
    overlay.classList.toggle('show', Boolean(isLoading));
  }

  async function apiFetch(url, options = {}) {
    const fetchOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    };

    if (fetchOptions.body && typeof fetchOptions.body !== 'string') {
      fetchOptions.body = JSON.stringify(fetchOptions.body);
    }

    const response = await fetch(url, fetchOptions);
    let payload;

    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.error || `Falha na requisicao (${response.status}).`;
      throw new Error(message);
    }

    return payload;
  }

  function todayISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function currentMonthISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  document.addEventListener('click', (event) => {
    const closeTarget = event.target.closest('[data-close-modal]');
    if (closeTarget) {
      const modalId = closeTarget.getAttribute('data-close-modal');
      closeModal(modalId);
      return;
    }

    const modalBackdrop = event.target.classList.contains('modal') ? event.target : null;
    if (modalBackdrop && modalBackdrop.dataset.locked !== 'true') {
      modalBackdrop.classList.remove('open');
      modalBackdrop.setAttribute('aria-hidden', 'true');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openModals = [...document.querySelectorAll('.modal.open')];
    const lastModal = openModals[openModals.length - 1];
    if (!lastModal) return;
    if (lastModal.dataset.locked === 'true') return;
    lastModal.classList.remove('open');
    lastModal.setAttribute('aria-hidden', 'true');
  });

  window.UI = {
    apiFetch,
    closeModal,
    currentMonthISO,
    formatBRL,
    formatDateBR,
    formatPercent,
    openModal,
    setLoading,
    toast,
    todayISO,
  };
})();
