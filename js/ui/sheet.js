import { esc } from './dom.js';
import { safeTopPx, currentFrame, isField, scrollFieldToThird } from './viewport.js';

// 下から出るシート。body は HTML 文字列（中の値は呼ぶ側で esc 済みにする）。
// onSave(root) が false を返したら閉じない。保存せずに閉じたら onDismiss()。戻り値 { root, close }
//
// キーボード対策：シートの外枠（.sheet-backdrop）を、実際に見えている範囲（visualViewport）に毎回合わせる。
// 欄にフォーカスしたら、その欄をシートの見えている範囲の上から3分の1へ。入力中は中身の下に余白を入れる。
// 日本語の変換中は、シートを動かさない（動かすと文字が二重に入ることがある）
//
// 開いたときの入力欄へのフォーカスは onMount(root, close, focusWhenOpen) の focusWhenOpen(欄) で。
//   iPhone では、シートを置いた直後に focus() すると、キーボードが出る間にシートの位置と高さが変わり、
//   カーソルだけが前の位置（欄の縦の真ん中あたり）に残る。そこで、タップの中ではまず見えない仮の欄に
//   フォーカスしてキーボードを出し、シートが開き終わって（キーボードが出きって）から本当の欄に移す
export function openSheet({ title, body, saveLabel = 'Save', onSave, onMount, onDismiss }) {
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

  let composing = false;
  let pending = false;
  const focused = () => (isField(document.activeElement) && scroller.contains(document.activeElement) ? document.activeElement : null);

  // 枠を見えている範囲に合わせる
  const fit = () => {
    const f = currentFrame(safeTop);
    wrap.style.top = `${f.top}px`;
    wrap.style.height = `${f.height}px`;
    sheet.style.maxHeight = `${f.sheetMaxHeight}px`;
    scroller.style.paddingBottom = focused() ? `${f.bottomPad}px` : '';
  };
  const reveal = () => {
    const el = focused();
    if (el) scrollFieldToThird(scroller, el);
  };
  const update = () => {
    if (composing) { pending = true; return; }
    fit();
    reveal();
  };

  // resize / scroll のたびに、その場で合わせる（キーボードが出る途中でも毎回）
  const vv = window.visualViewport;
  const onViewport = () => update();
  vv?.addEventListener('resize', onViewport);
  vv?.addEventListener('scroll', onViewport);
  fit();

  // フォーカスしたら：キーボードが出きるまで何回か合わせる
  let timers = [];
  wrap.addEventListener('focusin', (e) => {
    if (!isField(e.target)) return;
    timers.forEach(clearTimeout);
    timers = [0, 150, 400, 700].map((ms) => setTimeout(update, ms));
  });
  wrap.addEventListener('focusout', () => {
    setTimeout(() => { if (!focused() && !composing) fit(); }, 120);
  });
  wrap.addEventListener('compositionstart', () => { composing = true; });
  wrap.addEventListener('compositionend', () => {
    composing = false;
    if (pending) { pending = false; update(); }
  });

  let closed = false;
  const close = (saved = false) => {
    if (closed) return;
    closed = true;
    if (!saved) onDismiss?.();
    timers.forEach(clearTimeout);
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
      if (ok !== false) close(true);
    }
  });
  // シートが開き終わってから欄にフォーカスする（上の説明のとおり）
  const focusWhenOpen = (el) => {
    if (!el) return;
    const proxy = document.createElement('input');
    proxy.className = 'focus-proxy';
    proxy.setAttribute('aria-hidden', 'true');
    proxy.tabIndex = -1;
    proxy.setAttribute('autocomplete', 'off');
    proxy.style.top = `${Math.max(0, el.getBoundingClientRect().top - sheet.getBoundingClientRect().top)}px`;
    sheet.appendChild(proxy);
    proxy.focus({ preventScroll: true }); // タップの中なので、iPhone でもキーボードが出る
    let lastH = window.visualViewport?.height ?? 0;
    let stable = 0;
    let waited = 0;
    const tick = () => {
      if (closed || document.activeElement !== proxy) { proxy.remove(); return; }
      const h = window.visualViewport?.height ?? 0;
      stable = h === lastH ? stable + 1 : 0;
      lastH = h;
      waited += 50;
      // 高さが 150ms 変わらなくなったら（最短 200ms・最長 1 秒）
      if ((stable >= 3 && waited >= 200) || waited >= 1000) {
        fit();
        el.focus({ preventScroll: true });
        proxy.remove();
        // カーソルは文の終わり（空なら左上）
        if (el.matches('textarea, input[type="text"], input:not([type])')) {
          const end = el.value.length;
          el.setSelectionRange(end, end);
        }
        return;
      }
      setTimeout(tick, 50);
    };
    setTimeout(tick, 50);
  };
  onMount?.(sheet, close, focusWhenOpen);
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

// アイコンと名前のチップ（種類の選択など）。アイコンは飾りなので読み上げない
export function iconChip(value, iconSvg, name, pressed) {
  return `<button type="button" class="chip chip-icon" data-value="${esc(value)}" aria-pressed="${pressed ? 'true' : 'false'}"><span class="chip-icon-svg" aria-hidden="true">${iconSvg}</span>${esc(name)}</button>`;
}
