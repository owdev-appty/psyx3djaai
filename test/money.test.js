import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foreignToYen, rateFor, expenseYen, tripTotals, perNight, byCategory, memoTotalDiff,
  unloggedExpenses, unloggedCount, totalsByYear, compareSamePlace, perNightByPlace,
  parseAmount, formatYen, formatMiles, formatForeign, expenseAmountText,
} from '../js/logic/money.js';

const settings = { fxRates: { VND: 170, USD: 0.0067 } };
const E = (id, amountYen, extra = {}) => ({ id, title: id, category: 'other', amountYen, miles: null, foreign: null, payment: 'cashcard', logged: false, approx: false, note: '', ...extra });
const T = (id, startDate, endDate, expenses = [], extra = {}) => ({ id, status: 'done', startDate, endDate, placeIds: [], expenses, days: [], unscheduled: [], ...extra });

test('換算：外貨 ÷ 1円あたりのレート（四捨五入）', () => {
  assert.equal(foreignToYen(300000, 170), 1765);
  assert.equal(foreignToYen(100, 0), null);
  assert.equal(foreignToYen(NaN, 170), null);
  assert.equal(foreignToYen(10, 0.0067), 1493);
});

test('rateFor：旅のレートが先、なければ設定のレート', () => {
  const trip = { fxRates: { VND: 180 } };
  assert.equal(rateFor('VND', trip, settings), 180);
  assert.equal(rateFor('VND', {}, settings), 170);
  assert.equal(rateFor('VND', { fxRates: { VND: 0 } }, settings), 170);
  assert.equal(rateFor('EUR', trip, settings), null);
});

test('expenseYen：記録した円があればそれ、なければ外貨から換算。レートがなければ null', () => {
  const recorded = E('a', 1800, { foreign: { amount: 300000, currency: 'VND' } });
  assert.equal(expenseYen(recorded, {}, settings), 1800);
  const fx = E('b', null, { foreign: { amount: 300000, currency: 'VND' } });
  assert.equal(expenseYen(fx, {}, settings), 1765);
  assert.equal(expenseYen(fx, { fxRates: { VND: 150 } }, settings), 2000);
  assert.equal(expenseYen(E('c', null, { foreign: { amount: 5, currency: 'EUR' } }), {}, settings), null);
  assert.equal(expenseYen(E('d', null), {}, settings), null);
});

test('tripTotals：円の合計とマイルの合計（換算できないものは0として数える）', () => {
  const trip = T('t', '2026-12-04', '2026-12-07', [
    E('a', 10000, { miles: 15000, payment: 'miles' }),
    E('b', 2500),
    E('c', null, { foreign: { amount: 340000, currency: 'VND' } }),
    E('d', null, { foreign: { amount: 5, currency: 'EUR' } }),
  ]);
  assert.deepEqual(tripTotals(trip, settings), { yen: 14500, miles: 15000 });
  assert.deepEqual(tripTotals(T('x', null, null), settings), { yen: 0, miles: 0 });
  assert.deepEqual(tripTotals({ expenses: null }, settings), { yen: 0, miles: 0 });
});

test('perNight：合計 ÷ 泊数。日帰り・日程未定は null', () => {
  assert.equal(perNight(T('t', '2026-12-04', '2026-12-07', [E('a', 30000), E('b', 1000)]), settings), 10333);
  assert.equal(perNight(T('t', '2026-12-04', '2026-12-04', [E('a', 3000)]), settings), null);
  assert.equal(perNight(T('t', null, null, [E('a', 3000)]), settings), null);
});

test('byCategory：6つの分類をいつも同じ順で。知らない分類は その他', () => {
  const trip = T('t', null, null, [
    E('a', 1000, { category: 'stay' }), E('b', 500, { category: 'stay' }),
    E('c', 200, { category: 'food' }), E('d', 300, { category: 'unknown' }), E('e', 50),
  ]);
  assert.deepEqual(byCategory(trip, settings), [
    { category: 'transport', yen: 0 }, { category: 'stay', yen: 1500 }, { category: 'food', yen: 200 },
    { category: 'souvenir', yen: 0 }, { category: 'activity', yen: 0 }, { category: 'other', yen: 350 },
  ]);
});

test('memoTotalDiff：メモの合計が計算と違うときだけ返す', () => {
  const trip = T('t', null, null, [E('a', 1000)]);
  assert.equal(memoTotalDiff({ ...trip, memoTotalYen: 1200 }, settings), 1200);
  assert.equal(memoTotalDiff({ ...trip, memoTotalYen: 1000 }, settings), null);
  assert.equal(memoTotalDiff({ ...trip, memoTotalYen: null }, settings), null);
});

test('家計簿 未転記：logged が true でないもの。旅の新しい順', () => {
  const old = T('old', '2025-01-01', '2025-01-02', [E('o1', 1, { logged: true }), E('o2', 1)]);
  const neu = T('new', '2026-01-01', '2026-01-02', [E('n1', 1), E('n2', 1, { logged: null })]);
  assert.deepEqual(unloggedExpenses([old, neu]).map((x) => x.expense.id), ['n1', 'n2', 'o2']);
  assert.equal(unloggedCount(old), 1);
  assert.equal(unloggedCount({}), 0);
});

test('totalsByYear：開始日の年ごと、新しい年から。日程未定は最後。支出のない旅は数えない', () => {
  const trips = [
    T('a', '2025-03-01', '2025-03-03', [E('1', 1000, { miles: 500 })]),
    T('b', '2025-12-30', '2026-01-02', [E('2', 2000)]),
    T('c', '2026-05-01', '2026-05-02', [E('3', 300)]),
    T('d', null, null, [E('4', 40)]),
    T('e', '2024-01-01', '2024-01-02', []),
  ];
  assert.deepEqual(totalsByYear(trips, settings), [
    { year: '2026', yen: 300, miles: 0, trips: 1 },
    { year: '2025', yen: 3000, miles: 500, trips: 2 },
    { year: '日程未定', yen: 40, miles: 0, trips: 1 },
  ]);
});

const today = '2026-10-11';

test('compareSamePlace：同じ場所の終わった旅（その旅も含む）を新しい順。比べる相手がなければ空', () => {
  const cur = T('cur', '2026-12-04', '2026-12-07', [E('a', 60000)], { placeIds: ['p1'], status: 'booked' });
  const past1 = T('p1a', '2024-05-01', '2024-05-03', [E('b', 40000)], { placeIds: ['p1'] });
  const past2 = T('p1b', '2025-05-01', '2025-05-05', [E('c', 100000)], { placeIds: ['p2', 'p1'] });
  const other = T('x', '2025-01-01', '2025-01-03', [E('d', 1)], { placeIds: ['p9'] });
  const dayTrip = T('day', '2025-02-01', '2025-02-01', [E('e', 1)], { placeIds: ['p1'] });
  const cancelled = T('can', '2023-02-01', '2023-02-03', [E('f', 1)], { placeIds: ['p1'], status: 'cancelled' });
  const future = T('fut', '2027-02-01', '2027-02-03', [E('g', 1)], { placeIds: ['p1'], status: 'booked' });
  const endedNotDone = T('end', '2026-01-01', '2026-01-03', [E('h', 30000)], { placeIds: ['p1'], status: 'booked' });
  const rows = compareSamePlace(cur, [cur, past1, past2, other, dayTrip, cancelled, future], settings, today);
  assert.deepEqual(rows.map((r) => [r.trip.id, r.nights, r.yen, r.perNight, r.current]), [
    ['cur', 3, 60000, 20000, true],
    ['p1b', 4, 100000, 25000, false],
    ['p1a', 2, 40000, 20000, false],
  ]);
  assert.deepEqual(compareSamePlace(cur, [cur, other, future], settings, today), []);
  assert.deepEqual(compareSamePlace({ ...cur, placeIds: [] }, [cur, past1], settings, today), []);
  // 最終日を過ぎた旅は Done でなくても比べる。その旅に支出がなくても、過去の旅は出す
  const empty = { ...cur, expenses: [] };
  assert.deepEqual(compareSamePlace(empty, [empty, endedNotDone], settings, today).map((r) => r.trip.id), ['end']);
});

test('perNightByPlace：場所ごとに 終わった旅の 合計 ÷ 泊数の合計。高い順', () => {
  const places = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }];
  const trips = [
    T('1', '2024-05-01', '2024-05-03', [E('a', 40000)], { placeIds: ['p1'] }),
    T('2', '2025-05-01', '2025-05-05', [E('b', 100000)], { placeIds: ['p1', 'p2'] }),
    T('3', '2026-12-01', '2026-12-03', [E('c', 999999)], { placeIds: ['p3'], status: 'booked' }),
  ];
  const rows = perNightByPlace(trips, places, settings, today);
  assert.deepEqual(rows.map((r) => [r.place.id, r.trips, r.nights, r.perNight]), [['p2', 1, 4, 25000], ['p1', 2, 6, 23333]]);
});

test('parseAmount：カンマ・全角数字・円を受け付ける', () => {
  assert.equal(parseAmount('1,765'), 1765);
  assert.equal(parseAmount('１２３４'), 1234);
  assert.equal(parseAmount(' 98,025円 '), 98025);
  assert.equal(parseAmount('12.5'), 12.5);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('-5'), null);
  assert.equal(parseAmount('1e3'), null);
});

test('表示：円・マイル・外貨', () => {
  assert.equal(formatYen(98025), '98,025円');
  assert.equal(formatMiles(15000), '15,000 mi');
  assert.equal(formatForeign(300000, 'VND'), '300,000₫');
  assert.equal(formatForeign(12.5, 'USD'), '$12.5');
  assert.equal(formatForeign(100, 'XYZ'), '100 XYZ');
  const fx = E('a', null, { foreign: { amount: 300000, currency: 'VND' } });
  assert.equal(expenseAmountText(fx, {}, settings), '300,000₫ ≈ 1,765円');
  assert.equal(expenseAmountText(E('b', 1000), {}, settings), '1,000円');
  assert.equal(expenseAmountText(E('c', null, { foreign: { amount: 5, currency: 'EUR' } }), {}, settings), '€5');
});

test('通貨：選べる外貨は7つ、表示は日本語名つき', async () => {
  const { CURRENCIES, currencyLabel, YEN } = await import('../js/labels.js');
  assert.deepEqual(CURRENCIES, ['VND', 'TWD', 'USD', 'KRW', 'THB', 'EUR', 'SGD']);
  assert.equal(currencyLabel('TWD'), 'TWD（台湾ドル）');
  assert.equal(currencyLabel(YEN), '円');
  assert.equal(currencyLabel('HKD'), 'HKD'); // 一覧にない古いデータはコードだけ
});

test('markAllLogged：未転記だけを済にして件数を返す', async () => {
  const { markAllLogged, unloggedCount } = await import('../js/logic/money.js');
  const trip = { expenses: [{ logged: true }, { logged: false }, {}, null] };
  assert.equal(markAllLogged(trip), 2);
  assert.equal(unloggedCount(trip), 0);
  assert.equal(markAllLogged(trip), 0);
  assert.equal(markAllLogged({}), 0);
});

test('支払い：複数選べる。古いデータの文字1つも読める', async () => {
  const { paymentsOf, usesAmount, usesMiles } = await import('../js/logic/money.js');
  const { normalize } = await import('../js/store.js');
  assert.deepEqual(paymentsOf({ payment: 'miles' }), ['miles']);
  assert.deepEqual(paymentsOf({ payment: ['cashcard', 'miles', 'miles', 'x'] }), ['cashcard', 'miles']);
  assert.deepEqual(paymentsOf({}), ['cashcard']);
  assert.deepEqual(paymentsOf({ payment: [] }), ['cashcard']);
  assert.equal(usesAmount(['miles']), false);
  assert.equal(usesAmount(['subsidy']), true);
  assert.equal(usesMiles(['miles', 'cashcard']), true);
  const d = normalize({ trips: [{ id: 't', expenses: [{ id: 'e', payment: 'subsidy' }, { id: 'f' }] }] });
  assert.deepEqual(d.trips[0].expenses.map((e) => e.payment), [['subsidy'], ['cashcard']]);
});

test('特典航空券：マイル 10,000 と 現金・カード 340円 を1件で', async () => {
  const { tripTotals } = await import('../js/logic/money.js');
  assert.deepEqual(tripTotals({ expenses: [{ amountYen: 340, miles: 10000, payment: ['cashcard', 'miles'] }] }, {}), { yen: 340, miles: 10000 });
});
