import { esc } from './dom.js';
import { sheetBox, revealScrollTop } from '../logic/viewport.js';

// ステータスバーの高さ（safe-area-inset-top）を px で読む
function safeTopPx() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const v = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return v;
}

const isField = (el) => el && el.matches?.('input, textarea, select');

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
  const scroller = wrap.querySelector('.sheet-body');
  const before = document.activeElement;
  document.body.classList.add('no-scroll');
  document.body.appendChild(wrap);
  const safeTop = safeTopPx();

  // 日本語の変換中は、シートを動かさない（動かすと文字が二重に入ることがある）
  let composing = false;
  let pending = false;

  // キーボードが出たら：シートの下端をキーボードの上に、上端はステータスバーの下に
  const vv = window.visualViewport;
  const fit = () => {
    if (composing) { pending = true; return; }
    const box = sheetBox({
      innerHeight: window.innerHeight,
      vvHeight: vv ? vv.height : window.innerHeight,
      vvOffsetTop: vv ? vv.offsetTop : 0,
      safeTop,
    });
    sheet.style.bottom = `${box.bottom}px`;
    sheet.style.maxHeight = `${box.maxHeight}px`;
  };

  // 入力中の欄が、シートの中で見えるようにする
  const reveal = () => {
    if (composing) { pending = true; return; }
    const el = document.activeElement;
    if (!isField(el) || !scroller.contains(el)) return;
    const r = (el.closest('.field, .check') || el).getBoundingClientRect();
    const b = scroller.getBoundingClientRect();
    const next = revealScrollTop({ elTop: r.top, elBottom: r.bottom, boxTop: b.top, boxBottom: b.bottom, scrollTop: scroller.scrollTop });
    if (next !== scroller.scrollTop) scroller.scrollTop = next;
  };

  const onViewport = () => { fit(); reveal(); };
  vv?.addEventListener('resize', onViewport);
  vv?.addEventListener('scroll', onViewport);
  fit();

  // キーボードが出るのを待ってから見える位置へ（出る途中の高さで計算しないように、2回）
  let revealTimers = [];
  wrap.addEventListener('focusin', (e) => {
    if (!isField(e.target)) return;
    revealTimers.forEach(clearTimeout);
    revealTimers = [setTimeout(onViewport, 60), setTimeout(onViewport, 350)];
  });
  wrap.addEventListener('compositionstart', () => { composing = true; });
  wrap.addEventListener('compositionend', () => {
    composing = false;
    if (pending) { pending = false; onViewport(); }
  });

  const close = () => {
    revealTimers.forEach(clearTimeout);
    vv?.removeEventListener('resize', onViewport);
    vv?.removeEventListener('scroll', onViewport);
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('no-scroll');
    wrap.remove();
    if (before && before.focus) before.focus({ preventScroll: true });
  };
  const onKey = (e) => { if (e.key === 'Escape' && !e.isComposing) close(); };
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
