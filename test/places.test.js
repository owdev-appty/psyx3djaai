import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSpotList } from '../js/logic/search.js';
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

import {
  spotItemKind, groupSpotsByArea, renameArea, removeArea, removeSpot, mapUrl, telHref,
  pastTripsForPlace, tripsForAddToPlan, samePlaceHints, lookbackSpots, reorderList, splitFirstLine,
} from '../js/logic/places.js';

test('spotItemKind：Souvenir は Shop、Cowork（work）は Other', () => {
  assert.deepEqual(['food', 'bar', 'sight', 'activity', 'shop', 'souvenir', 'work', 'x'].map(spotItemKind), ['food', 'bar', 'sight', 'activity', 'shop', 'shop', 'other', 'other']);
});

test('店：状態で絞り込み、エリアごとにまとめる（エリアなしは最後、店のないエリアも出す）', () => {
  const place = { areas: [{ id: 'a1', name: '竹富島' }, { id: 'a2', name: '五島' }, { id: 'a3', name: '空' }] };
  const spots = [
    { id: 's1', area: '五島', status: 'want' }, { id: 's2', area: '竹富島', status: 'visited' },
    { id: 's3', area: '', status: 'want' }, { id: 's4', area: '消えたエリア', status: 'want' },
  ];
  assert.deepEqual(filterSpotList(spots, { status: 'want' }).map((s) => s.id), ['s1', 's3', 's4']);
  const g = groupSpotsByArea(place, spots);
  assert.deepEqual(g.map((x) => [x.area ? x.area.name : null, x.spots.map((s) => s.id)]), [['竹富島', ['s2']], ['五島', ['s1']], ['空', []], [null, ['s3', 's4']]]);
  assert.deepEqual(groupSpotsByArea({ areas: [] }, spots).map((x) => x.spots.length), [4]);
});

test('エリアの名前の変更・削除で、店と宿の area もそろえる（店と宿は消さない）', () => {
  const place = { areas: [{ id: 'a1', name: '竹富' }], spots: [{ id: 's', area: '竹富' }], stays: [{ id: 'h', area: '竹富' }] };
  renameArea(place, '竹富', '竹富島');
  assert.deepEqual([place.areas[0].name, place.spots[0].area, place.stays[0].area], ['竹富島', '竹富島', '竹富島']);
  removeArea(place, 'a1');
  assert.deepEqual([place.areas.length, place.spots.length, place.spots[0].area, place.stays[0].area], [0, 1, '', '']);
});

test('removeSpot：店を消しても予定は消さず、spotId だけ外す', () => {
  const data = { places: [{ id: 'p', spots: [{ id: 's1' }, { id: 's2' }] }], trips: [{ days: [{ items: [{ id: 'i', spotId: 's1' }] }], unscheduled: [{ id: 'u', spotId: 's2' }] }] };
  removeSpot(data, 'p', 's1');
  assert.deepEqual(data.places[0].spots.map((s) => s.id), ['s2']);
  assert.equal(data.trips[0].days[0].items[0].spotId, null);
  assert.equal(data.trips[0].unscheduled[0].spotId, 's2');
});

test('mapUrl / telHref', () => {
  assert.equal(mapUrl({ name: 'A', url: 'https://x.example/a' }, { name: 'P' }), 'https://x.example/a');
  assert.equal(mapUrl({ name: '店 A' }, { name: '石垣' }), 'https://www.google.com/maps/search/?api=1&query=%E5%BA%97%20A%20%E7%9F%B3%E5%9E%A3');
  assert.equal(telHref('0980-12-3456'), 'tel:0980123456');
  assert.equal(telHref('+81 (0)90'), 'tel:+81090');
  assert.equal(telHref(''), '');
});

test('過去の旅・Add to plan で選べる旅', () => {
  const ts = [
    { id: 'done', placeIds: ['p'], status: 'done', startDate: '2025-01-01', endDate: '2025-01-02' },
    { id: 'cancel', placeIds: ['p'], status: 'cancelled', startDate: '2026-01-01', endDate: '2026-01-02' },
    { id: 'future-other', placeIds: ['q'], status: 'planning', startDate: '2026-11-01', endDate: '2026-11-02' },
    { id: 'future-p', placeIds: ['p'], status: 'booked', startDate: '2026-12-01', endDate: '2026-12-02' },
    { id: 'undated', placeIds: [], status: 'idea' },
  ];
  assert.deepEqual(pastTripsForPlace(ts, 'p', today).map((t) => t.id), ['cancel', 'done']);
  assert.deepEqual(tripsForAddToPlan(ts, 'p', today).map((t) => t.id), ['future-p', 'future-other', 'undated']);
});

test('samePlaceHints：終わっていない旅だけ。Notes to self と Want to go / Next time! の店', () => {
  const places = [{ id: 'p', notesToSelf: [{ id: 'n' }], spots: [{ id: 'w', status: 'want' }, { id: 'v', status: 'visited' }, { id: 'n2', status: 'nextTime' }] }, { id: 'q', notesToSelf: [], spots: [] }];
  const trip = { placeIds: ['p', 'q'], status: 'planning', startDate: '2026-12-01', endDate: '2026-12-02' };
  const h = samePlaceHints(trip, places, today);
  assert.equal(h.length, 1);
  assert.deepEqual(h[0].spots.map((s) => s.id), ['w', 'n2']);
  assert.deepEqual(samePlaceHints({ ...trip, status: 'done' }, places, today), []);
});

test('lookbackSpots：予定の spotId から店を集める（同じ店は1回）', () => {
  const places = [{ id: 'p', spots: [{ id: 's1', name: 'A' }] }];
  const trip = { days: [{ items: [{ spotId: 's1' }, { spotId: 's1' }, { spotId: 'gone' }, {}] }] };
  assert.deepEqual(lookbackSpots(trip, places).map((x) => x.spot.name), ['A']);
});

test('reorderList / splitFirstLine', () => {
  assert.deepEqual(reorderList([{ id: 'a' }, { id: 'b' }, { id: 'c' }], ['c', 'a']).map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual(splitFirstLine(' 1行目 \n2行目\n3行目 '), { title: '1行目', rest: '2行目\n3行目' });
  assert.deepEqual(splitFirstLine('1行だけ'), { title: '1行だけ', rest: '' });
});

test('reorderWithin：同じエリアの店だけ並べ替え、ほかの店の位置は変えない', async () => {
  const { reorderWithin } = await import('../js/logic/places.js');
  const spots = [{ id: 'a1' }, { id: 'b1' }, { id: 'a2' }, { id: 'b2' }, { id: 'a3' }];
  assert.deepEqual(reorderWithin(spots, ['a3', 'a1', 'a2']).map((s) => s.id), ['a3', 'b1', 'a1', 'b2', 'a2']);
  assert.deepEqual(spots.map((s) => s.id), ['a1', 'b1', 'a2', 'b2', 'a3']); // 元の配列は変えない
});
