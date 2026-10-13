// 持ち物・タグの決まり（画面と分けた純粋な関数）

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
// 「宿にある」の機能は外した。以前のデータ（packingItems[].atStay・trips[].packing.skipped・packingExtras[].atStay）は
// 消さずに残すが、使わない（宿にあることは、旅の持ち物のメモ packingNote に書く）
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

// 持ち物を消す：旅のチェック（と以前の宿にある・使わなかった / 足りなかったの印）からも外す
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

// ---------- 前回の旅から始める（同じ場所の旅） ----------
// この旅と場所が1つでも同じで、タグか「この旅だけの物」がある、いちばん新しい前の旅。
// 比べるのは日程のある旅だけ：この旅に日程があれば、それより前に始まった旅。日程未定なら、もう終わった旅（today より前）
export function lastPackingTrip(trip, trips, today) {
  const places = new Set(trip?.placeIds || []);
  const dated = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t?.startDate || '');
  const before = (t) => (dated(trip) ? t.startDate < trip.startDate : (t.endDate || t.startDate) < (today || ''));
  return (trips || [])
    .filter((t) => t.id !== trip?.id && t.status !== 'cancelled' && dated(t) && before(t)
      && (t.placeIds || []).some((id) => places.has(id))
      && ((t.packing?.tagIds || []).length || (t.packingExtras || []).length))
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))[0] || null;
}

// 前回の旅のオンのタグと「この旅だけの物」を写す（チェックは付けない。同じ名前の物は足さない）。戻り値 { tags, extras }
export function copyPackingFrom(trip, source, makeId) {
  trip.packing ||= { tagIds: [], checked: {} };
  trip.packing.tagIds ||= [];
  trip.packingExtras ||= [];
  const before = trip.packing.tagIds.length;
  for (const id of source?.packing?.tagIds || []) if (!trip.packing.tagIds.includes(id)) trip.packing.tagIds.push(id);
  const norm = (s) => String(s || '').normalize('NFKC').trim().toLowerCase();
  const have = new Set(trip.packingExtras.map((x) => norm(x.name)));
  let extras = 0;
  for (const x of source?.packingExtras || []) {
    if (!norm(x.name) || have.has(norm(x.name))) continue;
    have.add(norm(x.name));
    trip.packingExtras.push({ id: makeId(), name: x.name, checked: false });
    extras++;
  }
  return { tags: trip.packing.tagIds.length - before, extras };
}

// 「この旅だけの物」を持ち物マスターへ：マスターに足し（タグは選んだもの）、この旅だけの物からは外す。チェックは引き継ぐ。
// マスターに同じ名前の物があれば、新しく作らずにその物にタグを足す。戻り値 { item, merged }（なければ null）
export function moveExtraToMaster(data, tripId, extraId, { tagIds = [], makeId, order }) {
  const trip = (data.trips || []).find((t) => t.id === tripId);
  const x = trip?.packingExtras?.find((e) => e.id === extraId);
  if (!x) return null;
  const norm = (s) => String(s || '').normalize('NFKC').trim().toLowerCase();
  let item = (data.packingItems || []).find((p) => norm(p.name) === norm(x.name));
  const merged = !!item;
  if (item) {
    item.tagIds = [...new Set([...(item.tagIds || []), ...tagIds])];
  } else {
    item = { id: makeId(), name: x.name, tagIds: [...tagIds], note: '', mustHave: false, order };
    (data.packingItems ||= []).push(item);
  }
  trip.packingExtras = trip.packingExtras.filter((e) => e.id !== extraId);
  if (x.checked) {
    trip.packing ||= { tagIds: [], checked: {} };
    (trip.packing.checked ||= {})[item.id] = true;
  }
  return { item, merged };
}

