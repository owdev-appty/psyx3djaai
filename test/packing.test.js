import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tripPackingSections, packingProgress, tripEnded, filterByTag, nextOrder, tagUsage, removeTag,
  reorderByIds, removePackingItem, findTagByName, sortTags,
} from '../js/logic/packing.js';
import { normalize } from '../js/store.js';

const items = [
  { id: 'm', name: '忘れ物A', mustHave: true, tagIds: [], order: 3 },
  { id: 'a', name: 'A', tagIds: ['sea', 'city'], order: 1 },
  { id: 'b', name: 'B', tagIds: ['mountain'], order: 0 },
  { id: 'c', name: 'C', tagIds: ['sea'], order: 2 },
];

const tags = [{ id: 'city', name: '街', order: 1 }, { id: 'sea', name: '海', order: 0 }, { id: 'mountain', name: '山', order: 2 }];

test('区分：MUST! は一番上、オンのタグごとに見出し（MUST! の物もタグの欄に出す）、この旅だけ', () => {
  const its = [...items, { id: 'ms', name: '忘れ物S', mustHave: true, tagIds: ['sea'], order: 4 }];
  const trip = { packing: { tagIds: ['sea', 'city'], checked: {} }, packingExtras: [{ id: 'x', name: 'X' }] };
  const s = tripPackingSections(trip, its, tags);
  assert.deepEqual(s.must.map((p) => p.id), ['m', 'ms']);
  assert.deepEqual(s.byTag.map((g) => [g.tag.name, g.items.map((p) => p.id)]), [['海', ['a', 'c', 'ms']], ['街', ['a']]]);
  assert.deepEqual(s.extras.map((x) => x.id), ['x']);
  assert.equal('atStay' in s, false);
});

test('以前の「宿にある」のデータ（マスターの印・旅ごとの印）が残っていても、読み飛ばして普通に出す', () => {
  const trip = { packing: { tagIds: ['sea'], checked: {}, skipped: { a: 'atStay' } }, packingExtras: [{ id: 'z', name: 'Z', atStay: true }] };
  const old = items.map((p) => (p.id === 'c' ? { ...p, atStay: true } : p));
  assert.deepEqual(tripPackingSections(trip, old, tags).byTag[0].items.map((p) => p.id), ['a', 'c']);
  const s = tripPackingSections(trip, items, tags);
  assert.deepEqual(s.byTag[0].items.map((p) => p.id), ['a', 'c']);
  assert.deepEqual(s.extras.map((x) => x.id), ['z']);
  assert.deepEqual(packingProgress(trip, items), { done: 0, total: 4 });
});

test('区分：★のないタグの物も正しく出る。オンのタグがなければ MUST! だけ', () => {
  const s = tripPackingSections({ packing: { tagIds: ['mountain'] } }, items, tags);
  assert.deepEqual(s.byTag.map((g) => [g.tag.id, g.items.map((p) => p.id)]), [['mountain', ['b']]]);
  assert.deepEqual(tripPackingSections({ packing: { tagIds: [] } }, items, tags).byTag, []);
  assert.deepEqual(tripPackingSections({}, items, tags).must.map((p) => p.id), ['m']);
});

test('準備数：同じ物を2回数えない。この旅だけの物も数える', () => {
  const its = [...items, { id: 'ms', name: 'S', mustHave: true, tagIds: ['sea'], order: 4 }];
  const trip = { packing: { tagIds: ['sea', 'city'], checked: { a: true, ms: true } }, packingExtras: [{ name: 'x', checked: true }, { name: 'y' }] };
  // m, a, c, ms ＋ extras x, y = 6。済：a, ms, x = 3
  assert.deepEqual(packingProgress(trip, its), { done: 3, total: 6 });
  assert.deepEqual(packingProgress({}, []), { done: 0, total: 0 });
});

test('normalize：旅の持ち物のメモ（packingNote）。以前の宿にあるの印はそのまま残すだけ', () => {
  const d = normalize({ packingItems: [{ id: 'a', name: 'A', atStay: true }], trips: [{ id: 't', packingNote: 'タオル、ドライヤーは宿にある' }, { id: 'u', packingNote: 3 }] });
  assert.deepEqual(d.trips.map((t) => t.packingNote), ['タオル、ドライヤーは宿にある', '']);
  assert.equal(d.packingItems[0].atStay, true); // 消さない（使わない）
});

test('まとめてタグを付ける・外す（変わった件数）', async () => {
  const { addTagToItems, removeTagFromItems } = await import('../js/logic/packing.js');
  const its = [{ id: 'a', tagIds: ['sea'] }, { id: 'b', tagIds: [] }, { id: 'c' }];
  assert.equal(addTagToItems(its, ['a', 'b', 'c'], 'sea'), 2);
  assert.deepEqual(its.map((p) => p.tagIds), [['sea'], ['sea'], ['sea']]);
  assert.equal(removeTagFromItems(its, ['a', 'c'], 'sea'), 2);
  assert.deepEqual(its.map((p) => p.tagIds), [[], ['sea'], []]);
});

test('reorderSubset：絞り込み中の一部だけ並べ替え、ほかの物の順番は変えない', async () => {
  const { reorderSubset, sortItems } = await import('../js/logic/packing.js');
  const its = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }, { id: 'd', order: 3 }];
  reorderSubset(its, ['d', 'b']); // b と d（order 1 と 3）を入れ替える
  assert.deepEqual(sortItems(its).map((p) => p.id), ['a', 'd', 'c', 'b']);
});

test('tripEnded：最終日を過ぎた、または Done', () => {
  assert.equal(tripEnded({ status: 'booked', startDate: '2026-10-01', endDate: '2026-10-10' }, '2026-10-11'), true);
  assert.equal(tripEnded({ status: 'booked', startDate: '2026-10-01', endDate: '2026-10-11' }, '2026-10-11'), false);
  assert.equal(tripEnded({ status: 'done' }, '2026-10-11'), true);
  assert.equal(tripEnded({ status: 'idea' }, '2026-10-11'), false);
});

test('filterByTag / nextOrder / tagUsage / findTagByName / sortTags', () => {
  assert.deepEqual(filterByTag(items, null).map((p) => p.id), ['b', 'a', 'c', 'm']);
  assert.deepEqual(filterByTag(items, 'sea').map((p) => p.id), ['a', 'c']);
  assert.equal(nextOrder(items), 4);
  assert.equal(nextOrder([]), 0);
  assert.equal(tagUsage('sea', items), 2);
  assert.equal(findTagByName([{ id: 't', name: 'Ｓｅａ ' }], 'sea').id, 't');
  assert.equal(findTagByName([], 'x'), null);
  assert.deepEqual(sortTags([{ id: 'b', order: 1 }, { id: 'a', order: 0 }]).map((t) => t.id), ['a', 'b']);
});

test('removeTag：タグを消しても持ち物は消えない。持ち物と旅のオンのタグから外れ、順番を詰める', () => {
  const data = {
    tags: [{ id: 'sea', order: 0 }, { id: 'city', order: 1 }, { id: 'mt', order: 2 }],
    packingItems: [{ id: 'a', tagIds: ['sea', 'city'] }, { id: 'b', tagIds: ['sea'] }],
    trips: [{ packing: { tagIds: ['sea', 'mt'] } }, {}],
  };
  removeTag(data, 'sea');
  assert.deepEqual(data.tags.map((t) => [t.id, t.order]), [['city', 0], ['mt', 1]]);
  assert.equal(data.packingItems.length, 2);
  assert.deepEqual(data.packingItems.map((p) => p.tagIds), [['city'], []]);
  assert.deepEqual(data.trips[0].packing.tagIds, ['mt']);
});

test('reorderByIds / removePackingItem', () => {
  const tags = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }];
  reorderByIds(tags, ['c', 'a', 'b']);
  assert.deepEqual(sortTags(tags).map((t) => t.id), ['c', 'a', 'b']);
  const data = { packingItems: [{ id: 'a' }, { id: 'b' }], trips: [{ packing: { checked: { a: true, b: true }, skipped: { a: 'atStay' }, feedback: { a: 'unused' } } }] };
  removePackingItem(data, 'a');
  assert.deepEqual(data.packingItems.map((p) => p.id), ['b']);
  assert.deepEqual(data.trips[0].packing, { checked: { b: true }, skipped: {}, feedback: {} });
});

test('normalize：この旅だけの持ち物に id と checked を付ける（以前の atStay は残すだけ）', () => {
  const d = normalize({ trips: [{ id: 't', packingExtras: [{ name: '傘' }, { id: 'x', name: 'Y', checked: true, atStay: true }, null] }] });
  assert.equal(d.trips[0].packingExtras.length, 2);
  assert.match(d.trips[0].packingExtras[0].id, /^[a-z0-9]{12}$/);
  assert.equal(d.trips[0].packingExtras[0].checked, false);
  assert.deepEqual(d.trips[0].packingExtras[1], { id: 'x', name: 'Y', checked: true, atStay: true });
});
