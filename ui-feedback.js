/**
 * In-page replacements for window.alert()/confirm()/prompt(). Loaded on
 * every page as `window.UI`:
 *
 *   UI.toast(message, type)            — non-blocking notification
 *   UI.confirm(message, opts) -> bool  — async, replaces confirm()
 *   UI.prompt(message, default, opts) -> string|null — async, replaces prompt()
 *
 * Self-contained: builds its own DOM/classes (ui-feedback.css), doesn't
 * depend on styles.css being loaded, so it works identically on the game
 * pages (which don't load styles.css) and the lobby/servers pages (which do).
 */
(function () {
  const TOAST_STACK_ID = 'ui-toast-stack';

  function ensureToastStack() {
    let stack = document.getElementById(TOAST_STACK_ID);
    if (!stack) {
      stack = document.createElement('div');
      stack.id = TOAST_STACK_ID;
      stack.className = 'ui-toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(message, type, duration) {
    type = type || 'info';
    duration = duration || (type === 'error' ? 6000 : 4000);
    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = 'ui-toast ui-toast-' + type;
    el.textContent = message;
    stack.appendChild(el);

    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      el.classList.remove('ui-toast-visible');
      setTimeout(() => el.remove(), 200);
    };
    requestAnimationFrame(() => el.classList.add('ui-toast-visible'));
    const timer = setTimeout(remove, duration);
    el.addEventListener('click', () => {
      clearTimeout(timer);
      remove();
    });
    return el;
  }

  function openModal(bodyNode, buttons) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'ui-modal-overlay';

      const modal = document.createElement('div');
      modal.className = 'ui-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.appendChild(bodyNode);

      const actions = document.createElement('div');
      actions.className = 'ui-modal-actions';

      let settled = false;
      function close(rawValue) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
        resolve(typeof rawValue === 'function' ? rawValue() : rawValue);
      }

      let primaryBtn = null;
      buttons.forEach((b) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'game-btn ui-modal-btn' + (b.variant ? ' ui-modal-btn-' + b.variant : '');
        btn.textContent = b.label;
        btn.addEventListener('click', () => close(b.value));
        if (b.isPrimary) primaryBtn = btn;
        actions.appendChild(btn);
      });

      function onKeydown(e) {
        if (e.key === 'Escape') {
          const cancelBtn = buttons.find((b) => b.isCancel);
          close(cancelBtn ? cancelBtn.value : null);
        }
      }

      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKeydown);

      const focusTarget = modal.querySelector('input') || primaryBtn;
      if (focusTarget) focusTarget.focus();
    });
  }

  function confirm(message, opts) {
    opts = opts || {};
    const body = document.createElement('p');
    body.className = 'ui-modal-message';
    body.textContent = message;
    return openModal(body, [
      { label: opts.cancelLabel || 'Отмена', value: false, variant: 'secondary', isCancel: true },
      { label: opts.okLabel || 'Да', value: true, variant: 'primary', isPrimary: true },
    ]).then(Boolean);
  }

  function prompt(message, defaultValue, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    const label = document.createElement('p');
    label.className = 'ui-modal-message';
    label.textContent = message;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ui-modal-input';
    input.value = defaultValue || '';
    wrap.appendChild(label);
    wrap.appendChild(input);

    const promise = openModal(wrap, [
      { label: opts.cancelLabel || 'Отмена', value: null, variant: 'secondary', isCancel: true },
      { label: opts.okLabel || 'ОК', value: () => input.value, variant: 'primary', isPrimary: true },
    ]);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.closest('.ui-modal-overlay').querySelector('.ui-modal-btn-primary').click();
      }
    });

    return promise;
  }

  window.UI = { toast, confirm, prompt };
})();
