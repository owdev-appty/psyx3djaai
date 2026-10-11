import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotOfTime, slotOf, groupBySlot, reorderUntimed, departureLimits, isValidTime, fromMinutes } from '../js/logic/plan.js';

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

test('出発リミット：飛行機の前のいちばん近い移動 − 余裕', () => {
  const items = [
    { id: 'f', kind: 'flight', time: '16:30' },
    { id: 'b1', kind: 'bus', time: '12:00' },
    { id: 'b2', kind: 'bus', time: '14:34' },
    { id: 'food', kind: 'food', time: '15:00' },
    { id: 'after', kind: 'train', time: '18:00' },
  ];
  const [r] = departureLimits(items);
  assert.equal(r.time, '14:24');
  assert.equal(r.move.id, 'b2');
  assert.equal(r.reason, '16:30発の飛行機に間に合う14:34のバスから逆算（余裕10分）');
});

test('出発リミット：余裕を変えられる・やめた移動は使わない・移動がなければ出さない', () => {
  assert.equal(departureLimits([{ kind: 'flight', time: '10:00' }, { kind: 'train', time: '08:15', leaveBufferMin: 25 }])[0].time, '07:50');
  assert.equal(departureLimits([{ kind: 'flight', time: '10:00' }, { kind: 'train', time: '08:15', status: 'skipped' }]).length, 0);
  assert.equal(departureLimits([{ kind: 'flight', time: '10:00' }, { kind: 'bus', time: null, slot: 'morning' }]).length, 0);
  assert.equal(departureLimits([{ kind: 'flight', time: null }, { kind: 'bus', time: '08:00' }]).length, 0);
  assert.equal(departureLimits([{ kind: 'flight', time: '00:20' }, { kind: 'car', time: '00:05', leaveBufferMin: 10 }])[0].time, '23:55');
});

test('fromMinutes: 日をまたいでも 0〜23時', () => {
  assert.equal(fromMinutes(-5), '23:55');
  assert.equal(fromMinutes(1445), '00:05');
});
