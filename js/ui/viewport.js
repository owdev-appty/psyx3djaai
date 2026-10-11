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

// ページ（シートの外）の欄（Day notes・This trip only など）：
// フォーカスしてキーボードが出きったころに1回だけ確かめ、欄が見えていなければ上から3分の1へスクロールする。
// 何度も計算し直すと画面が揺れるので、resize には反応しない・余白も足さない
export function watchPageFields() {
  let timer = 0;
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!isField(el) || el.closest('.sheet-backdrop')) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.activeElement !== el) return;
      const vv = window.visualViewport;
      const top = (vv ? vv.offsetTop : 0) + safeTopPx();
      const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight);
      const r = el.getBoundingClientRect();
      if (r.top >= top + 8 && r.bottom <= bottom - 8) return; // 見えていれば何もしない
      window.scrollBy(0, Math.round(r.top - (top + (bottom - top) / 3)));
    }, 450);
  });
}
