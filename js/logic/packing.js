// 旅の持ち物（画面と分けた純粋な関数）。マイルストーン6で画面と細かいルールを足す

// その旅で持っていく物：忘れると困る物＋オンのタグのどれかが付いた物（重複は1回）
export function tripPackingList(trip, packingItems) {
  const on = new Set(trip?.packing?.tagIds || []);
  return (packingItems || []).filter((p) => p.mustHave === true || (p.tagIds || []).some((t) => on.has(t)));
}

// 準備数：宿にある物は数えない。この旅だけの物も数える
export function packingProgress(trip, packingItems) {
  const skipped = trip?.packing?.skipped || {};
  const checked = trip?.packing?.checked || {};
  const list = tripPackingList(trip, packingItems).filter((p) => !skipped[p.id]);
  const extras = trip?.packingExtras || [];
  const done = list.filter((p) => checked[p.id]).length + extras.filter((x) => x.checked).length;
  return { done, total: list.length + extras.length };
}
