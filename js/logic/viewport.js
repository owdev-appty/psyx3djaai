// 下から出るシートの位置の計算（画面と分けた純粋な関数）。
// キーボードの高さは想定しない。iPhone で実際に見えている範囲（visualViewport の height と offsetTop）だけを使う。
// 入力補助バー（︿ ﹀ ✓）も、見えている範囲の外として自然に除かれる。

// シートを置く枠：見えている範囲そのもの。シートの上端はステータスバー（safeTop）＋すき間より下
export function visibleFrame({ vvHeight, vvOffsetTop = 0, safeTop = 0, gap = 8, minHeight = 160 }) {
  return {
    top: Math.round(vvOffsetTop),
    height: Math.round(vvHeight),
    sheetMaxHeight: Math.max(minHeight, Math.floor(vvHeight - safeTop - gap)),
    // 入力中、最後の欄でも上のほうまで上げられるように、中身の下に入れる余白（見えている範囲の半分）
    bottomPad: Math.round(vvHeight / 2),
  };
}

// 入力中の欄を、スクロールする箱（シートの中身）の上から ratio（3分の1）の位置に来るようにする scrollTop。
// 0 〜 scrollMax の範囲におさめる
export function focusScrollTop({ elTop, boxTop, boxHeight, scrollTop, scrollMax, ratio = 1 / 3 }) {
  const target = boxTop + boxHeight * ratio;
  const next = Math.round(scrollTop + (elTop - target));
  return Math.min(Math.max(0, next), Math.max(0, scrollMax));
}
