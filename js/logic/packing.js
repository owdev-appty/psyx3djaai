// 持ち物・タグの決まり（画面と分けた純粋な関数）
import { isDated } from './trips.js';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ja');

export function sortItems(items) {
  return [...(items || [])].sort(byOrder);
}

export function sortTags(tags) {
  return [...(tags || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// その旅で持っていく物：忘れると困る物＋オンのタグのどれかが付いた物（重複は1回）
export function tripPackingList(trip, packingItems) {
  const on = new Set(trip?.packing?.tagIds || []);
  return sortItems(packingItems).filter((p) => p.mustHave === true || (p.tagIds || []).some((t) => on.has(t)));
}

// 旅の持ち物の画面の区分：
//   mustHave（忘れると困る。タグに関係なく）／ tagged（オンのタグの物）／ atStay（宿にあるので持っていかない）
//   extras（この旅だけの物）
export function tripPackingSections(trip, packingItems) {
  const skipped = trip?.packing?.skipped || {};
  const list = tripPackingList(trip, packingItems);
  return {
    mustHave: list.filter((p) => p.mustHave === true && !skipped[p.id]),
    tagged: list.filter((p) => p.mustHave !== true && !skipped[p.id]),
    atStay: list.filter((p) => skipped[p.id]),
    extras: trip?.packingExtras || [],
  };
}

// 準備数：宿にある物は数えない。この旅だけの物も数える
export function packingProgress(trip, packingItems) {
  const checked = trip?.packing?.checked || {};
  const { mustHave, tagged, extras } = tripPackingSections(trip, packingItems);
  const list = [...mustHave, ...tagged];
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
