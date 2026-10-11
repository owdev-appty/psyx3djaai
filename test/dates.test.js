import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toISODate, parseISODate, formatDay } from '../js/logic/dates.js';

test('formatDay: 月/日 曜日', () => {
  assert.equal(formatDay('2026-12-04'), '12/4 金');
  assert.equal(formatDay('2026-10-11'), '10/11 日');
  assert.equal(formatDay('2025-12-30', { withYear: true }), '2025/12/30 火');
});

test('formatDay: 形が違う・ない日付は空文字', () => {
  assert.equal(formatDay(null), '');
  assert.equal(formatDay('2026-02-30'), '');
  assert.equal(formatDay('2026/12/04'), '');
});

test('parseISODate: うるう年', () => {
  assert.deepEqual(parseISODate('2028-02-29'), { y: 2028, m: 2, d: 29, weekday: 2 });
  assert.equal(parseISODate('2027-02-29'), null);
});

test('toISODate: 端末の日付で YYYY-MM-DD', () => {
  assert.equal(toISODate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
