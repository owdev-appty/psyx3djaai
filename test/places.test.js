import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeStats, removePlace, tripsUsingPlace, sortPlaces, findPlaceByName } from '../js/logic/places.js';

const today = '2026-10-11';
const trips = [
  { id: 'a', placeIds: ['p1'], status: 'done', startDate: '2024-05-01', endDate: '2024-05-03' },
  { id: 'b', placeIds: ['p1', 'p2'], status: 'booked', startDate: '2025-08-01', endDate: '2025-08-04' },
  { id: 'c', placeIds: ['p1'], status: 'cancelled', startDate: '2026-01-01', endDate: '2026-01-02' },
  { id: 'd', placeIds: ['p1'], status: 'planning', startDate: '2026-12-01', endDate: '2026-12-02' },
];

test('placeStats：行った回数（行かなかった旅・これからの旅は除く）・最後の年・店の数', () => {
  assert.deepEqual(placeStats({ id: 'p1', spots: [{}, {}] }, trips, today), { visits: 2, lastYear: 2025, spots: 2 });
  assert.deepEqual(placeStats({ id: 'p9' }, trips, today), { visits: 0, lastYear: null, spots: 0 });
});

test('removePlace：旅から外すだけで、旅は消さない', () => {
  const data = { places: [{ id: 'p1' }, { id: 'p2' }], trips: JSON.parse(JSON.stringify(trips)) };
  assert.equal(tripsUsingPlace(data.trips, 'p1').length, 4);
  assert.equal(removePlace(data, 'p1'), 4);
  assert.deepEqual(data.places.map((p) => p.id), ['p2']);
  assert.equal(data.trips.length, 4);
  assert.deepEqual(data.trips.map((t) => t.placeIds), [[], ['p2'], [], []]);
});

test('sortPlaces / findPlaceByName', () => {
  assert.deepEqual(sortPlaces([{ id: 'b', order: 1 }, { id: 'a', order: 0 }]).map((p) => p.id), ['a', 'b']);
  assert.equal(findPlaceByName([{ id: 'x', name: 'テスト ' }], 'テスト').id, 'x');
});

test('読み込み：もうない場所を指している旅の placeIds は外す（旅は残す）', async () => {
  const { normalize } = await import('../js/store.js');
  const d = normalize({ places: [{ id: 'p2', name: 'Other' }], trips: [{ id: 't', placeIds: ['p1', 'p2'] }, { id: 'u', placeIds: ['p1'] }] });
  assert.deepEqual(d.trips.map((t) => [t.id, t.placeIds]), [['t', ['p2']], ['u', []]]);
});
