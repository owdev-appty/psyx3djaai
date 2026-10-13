// v1.2.0：予約を手で入れやすく、候補の Price と Book this、予約の料金を Money に、Add plan の「店にも入れる」「宿にも入れる」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeTargetOf, findByName, addPlanToPlace } from '../js/logic/places.js';
import { expensePresetFromItem, expenseOfItem, sortCandidatesByPrice, tripTotals } from '../js/logic/money.js';
import { normalize } from '../js/store.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
let n = 0;
const makeId = () => `id${++n}`;

test('店にも入れる：Food / Bar / Sight / Activity / Shop は店、Stay は宿。ほかは入れない', () => {
  for (const k of ['food', 'bar', 'sight', 'activity', 'shop']) assert.equal(placeTargetOf(k), 'spot', k);
  assert.equal(placeTargetOf('stay'), 'stay');
  for (const k of ['flight', 'train', 'clothes', 'todo', 'other', undefined]) assert.equal(placeTargetOf(k), null, String(k));
});

test('店にも入れる：新しい店は Want to go で入り、予定とつなぐ。同じ名前があれば新しく作らずにつなぐ', () => {
  const place = { id: 'p', name: '石垣島', spots: [{ id: 'old', name: 'ソーキソバ屋', kind: 'food', status: 'again' }], stays: [] };
  const a = addPlanToPlace(place, { title: ' 島そば 屋 ', kind: 'food', url: 'https://x.example/' }, makeId);
  assert.equal(a.target, 'spot');
  assert.equal(a.created, true);
  const s = place.spots.find((x) => x.id === a.spotId);
  assert.deepEqual([s.name, s.kind, s.status, s.url], ['島そば 屋', 'food', 'want', 'https://x.example/']);
  // ひらがな / カタカナ・全角 / 半角・前後の空白は同じ名前とみなす
  const b = addPlanToPlace(place, { title: 'そーきそば屋', kind: 'food' }, makeId);
  assert.deepEqual([b.spotId, b.created], ['old', false]);
  assert.equal(place.spots.length, 2);
  assert.equal(findByName(place.spots, 'ｿｰｷｿﾊﾞ屋')?.id, 'old');
});

test('宿にも入れる：宿の一覧に入れる（同じ名前があれば作らない）。予定とはつながない', () => {
  const place = { id: 'p', stays: [{ id: 'y', name: 'ホテルA' }] };
  assert.deepEqual(addPlanToPlace(place, { title: 'ホテルA', kind: 'stay' }, makeId), { target: 'stay', spotId: null, created: false });
  const r = addPlanToPlace(place, { title: '民宿B', kind: 'stay' }, makeId);
  assert.deepEqual([r.target, r.created, r.spotId], ['stay', true, null]);
  assert.deepEqual(place.stays.map((x) => x.name), ['ホテルA', '民宿B']);
  // 種類が対象外・名前が空なら何もしない
  assert.deepEqual(addPlanToPlace(place, { title: 'x', kind: 'flight' }, makeId), { target: null, spotId: null, created: false });
  assert.deepEqual(addPlanToPlace(place, { title: '  ', kind: 'food' }, makeId), { target: null, spotId: null, created: false });
});

test('予約の料金を Money に：Add expense の下書き（分類・円・マイル・支払い）と、予約とのつながり', () => {
  const flight = { id: 'i1', title: 'JAL 903', kind: 'flight', booking: { priceYen: 23000 } };
  assert.deepEqual(expensePresetFromItem(flight), { title: 'JAL 903', category: 'transport', amountYen: 23000, miles: null, payment: ['cashcard'], fromItemId: 'i1' });
  assert.deepEqual(expensePresetFromItem({ id: 'i2', title: 'ホテル', kind: 'stay', booking: { priceYen: 9000, miles: 3000 } }).payment, ['cashcard', 'miles']);
  const award = expensePresetFromItem({ id: 'i3', title: '特典航空券', kind: 'flight', booking: { miles: 15000 } });
  assert.deepEqual([award.category, award.amountYen, award.miles, award.payment], ['transport', null, 15000, ['miles']]);
  assert.equal(expensePresetFromItem({ id: 'i4', kind: 'activity', booking: { priceYen: 1 } }).category, 'other');
  // 入れた支出は fromItemId でわかる（二重に入れないため）。保存→読み込みでも消えない
  const trip = normalize({ app: 'TripNote', schemaVersion: 1, trips: [{ id: 't', expenses: [{ id: 'e', title: 'JAL 903', amountYen: 23000, fromItemId: 'i1' }] }] }).trips[0];
  assert.equal(expenseOfItem(trip, 'i1').id, 'e');
  assert.equal(expenseOfItem(trip, 'i2'), null);
  assert.equal(tripTotals(trip, {}).yen, 23000);
});

test('候補：Price があれば安い順（Price のない候補は後ろに、元の順番のまま）。Price は保存→読み込みで残る', () => {
  const list = [{ id: 'a', priceYen: 32000 }, { id: 'b' }, { id: 'c', priceYen: 18000 }, { id: 'd' }, { id: 'e', priceYen: 29800 }];
  assert.deepEqual(sortCandidatesByPrice(list).map((c) => c.id), ['c', 'e', 'a', 'b', 'd']);
  assert.deepEqual(list.map((c) => c.id), ['a', 'b', 'c', 'd', 'e']); // 元の配列は変えない
  const t = normalize({ app: 'TripNote', schemaVersion: 1, trips: [{ id: 't', candidates: [{ id: 'c', title: 'ANA', priceYen: 29800 }] }] }).trips[0];
  assert.equal(t.candidates[0].priceYen, 29800);
});

test('画面：Add plan の新規でも Day・Note・Link・予約の欄。店にも入れる（初期値オン）と店の名前の候補', () => {
  const f = read('js/views/itemForm.js');
  assert.match(f, /const showBooking = !!it\.booking \|\| BOOKING_KINDS\.includes\(it\.kind\);/);
  assert.doesNotMatch(f, /\$\{isNew \? '' : `\n      <label class="field">\n        <span class="field-label">Day<\/span>/);
  assert.match(f, /<input type="checkbox" name="toPlace" checked>/);
  assert.match(f, /list="tn-spot-names"/);
  assert.match(f, /addPlanToPlace\(place, \{ title: fields\.title, kind: fields\.kind, url: fields\.url \}, newId\)/);
  assert.match(f, /if \(added\.spotId\) item\.spotId = added\.spotId;/);
  const b = read('js/views/tripBookings.js');
  assert.match(b, /data-act="add-booking">＋ Add booking</);
  assert.match(b, /data-act="to-money">\$\{icon\('plusCircle'\)\}Add to Money</);
  assert.match(b, /Money に入れました/);
  assert.match(b, /data-act-book>Book this</);
  assert.match(b, /onSaved: \(\) => \{\n            store\.update\(\(d\) => \{ removeCandidate\(d\.trips\.find\(\(x\) => x\.id === tripId\), c\.id\); \}\);/);
  assert.match(read('js/views/expenseForm.js'), /fromItemId: e\.fromItemId/);
});
