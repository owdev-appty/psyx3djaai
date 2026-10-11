import { esc } from './dom.js';

// 確認のモーダル。OK なら true、Cancel・外側・Escape なら false
// body は文字列（エスケープされる）か、行の配列
export function confirmModal({ title, body = '', okLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const lines = Array.isArray(body) ? body : [body];
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title" class="modal-title">${esc(title)}</h2>
        ${lines.filter(Boolean).map((l) => `<p class="modal-body">${esc(l)}</p>`).join('')}
        <div class="modal-actions">
          ${cancelLabel ? `<button type="button" class="btn btn-secondary" data-act="cancel">${esc(cancelLabel)}</button>` : ''}
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(okLabel)}</button>
        </div>
      </div>`;
    const before = document.activeElement;
    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      if (before && before.focus) before.focus();
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return close(false);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) close(act === 'ok');
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector(cancelLabel ? '[data-act="cancel"]' : '[data-act="ok"]').focus();
  });
}

// 削除の確認（文言は決まっているもの）
export function confirmDelete(name) {
  return confirmModal({ title: `Delete "${name}"?`, body: "This can't be undone.", okLabel: 'Delete', danger: true });
}
