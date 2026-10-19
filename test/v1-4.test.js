// v1.4.0：外貨の円を固定、予定の Note を Spot にコピー、前からある予定も Spots に、Memo を Notes to self にコピー、「店」→「Spot」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freezeForeign, freezeTripExpenses, expenseRate, tripTotals } from '../js/logic/money.js';
import { appendNote, addPlanToPlace, unlinkedPlanSpots, copyToNotesToSelf, placesForCopy } from '../js/logic/places.js';
import { normalize } from '../js/store.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
let n = 0;
const makeId = () => `id${++n}`;

test('外貨の支出：入れたときのレートで円を固定（金額・通貨・レートを変えたときだけ計算し直す）', () => {
  const a = freezeForeign({ amount: 1000, currency: 'TWD', rate: 0.2 });
  assert.deepEqual(a, { foreign: { amount: 1000, currency: 'TWD', rate: 0.2 }, amountYen: 5000 });
  // 同じなら前の円のまま（タイトルだけ直したときなど）
  assert.equal(freezeForeign({ amount: 1000, currency: 'TWD', rate: 0.2 }, { foreign: { amount: 1000, currency: 'TWD', rate: 0.2 }, amountYen: 4999 }).amountYen, 4999);
  // レートを変えたら計算し直す
  assert.equal(freezeForeign({ amount: 1000, currency: 'TWD', rate: 0.25 }, { foreign: { amount: 1000, currency: 'TWD', rate: 0.2 }, amountYen: 5000 }).amountYen, 4000);
  // 前のデータ（rate なし・円あり）：Rate の欄には金額と円から出したレートが入る。そのままなら記録してあった円を使い、変えたら計算し直す
  const old = { foreign: { amount: 300000, currency: 'VND' }, amountYen: 1765 };
  assert.equal(expenseRate(old, {}, {}), 169.9717);
  assert.equal(freezeForeign({ amount: 300000, currency: 'VND', rate: 169.9717 }, old).amountYen, 1765);
  assert.equal(freezeForeign({ amount: 300000, currency: 'VND', rate: 170 }, old).amountYen, 1765); // 300000/170 = 1764.7 → 1765
  assert.equal(freezeForeign({ amount: 300000, currency: 'VND', rate: 200 }, old).amountYen, 1500);
});

test('外貨の支出：Settings や旅のレートを変えても、前の支出の円は変わらない', () => {
  const settings = { fxRates: { TWD: 0.2 } };
  const trip = { expenses: [{ id: 'e', ...freezeForeign({ amount: 1000, currency: 'TWD', rate: 0.2 }) }] };
  assert.equal(tripTotals(trip, settings).yen, 5000);
  settings.fxRates.TWD = 0.25;      // Settings を変えた
  trip.fxRates = { TWD: 0.3 };      // 旅のレートも変えた
  assert.equal(tripTotals(trip, settings).yen, 5000);
  assert.equal(expenseRate(trip.expenses[0], trip, settings), 0.2);
});

test('前からある外貨の支出（円が決まっていない）は、読み込みのときに今のレートで1回だけ固定する', () => {
  const raw = {
    app: 'TripNote', schemaVersion: 1, settings: { fxRates: { TWD: 0.2, VND: 170 } },
    trips: [{ id: 't', fxRates: { VND: 180 }, expenses: [
      { id: 'a', foreign: { amount: 1000, currency: 'TWD' }, amountYen: null },
      { id: 'b', foreign: { amount: 18000, currency: 'VND' } },
      { id: 'c', foreign: { amount: 300000, currency: 'VND' }, amountYen: 1765 }, // 円がある（初期データの形）はそのまま
      { id: 'd', foreign: { amount: 10, currency: 'EUR' } },                      // レートがない通貨はそのまま
    ] }],
  };
  const d = normalize(raw);
  const [a, b, c, e] = d.trips[0].expenses;
  assert.deepEqual([a.amountYen, a.foreign.rate], [5000, 0.2]);
  assert.deepEqual([b.amountYen, b.foreign.rate], [100, 180]); // 旅のレートが先
  assert.deepEqual([c.amountYen, c.foreign.rate], [1765, undefined]);
  assert.equal(e.amountYen ?? null, null);
  // 2回目の読み込みでレートを変えても、固定した円は変わらない
  const again = normalize({ ...JSON.parse(JSON.stringify(d)), settings: { fxRates: { TWD: 0.5 } } });
  assert.equal(again.trips[0].expenses[0].amountYen, 5000);
  assert.equal(freezeTripExpenses({ expenses: [] }, {}), 0);
});

test('予定の Note を Spot にコピー：新しい Spot は Note つき、前からある Spot には後ろに足す（同じ文は足さない）。宿も同じ', () => {
  assert.equal(appendNote('', '  美味しい '), '美味しい');
  assert.equal(appendNote('前のメモ', '美味しい'), '前のメモ\n美味しい');
  assert.equal(appendNote('前のメモ\n美味しい', '美味しい'), '前のメモ\n美味しい');
  assert.equal(appendNote('前', ''), '前');
  const place = { spots: [{ id: 's', name: '微熱山丘', kind: 'shop', status: 'visited', note: 'パイナップルケーキ' }], stays: [{ id: 'y', name: 'ホテルA', note: '' }] };
  const a = addPlanToPlace(place, { title: '佳徳', kind: 'shop', note: 'パイナップルフィナンシェ。高めだけど美味しい' }, makeId);
  assert.equal(place.spots.find((s) => s.id === a.spotId).note, 'パイナップルフィナンシェ。高めだけど美味しい');
  addPlanToPlace(place, { title: '微熱山丘', kind: 'shop', note: '試食あり' }, makeId);
  addPlanToPlace(place, { title: '微熱山丘', kind: 'shop', note: '試食あり' }, makeId);
  assert.equal(place.spots[0].note, 'パイナップルケーキ\n試食あり');
  addPlanToPlace(place, { title: 'ホテルA', kind: 'stay', note: '駅近' }, makeId);
  assert.equal(place.stays[0].note, '駅近');
});

test('ふりかえり：Spot の種類の予定で、まだ場所ノートとつながっていないもの（同じ名前は1回）', () => {
  const trip = {
    days: [{ date: '2026-10-01', items: [
      { id: 'a', title: '佳徳', kind: 'shop' }, { id: 'b', title: '鼎泰豐', kind: 'food', spotId: 's1' },
      { id: 'c', title: '飛行機', kind: 'flight' }, { id: 'd', title: 'カトク', kind: 'shop' }, { id: 'e', title: '', kind: 'bar' },
    ] }],
    unscheduled: [{ id: 'f', title: '九份', kind: 'sight' }, { id: 'g', title: '佳徳', kind: 'shop' }],
  };
  assert.deepEqual(unlinkedPlanSpots(trip).map((r) => [r.item.id, r.dayKey]), [['a', '2026-10-01'], ['d', '2026-10-01'], ['f', 'unscheduled']]);
});

test('Memo を Notes to self にコピー：出どころの旅つき、同じ文はコピーしない。場所はその旅の場所を先に', () => {
  const place = { id: 'kix', name: '関西空港', notesToSelf: [] };
  assert.equal(copyToNotesToSelf(place, ' 第1ターミナルの両替は混む ', 'tw', makeId), true);
  assert.deepEqual(place.notesToSelf.map((x) => [x.text, x.fromTripId]), [['第1ターミナルの両替は混む', 'tw']]);
  assert.equal(copyToNotesToSelf(place, '第1ターミナルの両替は混む', 'tw', makeId), false);
  assert.equal(copyToNotesToSelf(place, '  ', 'tw', makeId), false);
  const places = [{ id: 'kix', name: '関西空港' }, { id: 'tp', name: '台北' }, { id: 'ig', name: '石垣島' }];
  assert.deepEqual(placesForCopy({ placeIds: ['tp'] }, places).map((p) => p.id), ['tp', 'kix', 'ig']);
});

test('画面：「店」は「Spot」に。Edit でも Spot にも入れる、ふりかえりに「Spot に入れる」、Memo に Copy to Notes to self、レートの説明', () => {
  assert.match(read('js/views/place.js'), /\['spots', 'Spots'\]/);
  const f = read('js/views/itemForm.js');
  assert.match(f, /places\.length && \(isNew \|\| !it\.spotId\)/);
  assert.match(f, /const label = target === 'spot' \? 'Spot にも入れる' : '宿にも入れる';/);
  const lb = read('js/views/lookback.js');
  assert.match(lb, /data-act="add-spot">＋ Spot を足す</);
  assert.match(lb, /data-act="link-spot">Spot に入れる</);
  assert.match(read('js/views/tripNotes.js'), /data-act-copy>Copy to Notes to self</);
  assert.match(read('js/views/expenseForm.js'), /この支出の円は、このレートで固定します/);
  for (const file of ['js/views/place.js', 'js/views/places.js', 'js/views/itemForm.js', 'js/views/lookback.js', 'js/views/samePlace.js', 'js/views/aiLookback.js', 'js/logic/search.js']) {
    const code = read(file).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(code, /店/, file);
  }
});
