import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  maskForAI, stripPersonal, aiContext, screenshotDrafts, draftToItem, draftToCandidate, applyScreenshotDrafts, priceToYen,
  memoDrafts, applyMemoDrafts, savedSummary, aiErrorMessage, errorCodeOf, dayFor, MASK,
} from '../js/logic/ai.js';
import { normalize, toBackup, KEYS } from '../js/store.js';
import { addTargets } from '../js/views/addHub.js';

const trip = () => ({ id: 't', title: '沖縄', startDate: '2026-11-03', endDate: '2026-11-05', placeIds: ['p'], days: [], unscheduled: [], candidates: [], todos: [], memos: [], packingExtras: [], unsortedNotes: [], fxRates: {} });
const settings = { fxRates: { USD: 0.0067, VND: 170 } };
let n = 0;
const makeId = () => `id${++n}`;
function itemsOf(t, dayKey) {
  if (dayKey === 'unscheduled') return t.unscheduled;
  let d = t.days.find((x) => x.date === dayKey);
  if (!d) { d = { date: dayKey, items: [] }; t.days.push(d); }
  return d.items;
}

// ---------- 送る前の伏せ字 ----------
test('maskForAI：メール・電話・カード・予約番号・会員番号・パスポート・生年月日を伏せ字にする', () => {
  const src = [
    '予約番号：ABC123 で確定', 'Booking ref ZXCVBN', 'PNR: ABCDEF', '確認番号 8H2K9Q',
    'mail a.b@example.com', '電話 090-1234-5678', '+81 90 1234 5678', 'card 4111 1111 1111 1111',
    'パスポート番号 TK1234567', 'TK7654321', '会員番号 12345678', 'マイレージ番号: 987654321', '生年月日 1980年1月2日',
  ].join('\n');
  const out = maskForAI(src);
  for (const secret of ['ABC123', 'ZXCVBN', 'ABCDEF', '8H2K9Q', 'a.b@example.com', '1234-5678', '1234 5678', '4111', 'TK1234567', 'TK7654321', '12345678', '987654321', '1980']) {
    assert.ok(!out.includes(secret), `${secret} が残っている`);
  }
  assert.match(out, /予約番号：•••• で確定/);
});

test('maskForAI：旅の大事な情報（便名・日付・時刻・金額・普通の単語）は残す', () => {
  const src = 'JAL 903 羽田→那覇 2026-11-03 08:00 23,000円\nreference book を読む\nAdobe 2026\nホテル 3泊 12000円';
  assert.equal(maskForAI(src), src);
});

test('stripPersonal：AI の結果に入っていた番号は、ことばごと取り除く（伏せ字も残さない）', () => {
  assert.equal(stripPersonal('予約番号：ABC123'), '');
  assert.equal(stripPersonal('確認番号 8H2K9Q / 前日まで無料'), '/ 前日まで無料');
  assert.equal(stripPersonal(`会員番号 ${MASK}`), '');
  assert.equal(stripPersonal('JAL 903'), 'JAL 903');
  assert.equal(stripPersonal('宿の電話 098-123-4567'), '宿の電話 098-123-4567'); // 宿の電話は残す
});

// ---------- 送るもの ----------
test('aiContext：旅の名前・日程・行き先・今日だけ（予約番号などは入れない）', () => {
  const t = { ...trip(), days: [{ date: '2026-11-03', items: [{ booking: { referenceNo: 'SECRET1' } }] }] };
  const c = aiContext(t, [{ id: 'p', name: '那覇' }], '2026-10-12');
  assert.deepEqual(c, { today: '2026-10-12', tripTitle: '沖縄', startDate: '2026-11-03', endDate: '2026-11-05', places: ['那覇'] });
  assert.doesNotMatch(JSON.stringify(c), /SECRET1/);
});

// ---------- A. スクショ取り込み ----------
const flight = {
  kind: 'flight', title: 'JAL 903 羽田 → 那覇', number: 'JL903', from: '羽田', to: '那覇', date: '2026-11-03', time: '08:00', endDate: '', endTime: '10:40',
  price: 23000, currency: 'JPY', miles: null, fareNote: 'セイバー', cancelPolicy: '前日まで無料', payNote: 'カード', provider: 'JAL', url: 'https://www.jal.co.jp/', status: 'booked',
  note: '予約番号 QWE123 をメモ',
};

test('screenshotDrafts：結果を下書きに。旅の日なら Day、外なら日程未定。予約番号は入れない', () => {
  const [d, out] = screenshotDrafts({ bookings: [flight, { ...flight, date: '2026-12-01', status: 'considering' }] }, trip());
  assert.equal(d.mode, 'booked');
  assert.equal(d.day, '2026-11-03');
  assert.equal(d.endTime, '10:40');
  assert.doesNotMatch(JSON.stringify(d), /QWE123/);
  assert.match(d.note, /セイバー/);
  assert.equal(out.day, 'unscheduled');
  assert.equal(out.mode, 'considering');
  assert.equal(dayFor(trip(), ''), 'unscheduled');
});

test('screenshotDrafts：宿はチェックアウトをメモに（終わりの時刻には入れない）', () => {
  const [d] = screenshotDrafts({ bookings: [{ ...flight, kind: 'stay', title: 'ホテルA', from: '', to: '', number: '', date: '2026-11-03', time: '15:00', endDate: '2026-11-05', endTime: '11:00' }] }, trip());
  assert.equal(d.endTime, '');
  assert.match(d.note, /チェックアウト 2026-11-05 11:00/);
});

test('draftToItem：予約済み・検討中の予定と booking。referenceNo はいつも空', () => {
  const [d] = screenshotDrafts({ bookings: [flight] }, trip());
  const it = draftToItem({ ...d, payNote: 'カード番号 4111111111111111' }, trip(), settings, 'x');
  assert.equal(it.status, 'booked');
  assert.equal(it.kind, 'flight');
  assert.equal(it.time, '08:00');
  assert.equal(it.booking.number, 'JL903');
  assert.equal(it.booking.priceYen, 23000);
  assert.equal(it.booking.referenceNo, '');
  assert.equal(it.booking.payNote, '');
  assert.deepEqual(it.attachments, []);
});

test('priceToYen：外貨はレートで円に（もとの金額はメモへ）。レートがなければ円にしない', () => {
  assert.deepEqual(priceToYen({ price: 120, currency: 'USD' }, trip(), settings), { yen: 17910, memo: 'USD 120' });
  const noRate = priceToYen({ price: 100, currency: 'EUR' }, trip(), settings);
  assert.equal(noRate.yen, null);
  assert.match(noRate.memo, /EUR 100（レート未設定/);
  assert.deepEqual(priceToYen({ price: null, currency: 'JPY' }, trip(), settings), { yen: null, memo: '' });
});

test('applyScreenshotDrafts：保存するものだけ。候補は candidates、予定はその日へ', () => {
  const t = trip();
  const drafts = screenshotDrafts({ bookings: [flight, { ...flight, title: 'ANA', status: 'considering' }, { ...flight, title: 'Peach' }] }, t);
  drafts[1].mode = 'candidate';
  drafts[2].include = false;
  const added = applyScreenshotDrafts(t, drafts, settings, makeId, itemsOf);
  assert.equal(added, 2);
  assert.equal(t.days[0].items.length, 1);
  assert.equal(t.candidates.length, 1);
  assert.equal(t.candidates[0].title, 'ANA');
  assert.match(t.candidates[0].detail, /23,000円/);
  assert.doesNotMatch(JSON.stringify(t), /Peach|QWE123/);
});

test('draftToCandidate：日時・区間・料金を detail に', () => {
  const [d] = screenshotDrafts({ bookings: [flight] }, trip());
  const c = draftToCandidate(d, trip(), settings, 'c');
  assert.equal(c.title, 'JAL 903 羽田 → 那覇');
  assert.match(c.detail, /2026-11-03 08:00–10:40/);
  assert.match(c.detail, /羽田 → 那覇/);
});

// ---------- B. メモ貼り付け ----------
const entries = [
  { dest: 'plan', text: '3日目の夜は栄町で飲む', title: '栄町で飲む', date: '2026-11-05', time: '', slot: 'night', kind: 'bar', note: '' },
  { dest: 'booking', text: 'レンタカー 予約番号 RC12345', title: 'レンタカー', date: '2026-11-03', time: '10:00', slot: '', kind: 'car', note: '' },
  { dest: 'packing', text: '日焼け止め', title: '日焼け止め', date: '', time: '', slot: '', kind: '', note: '' },
  { dest: 'todo', text: 'SIMを買う', title: 'SIMを買う', date: '', time: '', slot: '', kind: '', note: '' },
  { dest: 'memo', text: '首里城は工事中らしい', title: '首里城', date: '', time: '', slot: '', kind: '', note: '' },
  { dest: 'unsorted', text: 'なんとなく', title: 'なんとなく', date: '', time: '', slot: '', kind: '', note: '' },
];

test('memoDrafts → applyMemoDrafts：行き先ごとに入れる。保存しないものは入れない', () => {
  const t = trip();
  const drafts = memoDrafts({ entries }, t);
  assert.equal(drafts[0].day, '2026-11-05');
  assert.doesNotMatch(JSON.stringify(drafts), /RC12345/);
  drafts[5].include = false;
  const counts = applyMemoDrafts(t, drafts, makeId, itemsOf);
  assert.deepEqual(counts, { plan: 1, booking: 1, packing: 1, todo: 1, memo: 1, unsorted: 0 });
  const day5 = t.days.find((d) => d.date === '2026-11-05').items[0];
  assert.equal(day5.kind, 'bar');
  assert.equal(day5.slot, 'night');
  assert.equal(day5.note, '3日目の夜は栄町で飲む');
  const car = t.days.find((d) => d.date === '2026-11-03').items[0];
  assert.equal(car.status, 'considering');
  assert.equal(car.time, '10:00');
  assert.equal(car.booking.referenceNo, '');
  assert.equal(t.packingExtras[0].name, '日焼け止め');
  assert.equal(t.todos[0].text, 'SIMを買う');
  assert.equal(t.memos[0].text, '首里城は工事中らしい');
  assert.deepEqual(t.unsortedNotes, []);
  assert.equal(savedSummary(counts), '予定1・予約1・持ち物1・To do1・Memo1を追加しました');
});

test('applyMemoDrafts：行き先を変えたらそこへ。unsorted は Unsorted に', () => {
  const t = trip();
  const drafts = memoDrafts({ entries: [entries[5], entries[2]] }, t);
  drafts[1].dest = 'todo';
  applyMemoDrafts(t, drafts, makeId, itemsOf);
  assert.deepEqual(t.unsortedNotes, ['なんとなく']);
  assert.equal(t.todos[0].text, '日焼け止め');
  assert.equal(t.packingExtras.length, 0);
});

// ---------- うまくいかなかったとき ----------
test('aiErrorMessage：オフライン・上限・合言葉違いはわかりやすい日本語で', () => {
  assert.match(aiErrorMessage('offline'), /インターネットにつながっていません/);
  assert.match(aiErrorMessage('limit', { limit: 20 }), /今日の AI の回数（20回）を使い切りました/);
  assert.match(aiErrorMessage('unauthorized'), /合言葉が違います/);
  assert.match(aiErrorMessage('no_token'), /合言葉を入れてください/);
  assert.match(aiErrorMessage('x', { status: 401 }), /合言葉が違います/);
  assert.equal(errorCodeOf(401, 'unauthorized'), 'unauthorized');
  assert.equal(errorCodeOf(429, 'limit'), 'limit');
  assert.equal(errorCodeOf(502, 'bad_output'), 'bad_output');
  assert.equal(errorCodeOf(503, 'not_configured'), 'not_configured');
  assert.equal(errorCodeOf(500, 'upstream'), 'upstream');
});

// ---------- 合言葉はバックアップに入らない ----------
test('合言葉（tripnote.secret）はバックアップに入らない', () => {
  assert.equal(KEYS.secret, 'tripnote.secret');
  const out = JSON.stringify(toBackup(normalize({ app: 'TripNote', schemaVersion: 1 })));
  assert.doesNotMatch(out, /secret/i);
});

// ---------- 画面のつながり ----------
test('アプリから Worker に送るのは task と input だけ。合言葉はヘッダー', () => {
  const src = readFileSync(new URL('../js/aiClient.js', import.meta.url), 'utf8');
  assert.match(src, /JSON\.stringify\(\{ task, input \}\)/);
  assert.match(src, /'X-TripNote-Token': token/);
  assert.doesNotMatch(src, /model|system/);
  const memo = readFileSync(new URL('../js/views/aiMemo.js', import.meta.url), 'utf8');
  assert.match(memo, /text: maskForAI\(pasted\)/);
});

test('＋ の旅の選び方：次の旅が先頭。行かなかった旅は出さない', () => {
  const trips = [
    { id: 'old', status: 'done', startDate: '2025-01-01', endDate: '2025-01-02' },
    { id: 'next', status: 'booked', startDate: '2026-11-03', endDate: '2026-11-05' },
    { id: 'later', status: 'planning', startDate: '2027-01-03', endDate: '2027-01-05' },
    { id: 'idea', status: 'idea', startDate: null, endDate: null },
    { id: 'no', status: 'cancelled', startDate: '2026-12-01', endDate: '2026-12-02' },
  ];
  assert.deepEqual(addTargets(trips, '2026-10-12').map((t) => t.id), ['next', 'later', 'idea', 'old']);
});
