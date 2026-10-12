// v1.1.0：隠す欄の不具合、旅行中の Today、Quick memo、検索
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeForSearch, searchWords, matchesAll, filterSpotList, searchAll } from '../js/logic/search.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('不具合：hidden を付けた欄は、.field などの display があっても必ず隠す', () => {
  assert.match(read('css/app.css'), /^\[hidden\] \{ display: none !important; \}/m);
  // Miles 欄は「マイル」を選んだときだけ出る（隠しているのに入力できて、保存で捨てられることがない）
  assert.match(read('js/views/expenseForm.js'), /<label class="field" data-miles-block \$\{usesMiles\(pay0\) \? '' : 'hidden'\}>/);
});

test('旅行中：日付の列の今日に Today、ホームの旅行中のカードに今日の予定（3件まで）', () => {
  const plan = read('js/views/tripPlan.js');
  assert.match(plan, /pickDay\(getSeenDay\(trip\.id\), dates, UNSCHEDULED, today\)/);
  assert.match(plan, /d === today \? 'is-today' : ''/);
  assert.match(plan, /d === today \? 'Today' : `\$\{i \+ 1\}日目`/);
  const home = read('js/views/home.js');
  assert.match(home, /isOngoing\(t, today\) \? todayPlansHtml\(t, today\) : ''/);
  assert.match(home, /list\.slice\(0, 3\)/);
});

test('検索の言葉：ひらがな・カタカナ、全角・半角、大文字・小文字を同じとみなす。空白で区切るとすべて含むもの', () => {
  assert.equal(normalizeForSearch('ソーキソバ ＡＢＣ'), 'そーきそば abc');
  assert.deepEqual(searchWords('  台北　麺 '), ['台北', '麺']);
  assert.equal(matchesAll(['牛肉麺の店', '永康街'], searchWords('ギュウ')), false);
  assert.equal(matchesAll(['ギュウニク麺'], searchWords('ぎゅうにく')), true);
  assert.equal(matchesAll(['台北の牛肉麺'], searchWords('台北 麺')), true);
  assert.equal(matchesAll(['台北の牛肉麺'], searchWords('台北 そば')), false);
});

const spots = [
  { id: 'a', name: 'ソーキそば屋', kind: 'food', status: 'want', area: '那覇', note: '' },
  { id: 'b', name: 'バーA', kind: 'bar', status: 'again', area: '那覇', note: '泡盛' },
  { id: 'c', name: '首里城', kind: 'sight', status: 'visited', area: '首里', note: '' },
];

test('店のタブ：状態・種類・言葉で絞り込む（メモやエリアでも見つかる）', () => {
  assert.deepEqual(filterSpotList(spots, {}).map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(filterSpotList(spots, { kind: 'bar' }).map((s) => s.id), ['b']);
  assert.deepEqual(filterSpotList(spots, { query: 'そーき' }).map((s) => s.id), ['a']);
  assert.deepEqual(filterSpotList(spots, { query: '泡盛' }).map((s) => s.id), ['b']);
  assert.deepEqual(filterSpotList(spots, { query: '那覇', status: 'again' }).map((s) => s.id), ['b']);
});

test('アプリ全体の検索：店・Notes to self・移動のコツ・宿・予定・Memo・旅から探し、開く先を返す', () => {
  const data = {
    places: [{
      id: 'p1', name: '台北',
      spots: [{ id: 's1', name: '牛肉麺の店', area: '永康街' }],
      notesToSelf: [{ id: 'n1', text: '牛肉麺は午前中が空いている\n2行目' }],
      transportTips: [{ id: 't1', title: 'MRT', text: '悠遊カードで牛肉麺の店まで' }],
      stays: [{ id: 'y1', name: 'ホテル牛', area: '' }],
    }],
    trips: [{
      id: 'tr1', title: '台北 2026秋', startDate: '2026-10-11',
      days: [{ date: '2026-10-12', items: [{ id: 'i1', title: '牛肉麺ランチ' }] }],
      unscheduled: [{ id: 'i2', title: 'お土産の牛肉麺' }],
      memos: [{ id: 'm1', text: '牛肉麺がおいしかった' }],
    }],
  };
  const r = searchAll(data, '牛肉麺');
  assert.deepEqual(r.map((x) => x.type), ['spot', 'note', 'tip', 'plan', 'plan', 'memo']);
  const spot = r.find((x) => x.type === 'spot');
  assert.deepEqual([spot.href, spot.placeId, spot.spotName, spot.sub], ['#/place/p1/spots', 'p1', '牛肉麺の店', '台北 · 永康街']);
  const plan = r.find((x) => x.type === 'plan');
  assert.deepEqual([plan.href, plan.tripId, plan.day], ['#/trip/tr1/plan', 'tr1', '2026-10-12']);
  assert.equal(r.find((x) => x.type === 'note').label, '牛肉麺は午前中が空いている');
  assert.equal(r.filter((x) => x.type === 'plan')[1].day, 'unscheduled');
  assert.deepEqual(searchAll(data, '台北').map((x) => x.type), ['trip']); // 旅の名前で見つかる（店などは場所の名前では探さない）
  assert.deepEqual(searchAll(data, '   '), []);
  assert.equal(searchAll({ places: [{ id: 'p', spots: Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, name: '店' })) }] }, '店', { max: 30 }).length, 30);
});

test('画面：Places の上に検索、店のタブに検索と種類のチップ、＋ に Quick memo（Memo に入る。AI なし）', () => {
  const places = read('js/views/places.js');
  assert.match(places, /name="appSearch"[^>]*placeholder="店・メモ・予定を探す"/);
  assert.match(places, /setSeenDay\(a\.dataset\.trip, a\.dataset\.day\)/);
  assert.match(places, /setSpotQuery\(a\.dataset\.place, a\.dataset\.spotName\)/);
  const place = read('js/views/place.js');
  assert.match(place, /name="spotQuery"[^>]*placeholder="店の名前・メモで探す"/);
  assert.match(place, /data-spot-kind="\$\{k\}" aria-pressed="\$\{kind === k\}" aria-label="\$\{SPOT_KIND_LABELS\[k\]\}"/);
  const add = read('js/views/addHub.js');
  assert.match(add, /<span class="field-label">Quick memo<\/span>/);
  assert.match(add, /\(t\.memos \|\|= \[\]\)\.push\(\{ id: newId\(\), text, attachments: \[\] \}\)/);
  assert.doesNotMatch(add.slice(add.indexOf('Quick memo：'), add.indexOf("data-act=\"shot\"]')")), /callAI|offlineBlocked/);
});
