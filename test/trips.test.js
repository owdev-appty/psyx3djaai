import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nights, tripDates, nextTrip, daysUntil, upcomingTrips, planningTrips, pastTripsByYear, needsLookBack, bookingCounts, bookingList, bookingStatusCounts, todoNow, addDays } from '../js/logic/trips.js';
import { tripTotals, foreignToYen, formatYen } from '../js/logic/money.js';
import { packingProgress } from '../js/logic/packing.js';

const today = '2026-10-11';
const T = (id, status, startDate = null, endDate = null, extra = {}) => ({ id, status, startDate, endDate, days: [], unscheduled: [], todos: [], expenses: [], ...extra });

test('nights / addDays / tripDates', () => {
  assert.equal(nights(T('a', 'booked', '2026-12-04', '2026-12-07')), 3);
  assert.equal(nights(T('a', 'idea')), null);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(tripDates(T('a', 'booked', '2026-12-30', '2027-01-01')), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.deepEqual(tripDates(T('a', 'idea', null, null, { days: [{ date: '2026-05-02' }] })), ['2026-05-02']);
  assert.deepEqual(tripDates(T('a', 'idea')), []);
});

test('nextTrip: 終わっていない旅のうち、いちばん早い。旅行中も次の旅', () => {
  const trips = [
    T('past', 'done', '2026-01-01', '2026-01-03'),
    T('later', 'booked', '2027-02-01', '2027-02-03'),
    T('soon', 'planning', '2026-12-04', '2026-12-07'),
    T('cancel', 'cancelled', '2026-11-01', '2026-11-02'),
  ];
  assert.equal(nextTrip(trips, today).id, 'soon');
  assert.equal(daysUntil(trips[2], today), 54);
  const ongoing = T('now', 'booked', '2026-10-10', '2026-10-12');
  assert.equal(nextTrip([...trips, ongoing], today).id, 'now');
  assert.equal(daysUntil(ongoing, today), 0);
  assert.equal(nextTrip([], today), null);
});

test('upcomingTrips: 次の旅以外の、今日以降の旅（状態を問わず）を日付順', () => {
  const trips = [
    T('next', 'planning', '2026-11-01', '2026-11-02'),
    T('undated', 'idea'),
    T('p2', 'planning', '2027-03-01', '2027-03-02'),
    T('booked', 'booked', '2026-12-04', '2026-12-07'),
    T('idea', 'idea', '2027-01-10', '2027-01-12'),
    T('past', 'booked', '2026-09-01', '2026-09-02'),
    T('cancel', 'cancelled', '2026-12-20', '2026-12-21'),
    T('done', 'done', '2026-12-24', '2026-12-25'),
  ];
  assert.deepEqual(upcomingTrips(trips, today).map((t) => t.id), ['booked', 'idea', 'p2']);
  assert.deepEqual(upcomingTrips([], today), []);
});

test('planningTrips: 日程未定の旅（日程のある旅は出さない）', () => {
  const trips = [
    T('next', 'planning', '2026-11-01', '2026-11-02'),
    T('undated', 'idea'),
    T('undatedPlanning', 'planning'),
    T('p2', 'planning', '2027-03-01', '2027-03-02'),
    T('undatedDone', 'done'),
  ];
  assert.deepEqual(planningTrips(trips, today).map((t) => t.id), ['undated', 'undatedPlanning']);
});

test('pastTripsByYear: done・cancelled・日程が過ぎた旅を年ごとに新しい順', () => {
  const trips = [
    T('a', 'done', '2024-05-01', '2024-05-02'),
    T('b', 'cancelled', '2025-08-01', '2025-08-03'),
    T('c', 'booked', '2025-09-01', '2025-09-02'),
    T('d', 'booked', '2026-12-01', '2026-12-02'),
  ];
  const g = pastTripsByYear(trips, today);
  assert.deepEqual(g.map((x) => x.year), ['2025', '2024']);
  assert.deepEqual(g[0].trips.map((t) => t.id), ['c', 'b']);
});

test('needsLookBack: 最終日を過ぎて done / cancelled でない', () => {
  assert.equal(needsLookBack(T('a', 'booked', '2026-10-01', '2026-10-10'), today), true);
  assert.equal(needsLookBack(T('a', 'booked', '2026-10-01', '2026-10-11'), today), false);
  assert.equal(needsLookBack(T('a', 'done', '2026-10-01', '2026-10-10'), today), false);
});

test('bookingCounts: 予約と移動・宿の予定（やめたものは数えない）', () => {
  const t = T('a', 'booked', '2026-12-04', '2026-12-05', {
    days: [{ date: '2026-12-04', items: [
      { kind: 'flight', status: 'booked' },
      { kind: 'stay', status: 'considering' },
      { kind: 'food', status: null },
      { kind: 'other', status: 'booked', booking: { provider: 'x' } },
      { kind: 'bus', status: 'skipped' },
    ] }],
  });
  assert.deepEqual(bookingCounts(t), { booked: 2, total: 3 });
});

test('todoNow: To do の予定・未完了の todos・検討中の予約（終わった旅は除く）', () => {
  const trips = [
    T('a', 'planning', '2026-12-04', '2026-12-05', {
      days: [{ date: '2026-12-04', items: [
        { id: 1, kind: 'todo', status: null },
        { id: 2, kind: 'food', status: 'todo' },
        { id: 3, kind: 'stay', status: 'considering' },
        { id: 4, kind: 'food', status: 'considering' },
        { id: 5, kind: 'todo', status: 'done' },
      ] }],
      todos: [{ id: 't1', text: 'x', done: false }, { id: 't2', text: 'y', done: true }],
    }),
    T('old', 'done', '2026-01-01', '2026-01-02', { todos: [{ id: 'z', done: false }] }),
  ];
  const r = todoNow(trips, today);
  assert.deepEqual(r.map((x) => x.type + ':' + (x.item?.id ?? x.todo.id)), ['item:1', 'item:2', 'considering:3', 'todo:t1']);
});

test('tripTotals / foreignToYen / formatYen', () => {
  const trip = { expenses: [{ amountYen: 1000, miles: 500 }, { amountYen: null, foreign: { amount: 300000, currency: 'VND' } }, { amountYen: null }] };
  assert.equal(foreignToYen(300000, 170), 1765);
  assert.deepEqual(tripTotals(trip, { fxRates: { VND: 170 } }), { yen: 2765, miles: 500 });
  assert.deepEqual(tripTotals({ ...trip, fxRates: { VND: 200 } }, { fxRates: { VND: 170 } }), { yen: 2500, miles: 500 });
  assert.equal(formatYen(98025), '98,025円');
});

test('packingProgress: MUST! の物＋オンのタグの物（重複なし）。以前の旅ごとの「宿にある」は読み飛ばして数える', () => {
  const items = [
    { id: 'm', mustHave: true, tagIds: [] },
    { id: 'a', tagIds: ['sea', 'city'] },
    { id: 'b', tagIds: ['mountain'] },
    { id: 'c', tagIds: ['sea'] },
  ];
  const trip = { packing: { tagIds: ['sea', 'city'], checked: { a: true }, skipped: { c: 'atStay' } }, packingExtras: [{ name: 'x' }] };
  assert.deepEqual(packingProgress(trip, items), { done: 1, total: 4 });
});

test('bookingList: 日付順・同じ日は時刻順、日程未定は最後。移動・宿か booking のある予定だけ', () => {
  const trip = T('t', 'booked', '2026-12-04', '2026-12-05', {
    days: [
      { date: '2026-12-05', items: [{ id: 'stay', kind: 'stay', time: null }] },
      { date: '2026-12-04', items: [
        { id: 'late', kind: 'bus', time: '18:00' },
        { id: 'food', kind: 'food', time: '12:00' },
        { id: 'early', kind: 'flight', time: '09:00' },
        { id: 'tour', kind: 'activity', time: null, booking: { number: 'X' } },
      ] },
    ],
    unscheduled: [{ id: 'car', kind: 'car' }],
  });
  assert.deepEqual(bookingList(trip).map((r) => r.item.id), ['tour', 'early', 'late', 'stay', 'car']);
  assert.equal(bookingList(trip).at(-1).date, null);
});

test('bookingStatusCounts: 予約済み / To do / 検討中', () => {
  const trip = T('t', 'booked', null, null, { unscheduled: [
    { kind: 'flight', status: 'booked' }, { kind: 'stay', status: 'booked' },
    { kind: 'bus', status: 'todo' }, { kind: 'car', status: 'considering' },
    { kind: 'ferry', status: 'skipped' }, { kind: 'food', status: 'booked' },
  ] });
  assert.deepEqual(bookingStatusCounts(trip), { booked: 2, todo: 1, considering: 1 });
});
