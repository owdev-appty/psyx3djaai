import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotOfTime, slotOf, groupBySlot, reorderUntimed, isValidTime } from '../js/logic/plan.js';

test('slotOfTime: 境目', () => {
  assert.equal(slotOfTime('00:00'), 'morning');
  assert.equal(slotOfTime('10:59'), 'morning');
  assert.equal(slotOfTime('11:00'), 'afternoon');
  assert.equal(slotOfTime('15:59'), 'afternoon');
  assert.equal(slotOfTime('16:00'), 'evening');
  assert.equal(slotOfTime('17:59'), 'evening');
  assert.equal(slotOfTime('18:00'), 'night');
  assert.equal(slotOfTime('23:59'), 'night');
  assert.equal(slotOfTime('9:30'), null);
});

test('isValidTime', () => {
  assert.ok(isValidTime('09:05'));
  assert.ok(!isValidTime('24:00'));
  assert.ok(!isValidTime(''));
  assert.ok(!isValidTime(null));
});

test('slotOf: 時刻が優先、なければ slot、どちらもなければいつでも', () => {
  assert.equal(slotOf({ time: '19:00', slot: 'morning' }), 'night');
  assert.equal(slotOf({ time: null, slot: 'evening' }), 'evening');
  assert.equal(slotOf({ time: null, slot: null }), 'anytime');
  assert.equal(slotOf({ slot: 'へん' }), 'anytime');
});

test('groupBySlot: 時刻なし（配列の順）→ 時刻あり（時刻順）、空の時間帯は出さない', () => {
  const items = [
    { id: 'a', time: '14:00' },
    { id: 'b', slot: 'afternoon' },
    { id: 'c', time: '12:30' },
    { id: 'd', slot: 'afternoon' },
    { id: 'e' },
    { id: 'f', time: '12:30' },
  ];
  const g = groupBySlot(items);
  assert.deepEqual(g.map((x) => x.slot), ['afternoon', 'anytime']);
  assert.deepEqual(g[0].untimed.map((x) => x.id), ['b', 'd']);
  assert.deepEqual(g[0].timed.map((x) => x.id), ['c', 'f', 'a']);
  assert.deepEqual(g[1].untimed.map((x) => x.id), ['e']);
  assert.deepEqual(groupBySlot(null), []);
});

test('reorderUntimed: その時間帯の時刻なしの予定だけ並べ替える', () => {
  const items = [{ id: 'x', time: '09:00' }, { id: 'b', slot: 'night' }, { id: 'm', slot: 'morning' }, { id: 'd', slot: 'night' }, { id: 'e', slot: 'night' }];
  const out = reorderUntimed(items, 'night', ['e', 'b', 'd']);
  assert.deepEqual(out.map((x) => x.id), ['x', 'e', 'm', 'b', 'd']);
  assert.equal(items[1].id, 'b'); // 元の配列は変えない
});
