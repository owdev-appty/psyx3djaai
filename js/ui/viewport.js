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

// ページ（シートの外）の欄（Day notes・This trip only・持ち物のメモなど）：
// ・フォーカスしたら、下のタブを隠し、ページの下に余白を入れる（下のほうの欄でも上げられるように）。切り替えは1回だけ
// ・キーボードが出きったころに1回だけ、ブラウザの scrollIntoView で欄を上のほうへ（位置の計算は自分でしない。
//   iPhone では座標の基準が変わることがあり、自分で計算するとずれて欄が見えなくなるため）
// ・resize には反応しない（画面が揺れないように）
export function watchPageFields() {
  let timer = 0;
  let leaveTimer = 0;
  const pageField = (el) => isField(el) && !el.closest('.sheet-backdrop') && el.matches('input:not([type="date"]):not([type="time"]), textarea');
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!pageField(el)) return;
    clearTimeout(leaveTimer);
    document.body.classList.add('typing');
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.activeElement === el) el.scrollIntoView({ block: 'start' });
    }, 350);
  });
  document.addEventListener('focusout', () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (!pageField(document.activeElement)) document.body.classList.remove('typing');
    }, 200);
  });
}
