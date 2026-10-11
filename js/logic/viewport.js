// 下から出るシートの位置の計算（画面と分けた純粋な関数）。
// iPhone では、キーボードが出ると「見えている範囲」（visualViewport）が小さくなる。

// シートの下端を、見えている範囲の下端（キーボードのすぐ上）に合わせる。
// シートの上端は、見えている範囲の上端＋ステータスバー（safe-area-inset-top）＋すき間より下にする。
//   innerHeight：レイアウトの高さ / vvHeight・vvOffsetTop：見えている範囲 / safeTop：ステータスバーの高さ
export function sheetBox({ innerHeight, vvHeight, vvOffsetTop = 0, safeTop = 0, gap = 8, minHeight = 160 }) {
  const bottom = Math.max(0, Math.round(innerHeight - vvHeight - vvOffsetTop));
  const maxHeight = Math.max(minHeight, Math.floor(vvHeight - safeTop - gap));
  return { bottom, maxHeight };
}

// スクロールする箱（シートの中身）の中で、入力中の欄が見えるようにするための scrollTop。
// 欄の下が見えていなければ下へ、上が見えていなければ上へ。どちらも見えていれば変えない。
// 欄が箱より高い（長いメモなど）ときは、欄の上端を見せる
export function revealScrollTop({ elTop, elBottom, boxTop, boxBottom, scrollTop, margin = 16 }) {
  const room = boxBottom - boxTop - margin * 2;
  if (elBottom - elTop > room || elTop - margin < boxTop) {
    return Math.max(0, Math.round(scrollTop - (boxTop - (elTop - margin))));
  }
  if (elBottom + margin > boxBottom) return Math.round(scrollTop + (elBottom + margin - boxBottom));
  return scrollTop;
}
