// 持ち物・タグの決まり（画面と分けた純粋な関数）
import { isDated } from './trips.js';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ja');

export function sortItems(items) {
  return [...(items || [])].sort(byOrder);
}

export function sortTags(tags) {
  return [...(tags || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// その旅で持っていく物：MUST!（mustHave）の物＋オンのタグのどれかが付いた物（重複は1回）
export function tripPackingList(trip, packingItems) {
  const on = new Set(trip?.packing?.tagIds || []);
  return sortItems(packingItems).filter((p) => p.mustHave === true || (p.tagIds || []).some((t) => on.has(t)));
}

// 旅の持ち物の画面の区分：
//   must    … MUST! の物（タグに関係なく、いちばん上）
//   byTag   … オンのタグごと [{ tag, items }]（タグの並び順。MUST! の物もタグが付いていればここにも出す）
//   extras  … この旅だけの物
// 「宿にある」は持ち物マスターの印（packingItems[].atStay）。ほかの物と同じ欄に出し、チェックも準備数も同じ。
// 以前の旅ごとの「宿にある」（trips[].packing.skipped・packingExtras[].atStay）は読み飛ばす（データは消さない）
export function tripPackingSections(trip, packingItems, tags) {
  const on = new Set(trip?.packing?.tagIds || []);
  const list = tripPackingList(trip, packingItems);
  return {
    must: list.filter((p) => p.mustHave === true),
    byTag: sortTags(tags).filter((t) => on.has(t.id)).map((tag) => ({
      tag,
      items: list.filter((p) => (p.tagIds || []).includes(tag.id)),
    })),
    extras: trip?.packingExtras || [],
  };
}

// 準備数：同じ物は1回だけ数える。この旅だけの物も数える
export function packingProgress(trip, packingItems) {
  const checked = trip?.packing?.checked || {};
  const list = tripPackingList(trip, packingItems);
  const extras = trip?.packingExtras || [];
  const done = list.filter((p) => checked[p.id]).length + extras.filter((x) => x.checked).length;
  return { done, total: list.length + extras.length };
}

// 旅が終わったか（最終日を過ぎた、または Done）。終わったら「使わなかった / 足りなかった」を付けられる
export function tripEnded(trip, today) {
  return trip?.status === 'done' || (isDated(trip) && trip.endDate < today);
}

// 持ち物マスターの絞り込み：tagId が null なら すべて
export function filterByTag(items, tagId) {
  const list = sortItems(items);
  return tagId ? list.filter((p) => (p.tagIds || []).includes(tagId)) : list;
}

export function nextOrder(list) {
  return (list || []).reduce((m, x) => Math.max(m, Number.isFinite(x?.order) ? x.order : -1), -1) + 1;
}

// タグを使っている持ち物の数
export function tagUsage(tagId, items) {
  return (items || []).filter((p) => (p.tagIds || []).includes(tagId)).length;
}

// 選んだ持ち物にタグを付ける・外す。変わった件数を返す
export function addTagToItems(items, ids, tagId) {
  const pick = new Set(ids);
  let n = 0;
  for (const p of items || []) {
    if (!pick.has(p.id)) continue;
    p.tagIds ||= [];
    if (!p.tagIds.includes(tagId)) { p.tagIds.push(tagId); n += 1; }
  }
  return n;
}
export function removeTagFromItems(items, ids, tagId) {
  const pick = new Set(ids);
  let n = 0;
  for (const p of items || []) {
    if (!pick.has(p.id) || !(p.tagIds || []).includes(tagId)) continue;
    p.tagIds = p.tagIds.filter((t) => t !== tagId);
    n += 1;
  }
  return n;
}

// 絞り込み中の一部だけを並べ替えたとき：その一部が使っていた order の値を、新しい順に振り直す
// （絞り込みの外の物の順番は変えない）
export function reorderSubset(items, ids) {
  const sub = ids.map((id) => (items || []).find((p) => p.id === id)).filter(Boolean);
  const orders = sub.map((p) => p.order ?? 0).sort((a, b) => a - b);
  // order が重なっていたら、ずらして重ならないようにする
  for (let i = 1; i < orders.length; i++) if (orders[i] <= orders[i - 1]) orders[i] = orders[i - 1] + 1;
  sub.forEach((p, i) => { p.order = orders[i]; });
}

// タグを消す：タグの一覧から消し、持ち物と旅のオンのタグからも外す（持ち物は消さない）
export function removeTag(data, tagId) {
  data.tags = (data.tags || []).filter((t) => t.id !== tagId);
  for (const p of data.packingItems || []) p.tagIds = (p.tagIds || []).filter((t) => t !== tagId);
  for (const t of data.trips || []) {
    if (t.packing) t.packing.tagIds = (t.packing.tagIds || []).filter((x) => x !== tagId);
  }
  // 並び順を 0,1,2… に詰める
  sortTags(data.tags).forEach((t, i) => { t.order = i; });
}

// 並べ替えたあと：ids の順に order を振り直す
export function reorderByIds(list, ids) {
  const pos = new Map(ids.map((id, i) => [id, i]));
  for (const x of list || []) if (pos.has(x.id)) x.order = pos.get(x.id);
}

// 持ち物を消す：旅のチェック・宿にある・ふりかえりの印からも外す
export function removePackingItem(data, itemId) {
  data.packingItems = (data.packingItems || []).filter((p) => p.id !== itemId);
  for (const t of data.trips || []) {
    const pk = t.packing;
    if (!pk) continue;
    for (const k of ['checked', 'skipped', 'feedback']) if (pk[k]) delete pk[k][itemId];
  }
}

// 同じ名前のタグ（前後の空白・全角半角・大文字小文字を無視）
export function findTagByName(tags, name) {
  const key = (s) => String(s || '').normalize('NFKC').trim().toLowerCase();
  return (tags || []).find((t) => key(t.name) === key(name)) || null;
}
