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

test('区分：忘れると困る（タグに関係なく）／オンのタグの物（重複なし・順番どおり）／宿にある／この旅だけ', () => {
  const trip = { packing: { tagIds: ['sea', 'city'], checked: {}, skipped: { c: 'atStay' } }, packingExtras: [{ id: 'x', name: 'X' }] };
  const s = tripPackingSections(trip, items);
  assert.deepEqual(s.mustHave.map((p) => p.id), ['m']);
  assert.deepEqual(s.tagged.map((p) => p.id), ['a']);
  assert.deepEqual(s.atStay.map((p) => p.id), ['c']);
  assert.equal(s.extras.length, 1);
});

test('準備数：宿にある物は数えない。この旅だけの物は数える', () => {
  const trip = { packing: { tagIds: ['sea'], checked: { a: true, m: true, c: true }, skipped: { c: 'atStay' } }, packingExtras: [{ name: 'x', checked: true }, { name: 'y' }] };
  assert.deepEqual(packingProgress(trip, items), { done: 3, total: 4 });
  assert.deepEqual(packingProgress({}, []), { done: 0, total: 0 });
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

test('normalize：この旅だけの持ち物に id と checked を付ける', () => {
  const d = normalize({ trips: [{ id: 't', packingExtras: [{ name: '傘' }, { id: 'x', name: 'Y', checked: true }, null] }] });
  assert.equal(d.trips[0].packingExtras.length, 2);
  assert.match(d.trips[0].packingExtras[0].id, /^[a-z0-9]{12}$/);
  assert.equal(d.trips[0].packingExtras[0].checked, false);
  assert.deepEqual(d.trips[0].packingExtras[1], { id: 'x', name: 'Y', checked: true });
});
