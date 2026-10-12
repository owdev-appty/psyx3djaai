// AI D（ふりかえり整理）・E（場所ノートの整理）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  lookbackInput, canLookback, lookbackDrafts, applyLookbackDrafts,
  tidyInput, canTidy, tidyDrafts, applyTidyDrafts,
} from '../js/logic/ai.js';

let n = 0;
const makeId = () => `new${++n}`;

const places = () => [
  {
    id: 'pl-naha', name: '那覇',
    notesToSelf: [], transportTips: [],
    spots: [
      { id: 'sp-a', name: 'A店', kind: 'food', status: 'want', note: '' },
      { id: 'sp-b', name: 'B店', kind: 'bar', status: 'want', note: '前のメモ' },
      { id: 'sp-c', name: 'C店', kind: 'food', status: 'want' },
    ],
  },
  { id: 'pl-other', name: 'ほかの場所', spots: [{ id: 'sp-x', name: 'X', status: 'want' }], notesToSelf: [] },
];
const trip = () => ({
  id: 'tr1', title: '沖縄', startDate: '2026-11-03', endDate: '2026-11-05', placeIds: ['pl-naha'],
  lookBack: 'A店のソーキそば最高。予約番号 QWE123。連絡は a@b.com',
  lookbackAnswers: { 'sp-a': 'visited', 'sp-b': 'skip' },
  days: [{ date: '2026-11-03', items: [{ id: 'i1', spotId: 'sp-a', booking: { referenceNo: 'REF-SECRET' } }, { id: 'i2', spotId: 'sp-b' }] }],
  unscheduled: [],
});

// ---------- D ----------
test('D：送る前に伏せ字。記号で送り、本当の id・予約番号・旅の場所以外は送らない', () => {
  const { input, map } = lookbackInput(trip(), places(), '2026-11-06');
  const sent = JSON.stringify(input);
  assert.doesNotMatch(sent, /QWE123|a@b\.com|REF-SECRET|sp-a|pl-naha|ほかの場所/);
  assert.match(input.lookBack, /予約番号 ••••/);
  assert.deepEqual(input.places, [{ ref: 'P1', name: '那覇' }]);
  assert.deepEqual(input.spots, [
    { ref: 'S1', name: 'A店', place: 'P1', status: 'want', answer: 'visited' },
    { ref: 'S2', name: 'B店', place: 'P1', status: 'want', answer: 'skip' },
  ]);
  assert.deepEqual(map.spots.S1, { placeId: 'pl-naha', spotId: 'sp-a' });
  assert.equal(map.places.P1, 'pl-naha');
  assert.equal(canLookback(input), true);
  assert.equal(canLookback(lookbackInput({ ...trip(), lookBack: '', lookbackAnswers: {} }, places(), '').input), false);
});

test('D：結果の形が違っても落ちない。知らない記号・今と同じ状態は捨て、個人情報を取り除く', () => {
  const ps = places();
  const { map } = lookbackInput(trip(), ps, '');
  for (const bad of [null, 'x', 5, { spotStatus: 'x' }, { spotStatus: [null, 3], spotNotes: {}, notesToSelf: [{}] }]) {
    const d = lookbackDrafts(bad, map, ps);
    assert.deepEqual([d.status, d.notes, d.self], [[], [], []]);
  }
  const d = lookbackDrafts({
    spotStatus: [{ spot: 'S1', status: 'again', reason: '最高' }, { spot: 'S2', status: 'want', reason: '同じ' }, { spot: 'S9', status: 'visited' }, { spot: 'S1', status: 'visited' }, { spot: 'S2', status: 'closed' }],
    spotNotes: [{ spot: 'S1', text: 'ソーキそばがおすすめ 予約番号 ZZZ999' }, { spot: 'S1', text: '2つ目' }, { spot: 'S2', text: '' }],
    notesToSelf: [{ place: 'P1', text: '国際通りは夕方混む' }, { place: 'P2', text: 'ない場所' }],
    message: 'カード番号 4111 1111 1111 1111',
  }, map, ps);
  assert.deepEqual(d.status.map((x) => [x.name, x.from, x.to]), [['A店', 'want', 'again']]);
  assert.deepEqual(d.notes.map((x) => [x.spotId, x.text]), [['sp-a', 'ソーキそばがおすすめ']]);
  assert.deepEqual(d.self.map((x) => [x.placeId, x.text]), [['pl-naha', '国際通りは夕方混む']]);
  assert.doesNotMatch(d.message, /4111/);
});

test('D：採用したものだけ保存。店の状態・店のメモ（後ろに足す）・Notes to self（「◯◯から」の出どころ）', () => {
  const data = { places: places(), trips: [trip()] };
  const { map } = lookbackInput(data.trips[0], data.places, '');
  const d = lookbackDrafts({
    spotStatus: [{ spot: 'S1', status: 'again', reason: '' }, { spot: 'S2', status: 'nextTime', reason: '' }],
    spotNotes: [{ spot: 'S1', text: 'ソーキそば' }, { spot: 'S2', text: '次は予約する' }],
    notesToSelf: [{ place: 'P1', text: '夕方は混む' }, { place: 'P1', text: '却下するメモ' }],
    message: '',
  }, map, data.places);
  d.notes[0].include = false;           // 却下
  d.self[1].include = false;            // 却下
  d.self[0].text = '夕方は混む（直した）'; // 修正
  const counts = applyLookbackDrafts(data, 'tr1', d, makeId, 2026);
  assert.deepEqual(counts, { status: 2, notes: 1, self: 1 });
  const [a, b] = data.places[0].spots;
  assert.equal(a.status, 'again');
  assert.equal(a.note, '');
  assert.equal(b.status, 'nextTime');
  assert.equal(b.sinceYear, 2026);
  assert.equal(b.note, '前のメモ\n次は予約する');
  assert.deepEqual(data.places[0].notesToSelf.map((x) => [x.text, x.fromTripId]), [['夕方は混む（直した）', 'tr1']]);
  assert.deepEqual(data.places[1].notesToSelf, []);
});

// ---------- E ----------
const place = () => ({
  id: 'pl', name: '那覇',
  notesToSelf: [
    { id: 'n1', text: '国際通りは混む', fromTripId: 'tr1' },
    { id: 'n2', text: 'ゆいレール1日券 800円（2019年）', fromTripId: 'tr0' },
    { id: 'n3', text: '国際通り 夕方は混雑。予約番号 ABC123', fromTripId: 'tr1' },
    { id: 'n4', text: '首里城は早朝がよい', fromTripId: null },
  ],
  transportTips: [
    { id: 't1', title: 'ゆいレール', text: '1日券がお得', url: '' },
    { id: 't2', title: 'モノレール', text: '24時間券あり', url: 'https://yui-rail.example/' },
    { id: 't3', title: 'バス', text: '那覇バス', url: '' },
  ],
});

test('E：送る前に伏せ字。Notes to self は N…、移動のコツは T… の記号で全件', () => {
  const { input, map } = tidyInput(place());
  assert.equal(input.notes.length, 4);
  assert.equal(input.tips.length, 3);
  assert.equal(input.notes[2].text, '国際通り 夕方は混雑。予約番号 ••••');
  assert.deepEqual(input.tips[0], { ref: 'T1', title: 'ゆいレール', text: '1日券がお得' });
  assert.doesNotMatch(JSON.stringify(input), /ABC123|n1|t1|yui-rail|tr1/);
  assert.deepEqual(map.N3, { list: 'notesToSelf', id: 'n3' });
  assert.deepEqual(map.T2, { list: 'transportTips', id: 't2' });
  assert.equal(canTidy(input), true);
  assert.equal(canTidy(tidyInput({ notesToSelf: [{ id: 'a', text: 'x' }] }).input), false);
});

test('E：結果の形が違っても落ちない。知らない記号・一覧をまたぐまとめ・2回目に出た記号は捨てる', () => {
  const p = place();
  const { map } = tidyInput(p);
  for (const bad of [null, 'x', { merges: 'x' }, { merges: [null, { list: 'notes', from: 'N1' }], stale: [{}], top: [3] }]) {
    const d = tidyDrafts(bad, map, p);
    assert.deepEqual([d.merges, d.stale, d.top], [[], [], []]);
  }
  const d = tidyDrafts({
    merges: [
      { list: 'notes', from: ['N1', 'N3'], title: 'x', text: '国際通りは夕方混む。予約番号 ABC123', reason: '重複' },
      { list: 'notes', from: ['N1', 'N4'], title: '', text: '重なり', reason: '' },     // N1 は使用済み
      { list: 'tips', from: ['T1', 'N2'], title: '', text: 'またぐ', reason: '' },       // 一覧をまたぐ
      { list: 'tips', from: ['T1', 'T2'], title: 'ゆいレール', text: '1日券・24時間券がある', reason: '似ている' },
    ],
    stale: [{ ref: 'N2', reason: '2019年の料金' }, { ref: 'N3', reason: '使用済み' }, { ref: 'Q1', reason: '' }],
    top: [{ ref: 'N4', reason: '大事' }, { ref: 'T3', reason: '' }],
    message: '',
  }, map, p);
  assert.deepEqual(d.merges.map((m) => [m.list, m.ids, m.title, m.text]), [
    ['notesToSelf', ['n1', 'n3'], '', '国際通りは夕方混む。'],
    ['transportTips', ['t1', 't2'], 'ゆいレール', '1日券・24時間券がある'],
  ]);
  assert.deepEqual(d.merges[0].olds.map((x) => x.id), ['n1', 'n3']); // 変更前を並べて出すため
  assert.deepEqual(d.stale.map((x) => x.id), ['n2']);
  assert.deepEqual(d.top.map((x) => [x.list, x.id]), [['notesToSelf', 'n4'], ['transportTips', 't3']]);
});

test('E：まとめたら、元の項目は消え、いちばん上にあった元の位置に1件入る。ほかの並びは変えない', () => {
  const p = place();
  const { map } = tidyInput(p);
  const d = tidyDrafts({
    merges: [
      { list: 'notes', from: ['N3', 'N1'], title: '', text: '国際通りは夕方混む', reason: '' },
      { list: 'tips', from: ['T2', 'T1'], title: 'ゆいレール', text: '1日券・24時間券', reason: '' },
    ],
    stale: [{ ref: 'N2', reason: '' }],
    top: [{ ref: 'N4', reason: '' }, { ref: 'T3', reason: '' }],
    message: '',
  }, map, p);
  const counts = applyTidyDrafts(p, d, makeId);
  assert.deepEqual(counts, { merged: 2, removed: 1, moved: 2 });
  // notes：[n1, n2, n3, n4] → n1・n3 をまとめて n1 の位置へ → n2 を消す → n4 を上へ
  assert.deepEqual(p.notesToSelf.map((x) => x.text), ['首里城は早朝がよい', '国際通りは夕方混む']);
  assert.equal(p.notesToSelf[1].fromTripId, 'tr1'); // 元が同じ旅なら出どころを残す
  // tips：[t1, t2, t3] → t1・t2 をまとめて t1 の位置へ（URL は元から引き継ぐ）→ t3 を上へ
  assert.deepEqual(p.transportTips.map((x) => [x.title, x.text]), [['バス', '那覇バス'], ['ゆいレール', '1日券・24時間券']]);
  assert.equal(p.transportTips[1].url, 'https://yui-rail.example/');
  assert.ok(!p.transportTips.some((x) => x.id === 't1' || x.id === 't2'));
});

test('E：却下したものは変えない。出どころが違う Notes をまとめたら出どころなし。元の項目がもうなければ使わない', () => {
  const p = place();
  const { map } = tidyInput(p);
  const d = tidyDrafts({
    merges: [{ list: 'notes', from: ['N1', 'N2'], title: '', text: 'まとめ', reason: '' }],
    stale: [{ ref: 'N4', reason: '' }],
    top: [{ ref: 'T3', reason: '' }],
    message: '',
  }, map, p);
  d.stale[0].include = false;
  d.top[0].include = false;
  applyTidyDrafts(p, d, makeId);
  assert.deepEqual(p.notesToSelf.map((x) => x.text), ['まとめ', '国際通り 夕方は混雑。予約番号 ABC123', '首里城は早朝がよい']);
  assert.equal(p.notesToSelf[0].fromTripId, null);
  assert.deepEqual(p.transportTips.map((x) => x.id), ['t1', 't2', 't3']);
  // 確認している間に元の項目が消されていたら、その案は使わない
  const p2 = place();
  const d2 = tidyDrafts({ merges: [{ list: 'notes', from: ['N1', 'N3'], title: '', text: 'x', reason: '' }], stale: [], top: [], message: '' }, tidyInput(p2).map, p2);
  p2.notesToSelf = p2.notesToSelf.filter((x) => x.id !== 'n3');
  assert.deepEqual(applyTidyDrafts(p2, d2, makeId), { merged: 0, removed: 0, moved: 0 });
  assert.equal(p2.notesToSelf.length, 3);
});

test('画面：D・E は「AIで整理」から。実行前に「回数を1回使います（今日の残り◯回）」', () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(read('js/views/lookback.js'), /data-act="ai-tidy">AIで整理</);
  assert.match(read('js/views/place.js'), /data-act="ai-tidy">AIで整理</);
  assert.match(read('js/views/aiCommon.js'), /回数を1回使います/);
  for (const f of ['aiLookback', 'aiTidy', 'aiScreenshot', 'aiMemo']) assert.match(read(`js/views/${f}.js`), /costLine\(\)/, f);
  assert.match(read('js/views/aiLookback.js'), /callAI\('lookback', built\.input\)/);
  assert.match(read('js/views/aiTidy.js'), /callAI\('tidy', built\.input\)/);
});
