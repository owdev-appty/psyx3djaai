// v1.3.1：レビュー（v1.0.0 以降）の直し。画面の判定を小さな関数に分けてテストする
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBooking, ensureBooking, bookingPresetFromCandidate, removeCandidate, bookingList } from '../js/logic/trips.js';
import { canAddToMoney, moneyLinkedText, expensePresetFromItem } from '../js/logic/money.js';
import { toPlaceTarget } from '../js/logic/places.js';
import { draftToCandidate } from '../js/logic/ai.js';
import { lastPackingTrip, moveExtraToMaster } from '../js/logic/packing.js';
import { searchAll } from '../js/logic/search.js';

let n = 0;
const makeId = () => `id${++n}`;

test('中3：Bookings から作った予定は、予約の欄が空でも予約として付き、Kind が Other でも Bookings に出る', () => {
  assert.deepEqual(ensureBooking(null), emptyBooking());
  const b = { provider: 'JAL', priceYen: 1 };
  assert.equal(ensureBooking(b), b);
  const trip = { days: [{ date: '2026-11-20', items: [{ id: 'i', title: 'Peach', kind: 'other', booking: ensureBooking(null) }] }], unscheduled: [] };
  assert.deepEqual(bookingList(trip).map((r) => r.item.id), ['i']);
});

test('中4：Book this は候補のシートの今の値から作る。Price がなくても予約の欄を付ける', () => {
  const p = bookingPresetFromCandidate({ title: 'Peach', detail: '手荷物別', url: 'https://x.example/', priceYen: 17000 });
  assert.deepEqual([p.title, p.status, p.note, p.url, p.booking.priceYen, p.booking.referenceNo], ['Peach', 'booked', '手荷物別', 'https://x.example/', 17000, '']);
  assert.equal(bookingPresetFromCandidate({ title: 'ANA', priceYen: null }).booking.priceYen, null);
  assert.ok(bookingPresetFromCandidate({ title: 'ANA' }).booking);
});

test('Book this：候補を消すのは、予定を保存したとき（removeCandidate）だけ', () => {
  const trip = { candidates: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(removeCandidate(trip, 'a'), true);
  assert.deepEqual(trip.candidates.map((c) => c.id), ['b']);
  assert.equal(removeCandidate(trip, 'zz'), false);
  assert.equal(removeCandidate(null, 'b'), false);
});

test('Add to Money：料金かマイルがあり、まだ入れていない予約だけに出す。入れた後の表示（円・マイル）', () => {
  const item = { id: 'i1', kind: 'flight', booking: { priceYen: 18000 } };
  assert.equal(canAddToMoney({ expenses: [] }, item), true);
  assert.equal(canAddToMoney({ expenses: [{ id: 'e', fromItemId: 'i1' }] }, item), false); // 2回は出さない
  assert.equal(canAddToMoney({ expenses: [] }, { id: 'i2', booking: {} }), false);
  assert.equal(canAddToMoney({ expenses: [] }, { id: 'i3', booking: { miles: 15000 } }), true);
  assert.equal(moneyLinkedText({ amountYen: 18000 }), '18,000円');
  assert.equal(moneyLinkedText(expensePresetFromItem({ id: 'x', kind: 'flight', booking: { miles: 15000 } })), '15,000 mi'); // 低4：0円と出さない
  assert.equal(moneyLinkedText({ amountYen: 9000, miles: 3000 }), '9,000円 + 3,000 mi');
});

test('店にも入れる：新しい予定・店か宿の種類・チェックがオンのときだけ', () => {
  assert.equal(toPlaceTarget({ isNew: true, kind: 'food', checked: true }), 'spot');
  assert.equal(toPlaceTarget({ isNew: true, kind: 'stay', checked: true }), 'stay');
  assert.equal(toPlaceTarget({ isNew: true, kind: 'food', checked: false }), null);
  assert.equal(toPlaceTarget({ isNew: false, kind: 'food', checked: true }), null);
  assert.equal(toPlaceTarget({ isNew: true, kind: 'flight', checked: true }), null);
});

test('低1：AI のスクショ取り込みで作った候補にも Price（円）が入る', () => {
  const c = draftToCandidate({ title: 'Peach', price: 18000, currency: 'JPY', date: '', time: '', endTime: '', from: '', to: '', number: '', provider: '', cancelPolicy: '', note: '', url: '' }, {}, {}, 'c');
  assert.equal(c.priceYen, 18000);
  const foreign = draftToCandidate({ title: 'X', price: 100, currency: 'EUR' }, {}, { fxRates: {} }, 'd');
  assert.equal(foreign.priceYen, null); // レートがなければ円にしない
});

test('低2：Start from last trip は、日程のある前の旅だけから選ぶ（日程未定の旅は終わった旅から）', () => {
  const trips = [
    { id: 'past', status: 'done', startDate: '2025-08-01', endDate: '2025-08-03', placeIds: ['ig'], packing: { tagIds: ['g'] } },
    { id: 'future', status: 'planning', startDate: '2027-01-01', endDate: '2027-01-03', placeIds: ['ig'], packing: { tagIds: ['h'] } },
    { id: 'undated', status: 'idea', startDate: null, placeIds: ['ig'], packing: { tagIds: ['u'] } },
  ];
  assert.equal(lastPackingTrip({ id: 'now', startDate: '2026-11-20', placeIds: ['ig'] }, trips, '2026-10-13').id, 'past');
  assert.equal(lastPackingTrip({ id: 'now', startDate: null, placeIds: ['ig'] }, trips, '2026-10-13').id, 'past'); // 未来の旅は選ばない
  assert.equal(lastPackingTrip({ id: 'now', startDate: '2026-11-20', placeIds: ['ig'] }, [trips[2]], '2026-10-13'), null);
});

test('低3：To master はマスターに同じ名前があれば、新しく作らずにタグを足す', () => {
  const data = { packingItems: [{ id: 'p', name: 'シュノーケル', tagIds: ['a'] }], trips: [{ id: 't', packing: { checked: {} }, packingExtras: [{ id: 'x', name: 'しゅのーける', checked: true }] }] };
  // 名前の比べ方は NFKC・小文字（ひらがな / カタカナは別とみなす）
  const r1 = moveExtraToMaster(data, 't', 'x', { tagIds: ['b'], makeId, order: 1 });
  assert.equal(r1.merged, false);
  const data2 = { packingItems: [{ id: 'p', name: 'シュノーケル', tagIds: ['a'] }], trips: [{ id: 't', packing: { checked: {} }, packingExtras: [{ id: 'x', name: ' ｼｭﾉｰｹﾙ ', checked: true }] }] };
  const r2 = moveExtraToMaster(data2, 't', 'x', { tagIds: ['b'], makeId, order: 1 });
  assert.deepEqual([r2.merged, r2.item.id, r2.item.tagIds], [true, 'p', ['a', 'b']]);
  assert.equal(data2.packingItems.length, 1);
  assert.equal(data2.trips[0].packing.checked.p, true);
  assert.deepEqual(data2.trips[0].packingExtras, []);
});

test('検索の端のケース：名前のない店、日程未定の予定、種類ごとの件数の上限、店の名前が空', () => {
  const data = {
    places: [{ id: 'p', name: '那覇', spots: [{ id: 's', name: '', note: '牛肉麺' }, ...Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, name: `牛肉麺${i}` }))] }],
    trips: [{ id: 'tr', title: 'x', days: [], unscheduled: [{ id: 'u', title: '牛肉麺の店へ' }], memos: [] }],
  };
  const r = searchAll(data, '牛肉麺', { max: 3 });
  const spots = r.filter((x) => x.type === 'spot');
  assert.equal(spots.length, 3);
  assert.deepEqual([spots[0].label, spots[0].spotName], ['（名前なし）', '']);
  const plan = r.find((x) => x.type === 'plan');
  assert.deepEqual([plan.day, plan.sub], ['unscheduled', 'x · 日程未定']);
});

test('低6〜11：リンクの id をエンコード、検索のキーで閉じる、狭い幅で1列、検索欄の見た目、44px、使わない CSS を消した', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(read('js/views/trip.js'), /#\/place\/\$\{esc\(encodeURIComponent\(p\.id\)\)\}\/notes/);
  assert.match(read('js/views/lookback.js'), /#\/trip\/\$\{esc\(encodeURIComponent\(trip\.id\)\)\}\/notes/);
  assert.match(read('js/views/samePlace.js'), /const route = esc\(encodeURIComponent\(place\.id\)\)/);
  for (const f of ['js/views/places.js', 'js/views/place.js']) assert.match(read(f), /if \(isSubmitEnter\(e\)\) \{ e\.preventDefault\(\); \w+\.blur\(\); \}/, f);
  const css = read('css/app.css');
  assert.match(css, /@media \(max-width: 359px\) \{\n  \.booking-adds \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.app-search, \.spot-search \{ -webkit-appearance: none; appearance: none; \}/);
  assert.match(css, /\.same-link \{[^}]*min-height: var\(--tap\)/);
  assert.equal((css.match(/\[hidden\]/g) || []).length, 1); // 全体の1つだけ
  assert.equal((css.match(/^\.same-spot \{/gm) || []).length, 1);
});
