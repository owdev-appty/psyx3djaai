// v1.6.0：スクショのお店・観光地を日程未定の予定に（Spot にも入れる）、Spots の絞り込みのお知らせと「すべて表示」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { screenshotSpotDrafts, applyScreenshotSpotDrafts } from '../js/logic/ai.js';
import { spotFilterNote } from '../js/logic/search.js';
import { VERSION } from '../js/version.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
let n = 0;
const makeId = () => `id${++n}`;
const itemsOf = (trip, key) => (key === 'unscheduled' ? (trip.unscheduled ||= []) : trip.days.find((d) => d.date === key).items);

const data = () => ({
  places: [{ id: 'k', name: '高知市', spots: [{ id: 'sp1', name: '宝永', kind: 'food', status: 'want', note: '餃子' }] }, { id: 'o', name: '大阪', spots: [] }],
  trips: [{ id: 't', title: '高知', placeIds: ['k'], days: [{ date: '2027-05-20', items: [{ id: 'i0', title: 'ひろめ市場', kind: 'food' }] }], unscheduled: [] }],
});

const result = {
  bookings: [],
  spots: [
    { name: 'Kochi Beer Laboratory', kind: 'bar', note: '追手筋・55番街\n立ち飲み\n現金がおすすめ', url: 'https://example.com/kbl' },
    { name: 'ひろめ市場', kind: 'food', note: '', url: '' },               // もう予定にある
    { name: 'kochi beer laboratory', kind: 'bar', note: 'x', url: '' },  // 同じ名前は1回
    { name: '宝永', kind: 'izakaya', note: '移転 予約番号 ABC123', url: 'javascript:alert(1)' },
    { name: ' ', kind: 'food', note: '', url: '' },
  ],
  message: '',
};

test('お店の下書き：同じ名前は1回、もう予定にあるものはチェックなし、Spot にも入れる は最初からオン（旅の場所）', () => {
  const d = data();
  const drafts = screenshotSpotDrafts(result, d.trips[0], d.places);
  assert.deepEqual(drafts.map((x) => x.title), ['Kochi Beer Laboratory', 'ひろめ市場', '宝永']);
  assert.deepEqual(drafts.map((x) => x.include), [true, false, true]);
  assert.equal(drafts[1].dup, true);
  assert.equal(drafts[0].kind, 'bar');
  assert.equal(drafts[2].kind, 'food');      // 知らない種類は food
  assert.equal(drafts[2].url, '');           // URL でないものは空
  assert.doesNotMatch(drafts[2].note, /ABC123/); // 予約番号は取り除く
  assert.ok(drafts.every((x) => x.toPlace && x.placeId === 'k'));
  // 旅に場所がなければ Spot にも入れる はなし
  const noPlace = screenshotSpotDrafts(result, { ...d.trips[0], placeIds: [] }, d.places);
  assert.ok(noPlace.every((x) => !x.toPlace && !x.placeId));
  assert.deepEqual(screenshotSpotDrafts({ bookings: [] }, d.trips[0], d.places), []);
});

test('お店の保存：日程未定の予定に（Title・Kind・Note・Link）。Spot にも入れるなら Spots に入れてつなぐ（同じ名前の Spot は Note を足す）', () => {
  const d = data();
  const drafts = screenshotSpotDrafts(result, d.trips[0], d.places);
  drafts[2].toPlace = true;
  const r = applyScreenshotSpotDrafts(d, 't', drafts, makeId, itemsOf);
  assert.deepEqual({ added: r.added, spots: r.spots, placeIds: r.placeIds }, { added: 2, spots: 2, placeIds: ['k'] });
  const un = d.trips[0].unscheduled;
  assert.deepEqual(un.map((x) => [x.title, x.kind, x.status, x.time, x.slot]), [['Kochi Beer Laboratory', 'bar', null, null, null], ['宝永', 'food', null, null, null]]);
  assert.equal(un[0].note, '追手筋・55番街\n立ち飲み\n現金がおすすめ');
  assert.equal(un[0].url, 'https://example.com/kbl');
  const spots = d.places[0].spots;
  const kbl = spots.find((s) => s.name === 'Kochi Beer Laboratory');
  assert.equal(un[0].spotId, kbl.id);
  assert.equal(kbl.kind, 'bar');
  assert.match(kbl.note, /立ち飲み/);
  assert.equal(un[1].spotId, 'sp1');          // 前からある宝永につなぐ
  assert.match(spots[0].note, /餃子\n移転/);
  // Spot にも入れる を外したら Spots には入れない
  const d2 = data();
  const r2 = applyScreenshotSpotDrafts(d2, 't', [{ include: true, title: 'A', kind: 'bar', note: '', url: '', toPlace: false, placeId: 'k' }], makeId, itemsOf);
  assert.deepEqual([r2.added, r2.spots], [1, 0]);
  assert.equal(d2.places[0].spots.length, 1);
  assert.equal(d2.trips[0].unscheduled[0].spotId, null);
});

test('Spots の絞り込みのお知らせ：絞っているときだけ。隠れている数（検索の言葉は数えない）', () => {
  const spots = [{ kind: 'food', status: 'want' }, { kind: 'bar', status: 'visited' }, { kind: 'food', status: 'visited' }, { kind: 'shop', status: 'want' }];
  const labels = { kinds: { food: 'Food', bar: 'Bar' }, statuses: { want: 'Want to go', visited: 'Visited' } };
  assert.equal(spotFilterNote(spots, {}, labels), '');
  assert.equal(spotFilterNote(spots, { kind: 'food' }, labels), 'Food だけ表示中（ほか2件）');
  assert.equal(spotFilterNote(spots, { kind: 'food', status: 'visited' }, labels), 'Food · Visited だけ表示中（ほか3件）');
  assert.equal(spotFilterNote([{ kind: 'bar', status: 'want' }], { kind: 'bar' }, labels), 'Bar だけ表示中');
});

test('画面：スクショの確認画面にお店・観光地、Spots の「すべて表示」、予定から Spot に入れたら絞り込みを外す、版と SW', () => {
  const shot = read('js/views/aiScreenshot.js');
  assert.match(shot, /screenshotSpotDrafts\(result, t, store\.data\.places\)/);
  assert.match(shot, /Spot にも入れる/);
  assert.match(shot, /もう予定にあります/);
  assert.match(shot, /spotRes\.placeIds\.forEach\(clearSpotFilters\)/);
  assert.match(shot, /予約やお店の内容を読み取れませんでした/);
  const place = read('js/views/place.js');
  assert.match(place, /data-act="clear-spot-filters">すべて表示</);
  assert.match(place, /case 'clear-spot-filters':\s*clearSpotFilters\(placeId\)/);
  assert.match(read('js/views/itemForm.js'), /if \(added\?\.target === 'spot'\) clearSpotFilters\(toPlaceId\)/);
  assert.equal(VERSION, '1.6.0');
  assert.match(read('sw.js'), /VERSION = '1\.6\.0'/);
});
