// iPhone のキーボード対策（画面側）。キーボードの高さは想定せず、
// 実際に見えている範囲（visualViewport の height と offsetTop）を、resize と scroll のたびに読む
import { visibleFrame, focusScrollTop } from '../logic/viewport.js';

// ステータスバーの高さ（safe-area-inset-top）を px で読む
export function safeTopPx() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const v = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return v;
}

export function currentFrame(safeTop) {
  const vv = window.visualViewport;
  return visibleFrame({
    vvHeight: vv ? vv.height : window.innerHeight,
    vvOffsetTop: vv ? vv.offsetTop : 0,
    safeTop,
  });
}

export const isField = (el) => !!el && el.matches?.('input:not([type="checkbox"]):not([type="radio"]), textarea, select');

// スクロールする箱 scroller の中で、el（欄。ラベルごと見せる）を上から3分の1の位置へ
export function scrollFieldToThird(scroller, el) {
  const target = el.closest('.field, .check, .day-notes') || el;
  const r = target.getBoundingClientRect();
  const b = scroller.getBoundingClientRect();
  const next = focusScrollTop({
    elTop: r.top, boxTop: b.top, boxHeight: b.height,
    scrollTop: scroller.scrollTop, scrollMax: scroller.scrollHeight - scroller.clientHeight,
  });
  if (next !== scroller.scrollTop) scroller.scrollTop = next;
}

// ページ（シートの外）の欄：見えている範囲の上から3分の1へ。入力中は下のタブを隠し、下に余白を入れる
export function watchPageFields() {
  const vv = window.visualViewport;
  let timers = [];
  let composing = false;
  const active = () => {
    const el = document.activeElement;
    return isField(el) && !el.closest('.sheet-backdrop') ? el : null;
  };
  const reveal = () => {
    const el = active();
    if (!el || composing) return;
    const frame = currentFrame(safeTopPx());
    const target = (el.closest('.day-notes, .field') || el).getBoundingClientRect();
    // getBoundingClientRect はレイアウトの座標。見えている範囲は frame.top 〜 frame.top + frame.height
    const goal = frame.top + frame.height / 3;
    const dy = Math.round(target.top - goal);
    if (Math.abs(dy) > 4) window.scrollBy(0, dy);
  };
  const schedule = () => {
    timers.forEach(clearTimeout);
    timers = [0, 150, 400, 700].map((ms) => setTimeout(reveal, ms));
  };
  document.addEventListener('focusin', (e) => {
    if (!isField(e.target) || e.target.closest('.sheet-backdrop')) return;
    document.body.classList.add('typing');
    document.body.style.setProperty('--typing-pad', `${currentFrame(0).bottomPad}px`);
    schedule();
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (!active()) document.body.classList.remove('typing'); }, 120);
  });
  document.addEventListener('compositionstart', () => { composing = true; });
  document.addEventListener('compositionend', () => { composing = false; });
  vv?.addEventListener('resize', () => { if (active()) schedule(); });
}
