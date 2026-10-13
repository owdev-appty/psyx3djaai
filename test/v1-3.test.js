// v1.3.0：ふりかえりで店を足す、前回の学び、前回の旅から持ち物を始める
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { samePlaceHints, lookbackSpots, addLookbackSpot } from '../js/logic/places.js';
import { lastPackingTrip, copyPackingFrom, moveExtraToMaster } from '../js/logic/packing.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
let n = 0;
const makeId = () => `id${++n}`;

const place = () => ({
  id: 'ig', name: '石垣島',
  notesToSelf: [{ id: 'n1', text: '日焼け止め必須' }],
  transportTips: [{ id: 't1', title: '離島ターミナル', text: '早めに' }],
  spots: [
    { id: 's1', name: 'A', status: 'want' }, { id: 's2', name: 'B', status: 'again' },
    { id: 's3', name: 'C', status: 'nextTime' }, { id: 's4', name: 'D', status: 'visited' },
  ],
});

test('前回の学び：店は Want to go / Go again / Next time!、移動のコツ、前回のふりかえり（いちばん新しい終わった旅の先頭3行）', () => {
  const trips = [
    { id: 'old', title: '2024', status: 'done', startDate: '2024-07-01', endDate: '2024-07-03', placeIds: ['ig'], lookBack: '古い' },
    { id: 'last', title: '2025夏', status: 'done', startDate: '2025-08-01', endDate: '2025-08-03', placeIds: ['ig'], lookBack: '1行目\n\n2行目\n3行目\n4行目' },
    { id: 'no', title: '行かなかった', status: 'cancelled', startDate: '2025-12-01', endDate: '2025-12-02', placeIds: ['ig'], lookBack: '書いた' },
  ];
  const trip = { id: 'now', status: 'planning', startDate: '2026-11-20', endDate: '2026-11-23', placeIds: ['ig'] };
  const [h] = samePlaceHints(trip, [place()], '2026-10-13', trips);
  assert.deepEqual(h.spots.map((s) => s.id), ['s1', 's2', 's3']);
  assert.equal(h.tips.length, 1);
  assert.equal(h.lastLook.trip.id, 'last');
  assert.deepEqual(h.lastLook.lines, ['1行目', '2行目', '3行目']);
  // 店も Notes もコツもふりかえりもなければ出さない。終わった旅には出さない
  assert.deepEqual(samePlaceHints(trip, [{ id: 'ig', name: 'x' }], '2026-10-13', []), []);
  assert.deepEqual(samePlaceHints({ ...trip, status: 'done' }, [place()], '2026-10-13', trips), []);
});

test('ふりかえりで行った店を足す：新しい店は fromTripId 付きで足し、同じ名前ならその店の状態を変える。どちらもふりかえりの一覧に出る', () => {
  const data = { places: [place()] };
  const trip = { id: 'tr', placeIds: ['ig'], days: [{ items: [{ spotId: 's1' }] }], lookbackAnswers: {} };
  const a = addLookbackSpot(data, trip, { placeId: 'ig', name: '新しい食堂', kind: 'food', status: 'visited' }, makeId, 2026);
  assert.equal(a.created, true);
  assert.deepEqual([a.spot.status, a.spot.fromTripId, a.spot.kind], ['visited', 'tr', 'food']);
  const b = addLookbackSpot(data, trip, { placeId: 'ig', name: 'Ｄ', kind: 'food', status: 'nextTime' }, makeId, 2026);
  assert.deepEqual([b.created, b.spot.id, b.spot.status, b.spot.sinceYear], [false, 's4', 'nextTime', 2026]);
  assert.deepEqual(trip.lookbackAnswers, { [a.spot.id]: 'visited', s4: 'nextTime' });
  assert.deepEqual(lookbackSpots(trip, data.places).map(({ spot }) => spot.name), ['A', 'D', '新しい食堂']);
  assert.equal(addLookbackSpot(data, trip, { placeId: 'ig', name: '  ', status: 'visited' }, makeId), null);
});

test('前回の旅から始める：同じ場所の、前のいちばん新しい旅のタグと This trip only を写す（チェックなし・同じ名前は足さない）', () => {
  const trips = [
    { id: 'a', status: 'done', startDate: '2024-07-01', placeIds: ['ig'], packing: { tagIds: ['g0'] }, packingExtras: [] },
    { id: 'b', status: 'done', startDate: '2025-08-01', placeIds: ['ig', 'tk'], packing: { tagIds: ['g1', 'g2'] }, packingExtras: [{ id: 'x1', name: 'シュノーケル', checked: true }, { id: 'x2', name: 'ラッシュガード', checked: true }] },
    { id: 'c', status: 'cancelled', startDate: '2025-12-01', placeIds: ['ig'], packing: { tagIds: ['g9'] } },
    { id: 'd', status: 'done', startDate: '2025-09-01', placeIds: ['other'], packing: { tagIds: ['g8'] } },
    { id: 'e', status: 'planning', startDate: '2027-01-01', placeIds: ['ig'], packing: { tagIds: ['g7'] } },
  ];
  const now = { id: 'now', startDate: '2026-11-20', placeIds: ['ig'], packing: { tagIds: ['g2'], checked: {} }, packingExtras: [{ id: 'y', name: 'しゅのーける', checked: false }] };
  assert.equal(lastPackingTrip(now, trips).id, 'b');
  const r = copyPackingFrom(now, lastPackingTrip(now, trips), makeId);
  assert.deepEqual(r, { tags: 1, extras: 2 });
  assert.deepEqual(now.packing.tagIds, ['g2', 'g1']);
  assert.deepEqual(now.packingExtras.map((x) => [x.name, x.checked]), [['しゅのーける', false], ['シュノーケル', false], ['ラッシュガード', false]]);
  assert.equal(lastPackingTrip({ id: 'z', startDate: '2026-01-01', placeIds: ['none'] }, trips), null);
});

test('This trip only を持ち物マスターへ：オンのタグを付けてマスターに入れ、この旅だけの物から外す。チェックは引き継ぐ', () => {
  const data = { packingItems: [{ id: 'p0', name: '傘', order: 0 }], trips: [{ id: 't', packing: { tagIds: ['g1'], checked: {} }, packingExtras: [{ id: 'x', name: '虫よけ', checked: true }, { id: 'y', name: 'z', checked: false }] }] };
  const { item, merged } = moveExtraToMaster(data, 't', 'x', { tagIds: ['g1'], makeId, order: 1 });
  assert.equal(merged, false);
  assert.deepEqual([item.name, item.tagIds, item.mustHave, item.order], ['虫よけ', ['g1'], false, 1]);
  assert.equal(data.packingItems.length, 2);
  assert.deepEqual(data.trips[0].packingExtras.map((x) => x.id), ['y']);
  assert.equal(data.trips[0].packing.checked[item.id], true);
  assert.equal(moveExtraToMaster(data, 't', 'nope', { makeId }), null);
});

test('画面：旅の名前の下に場所、ふりかえりに「＋ 行った店を足す」と「残っていること」、Packing に Start from last trip と To master', () => {
  assert.match(read('js/views/trip.js'), /class="trip-place" href="#\/place\/\$\{esc\(p\.id\)\}\/notes">/);
  const lb = read('js/views/lookback.js');
  assert.match(lb, /data-act="add-spot">＋ 行った店を足す</);
  assert.match(lb, /残っていること/);
  assert.match(lb, /Unsorted のメモ \$\{unsortedN\}件/);
  assert.match(lb, /家計簿 未転記 \$\{unloggedN\}件/);
  const pk = read('js/views/tripPacking.js');
  assert.match(pk, /data-act="from-last">Start from last trip</);
  assert.match(pk, /data-act="to-master">To master</);
  const sp = read('js/views/samePlace.js');
  assert.match(sp, /：前回の学び/);
  assert.match(sp, /前回のふりかえり/);
});
