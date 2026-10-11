import { esc } from './dom.js';

// 下から出るシート。body は HTML 文字列（中の値は呼ぶ側で esc 済みにする）。
// onSave(root) が false を返したら閉じない。戻り値 { root, close }
export function openSheet({ title, body, saveLabel = 'Save', onSave, onMount }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header class="sheet-head">
        <button type="button" class="sheet-btn" data-act="cancel">Cancel</button>
        <h2 id="sheet-title" class="sheet-title">${esc(title)}</h2>
        ${onSave ? `<button type="button" class="sheet-btn sheet-btn-save" data-act="save">${esc(saveLabel)}</button>` : '<span class="sheet-btn"></span>'}
      </header>
      <div class="sheet-body">${body}</div>
    </section>`;
  const sheet = wrap.querySelector('.sheet');
  const before = document.activeElement;
  document.body.classList.add('no-scroll');

  // iPhone のキーボードが出たときに、シートが隠れないようにする
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    sheet.style.bottom = `${hidden}px`;
    sheet.style.maxHeight = `${vv.height - 12}px`;
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  fit();

  const close = () => {
    vv?.removeEventListener('resize', fit);
    vv?.removeEventListener('scroll', fit);
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('no-scroll');
    wrap.remove();
    if (before && before.focus) before.focus({ preventScroll: true });
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', async (e) => {
    if (e.target === wrap) return close();
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cancel') close();
    if (act === 'save') {
      const ok = await onSave(sheet);
      if (ok !== false) close();
    }
  });
  document.body.appendChild(wrap);
  onMount?.(sheet, close);
  return { root: sheet, close };
}

// チップの選択（1つだけ）。data-group の中の .chip[data-value] をタップで切り替える。
// allowNone なら、選んでいるチップをもう一度押すと外れる
export function bindChoice(root, group, { allowNone = false, onChange } = {}) {
  const box = root.querySelector(`[data-group="${group}"]`);
  if (!box) return { get: () => null };
  box.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-value]');
    if (!chip) return;
    const was = chip.getAttribute('aria-pressed') === 'true';
    box.querySelectorAll('.chip[data-value]').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    if (!(allowNone && was)) chip.setAttribute('aria-pressed', 'true');
    onChange?.(get());
  });
  const get = () => box.querySelector('.chip[aria-pressed="true"]')?.dataset.value ?? null;
  return { get };
}

// 複数選べるチップ
export function bindMulti(root, group) {
  const box = root.querySelector(`[data-group="${group}"]`);
  box?.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-value]');
    if (!chip) return;
    chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });
  return { get: () => [...(box?.querySelectorAll('.chip[aria-pressed="true"]') || [])].map((c) => c.dataset.value) };
}

export function chip(value, label, pressed) {
  return `<button type="button" class="chip" data-value="${esc(value)}" aria-pressed="${pressed ? 'true' : 'false'}">${label}</button>`;
}
