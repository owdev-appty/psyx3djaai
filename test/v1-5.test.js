// v1.5.0：Spots の AIで整理（同じお店をまとめる）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bestSpotStatus, joinSpotNotes, mergeSpots } from '../js/logic/places.js';
import { spotsTidyInput, canTidySpots, spotsTidyDrafts } from '../js/logic/ai.js';
import { VERSION } from '../js/version.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const sample = () => ({
  places: [{
    id: 'p1', name: '台北',
    spots: [
      { id: 'a', name: '鼎泰豊', kind: 'food', status: 'want', area: '', note: '小籠包' },
      { id: 'b', name: 'Bar Mood', kind: 'bar', status: 'visited', area: '信義', note: 'クラフトビール', url: 'https://example.com' },
      { id: 'c', name: 'Din Tai Fung', kind: 'shop', status: 'again', area: '信義', note: '小籠包\n朝は空いている', phone: '02-1234' },
    ],
  }],
  trips: [{
    id: 't1',
    days: [{ items: [{ id: 'i1', spotId: 'c' }, { id: 'i2', spotId: 'b' }] }],
    unscheduled: [{ id: 'i3', spotId: 'c' }],
    lookbackAnswers: { c: 'again', b: 'visited' },
  }],
});

test('状態は「行った」方を優先（Go again > Visited > Next time! > Want to go）', () => {
  assert.equal(bestSpotStatus([{ status: 'want' }, { status: 'visited' }]), 'visited');
  assert.equal(bestSpotStatus([{ status: 'visited' }, { status: 'again' }, { status: 'nextTime' }]), 'again');
  assert.equal(bestSpotStatus([{ status: 'want' }, { status: 'nextTime' }]), 'nextTime');
  assert.equal(bestSpotStatus([{}]), 'want');
});

test('Note は上から順につなげる（同じ文は1回）', () => {
  assert.equal(joinSpotNotes([{ note: '小籠包' }, { note: '' }, { note: '小籠包\n朝は空いている' }]).includes('朝は空いている'), true);
  assert.equal(joinSpotNotes([{ note: 'A' }, { note: 'A' }]), 'A');
});

test('まとめる：いちばん上の Spot（id）を残し、ほかは消す。予定とふりかえりの答えはつなぎ替える', () => {
  const d = sample();
  const r = mergeSpots(d, 'p1', { ids: ['c', 'a'], name: '鼎泰豊 Din Tai Fung', kind: 'food', status: 'again', note: '小籠包\n朝は空いている' });
  assert.deepEqual(r, { merged: 1, relinked: 2 });
  const spots = d.places[0].spots;
  assert.deepEqual(spots.map((s) => s.id), ['a', 'b']);
  assert.equal(spots[0].name, '鼎泰豊 Din Tai Fung');
  assert.equal(spots[0].kind, 'food');
  assert.equal(spots[0].status, 'again');
  assert.equal(spots[0].area, '信義');          // 上から最初に入っているもの
  assert.equal(spots[0].phone, '02-1234');
  const t = d.trips[0];
  assert.equal(t.days[0].items[0].spotId, 'a');
  assert.equal(t.unscheduled[0].spotId, 'a');
  assert.equal(t.days[0].items[1].spotId, 'b'); // 関係ない予定はそのまま
  assert.deepEqual(t.lookbackAnswers, { a: 'again', b: 'visited' });
});

test('まとめる：ほかで消えていた Spot があるときは何もしない', () => {
  const d = sample();
  assert.deepEqual(mergeSpots(d, 'p1', { ids: ['a', 'zz'], name: 'x' }), { merged: 0, relinked: 0 });
  assert.equal(d.places[0].spots.length, 3);
  assert.deepEqual(mergeSpots(d, 'nope', { ids: ['a', 'c'], name: 'x' }), { merged: 0, relinked: 0 });
});

test('AI に送るもの：記号（SP1…）と名前・種類・状態・エリア・伏せ字にしたメモだけ。id・URL・電話は送らない', () => {
  const place = sample().places[0];
  place.spots[0].note = '予約 a@example.com 090-1234-5678';
  const { input, map } = spotsTidyInput(place);
  assert.deepEqual(Object.keys(map), ['SP1', 'SP2', 'SP3']);
  assert.equal(map.SP3, 'c');
  const text = JSON.stringify(input);
  assert.equal(text.includes('a@example.com'), false);
  assert.equal(text.includes('090-1234-5678'), false);
  assert.equal(text.includes('example.com"'), false);
  assert.equal(text.includes('02-1234'), false);
  assert.deepEqual(Object.keys(input.spots[0]).sort(), ['area', 'kind', 'name', 'note', 'ref', 'status']);
  assert.equal(canTidySpots(input), true);
  assert.equal(canTidySpots({ spots: [{ name: 'a' }, { name: ' ' }] }), false);
});

test('AI の結果 → 下書き：知らない記号・2回目の記号・1件だけの案は捨てる。並びは場所ノートの順', () => {
  const place = sample().places[0];
  const { map } = spotsTidyInput(place);
  const d = spotsTidyDrafts({
    merges: [
      { from: ['SP3', 'SP1', 'SP9'], name: '鼎泰豊', kind: 'food', reason: '同じ店の日本語と英語' },
      { from: ['SP1', 'SP2'], name: 'x', kind: 'bar' },  // SP1 は2回目
      { from: ['SP2'], name: 'y', kind: 'bar' },
      'bad', null,
    ],
    message: 'ok',
  }, map, place);
  assert.equal(d.merges.length, 1);
  const m = d.merges[0];
  assert.deepEqual(m.ids, ['a', 'c']);
  assert.equal(m.status, 'again');
  assert.equal(m.kind, 'food');
  assert.equal(m.include, true);
  assert.match(m.note, /朝は空いている/);
  assert.equal(d.message, 'ok');
  assert.deepEqual(spotsTidyDrafts(null, map, place), { merges: [], message: '' });
  // 知らない種類は、いちばん上の Spot の種類
  assert.equal(spotsTidyDrafts({ merges: [{ from: ['SP1', 'SP3'], name: 'n', kind: 'zzz' }] }, map, place).merges[0].kind, 'food');
});

test('画面：Spots タブに「AIで整理」（2件以上のとき）、確認画面は採用・消えます・Save、版と SW', () => {
  const place = read('js/views/place.js');
  assert.match(place, /data-act="ai-spots">AIで整理</);
  assert.match(place, /case 'ai-spots':\s*return openSpotsTidy\(placeId, rerender\)/);
  const view = read('js/views/aiSpotsTidy.js');
  assert.match(view, /callAI\('spots'/);
  assert.match(view, /採用（/);
  assert.match(view, /消えます/);
  assert.match(view, /saveBtn\.textContent = 'Save'/);
  assert.match(view, /offlineBlocked\(\)/);
  assert.match(read('sw.js'), /'js\/views\/aiSpotsTidy\.js'/);
  assert.equal(VERSION, '1.5.0');
});
