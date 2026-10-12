// レビュー（2026-10-12）で直したところのテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEYS, createStore, normalize, toBackup } from '../js/store.js';
import { safeUrl, urlForSave } from '../js/logic/url.js';
import { mapUrl } from '../js/logic/places.js';
import { memoDrafts, screenshotDrafts, draftToItem, draftToCandidate } from '../js/logic/ai.js';
import { needsBackupNudge, lastExportText, persistText } from '../js/logic/backup.js';
import { isSubmitEnter } from '../js/ui/ime.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// localStorage の代わり。quotaChars を超えると QuotaExceededError
function fakeStorage(quotaChars = Infinity) {
  const m = new Map();
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      const before = m.get(k);
      m.set(k, String(v));
      if (size() > quotaChars) {
        if (before === undefined) m.delete(k); else m.set(k, before);
        const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      }
    },
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

const backup = (trips) => ({ app: 'TripNote', schemaVersion: 1, trips, places: [], tags: [], packingItems: [], settings: {} });

// ---------- 中1：復元で保存に失敗したら、前の状態のまま ----------
test('復元：prev は残せたがデータの保存に失敗したら、画面のデータも保存先も復元前のまま。prev も消す', () => {
  const s = fakeStorage();
  const st = createStore(s, { saveDelayMs: 0 });
  st.load();
  st.update((d) => { d.trips.push({ id: 'old', title: '前' }); });
  st.flush();
  const savedBefore = s.getItem(KEYS.data);
  // 今のデータ＋prev は入るが、大きな復元データは入らない容量にする
  const quota = [...s._map].reduce((n, [k, v]) => n + k.length + v.length, 0) * 2 + 200;
  const tight = fakeStorage(quota);
  for (const [k, v] of s._map) tight.setItem(k, v);
  const st2 = createStore(tight, { saveDelayMs: 0 });
  st2.load();
  const events = [];
  st2.subscribe((r) => events.push(r));
  const r = st2.replaceAll(backup([{ id: 'new', title: 'x'.repeat(quota) }]));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /復元する前のまま/);
  assert.deepEqual(st2.data.trips.map((t) => t.id), ['old']);
  assert.equal(tight.getItem(KEYS.data), savedBefore);
  assert.equal(st2.hasUndo(), false);
  assert.ok(!events.includes('replaced'));
  // そのまま編集しても、前のデータに足される
  st2.update((d) => { d.trips.push({ id: 'more' }); });
  st2.flush();
  assert.deepEqual(JSON.parse(tight.getItem(KEYS.data)).trips.map((t) => t.id), ['old', 'more']);
});

// ---------- 低10：元に戻すときに容量が足りない ----------
test('Undo restore：容量が足りなければ例外にせず full を返し、今のデータのまま', () => {
  const s = fakeStorage();
  const st = createStore(s, { saveDelayMs: 0 });
  st.load();
  st.update((d) => { d.trips.push({ id: 'big', title: 'x'.repeat(3000) }); });
  st.flush();
  assert.equal(st.replaceAll(backup([{ id: 'small' }])).ok, true);
  // prev（大きい）を data に書くと入らない容量にする
  const used = [...s._map].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const tight = fakeStorage(used + 100);
  for (const [k, v] of s._map) tight.setItem(k, v);
  const st2 = createStore(tight, { saveDelayMs: 0 });
  st2.load();
  assert.equal(st2.undoRestore(), 'full');
  assert.deepEqual(st2.data.trips.map((t) => t.id), ['small']);
  assert.equal(st2.hasUndo(), true);
  assert.equal(createStore(fakeStorage()).undoRestore(), 'none');
});

// ---------- 中3：リンクは http / https だけ ----------
test('safeUrl：http / https だけ。https:// がなければ付ける。javascript: などは空', () => {
  assert.equal(safeUrl('https://www.jal.co.jp/'), 'https://www.jal.co.jp/');
  assert.equal(safeUrl('  http://example.com/a?b=1 '), 'http://example.com/a?b=1');
  assert.equal(safeUrl('www.example.com/path'), 'https://www.example.com/path');
  assert.equal(safeUrl('example.com'), 'https://example.com/');
  for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', 'tel:0312345678', 'mailto:a@b.c', 'ふつうの文', '/relative/path', 'https://', '']) {
    assert.equal(safeUrl(bad), '', bad);
  }
  assert.equal(urlForSave(''), '');
  assert.equal(urlForSave('   '), '');
  assert.equal(urlForSave('javascript:alert(1)'), null);
  assert.equal(urlForSave('example.com'), 'https://example.com/');
});

test('mapUrl：店の URL が使えないものなら、地図の検索にする', () => {
  assert.match(mapUrl({ name: 'A店', url: 'javascript:alert(1)' }, { name: '那覇' }), /^https:\/\/www\.google\.com\/maps\/search\//);
  assert.equal(mapUrl({ name: 'A店', url: 'https://a.example/' }, {}), 'https://a.example/');
});

test('リンクを表示する所は、すべて safeUrl を通す。保存する所は urlForSave で確かめる', () => {
  for (const f of ['js/views/place.js', 'js/views/tripBookings.js', 'js/views/tripPlan.js']) {
    const src = read(f);
    for (const m of src.matchAll(/href="\$\{esc\(([^)]*\)?)\)\}"/g)) {
      assert.match(m[1], /^(safeUrl\(|url$|mapUrl\(|tel$|telHref\()/, `${f}：href="\${esc(${m[1]})}"`);
    }
  }
  assert.match(read('js/ui/formSheet.js'), /urlForSave\(values\[f\.name\]\)/);
  assert.match(read('js/views/itemForm.js'), /fields\.url = urlForSave\(/);
  assert.match(read('js/views/tripBookings.js'), /const url = urlForSave\(get\('url'\)\)/);
  assert.match(read('js/views/aiScreenshot.js'), /urlForSave\(d\.url\) === null/);
});

test('AI の結果・確認画面の URL も、http / https だけ保存する', () => {
  const [d] = screenshotDrafts({ bookings: [{ kind: 'flight', title: 'A', url: 'javascript:alert(1)', status: 'booked' }] }, { days: [] });
  assert.equal(d.url, '');
  const it = draftToItem({ ...d, url: 'javascript:alert(1)' }, {}, {}, 'i');
  assert.equal(it.url, '');
  assert.equal(draftToCandidate({ ...d, url: 'example.com' }, {}, {}, 'c').url, 'https://example.com/');
});

// ---------- 低6：形の違う AI の結果 ----------
test('memoDrafts / screenshotDrafts：形の違う結果でも落ちない', () => {
  const t = { startDate: '2026-11-03', endDate: '2026-11-05' };
  assert.deepEqual(memoDrafts({ entries: [{ dest: 'todo', title: '' }, null, 5, { dest: 'memo', text: 7, title: 'タイトル' }] }, t).map((d) => [d.dest, d.title, d.text]), [['memo', 'タイトル', 'タイトル']]);
  assert.deepEqual(memoDrafts({ entries: 'x' }, t), []);
  assert.deepEqual(memoDrafts(null, t), []);
  assert.deepEqual(screenshotDrafts({ bookings: [null, 'x'] }, t), []);
  assert.deepEqual(screenshotDrafts({ bookings: {} }, t), []);
});

// ---------- 低7・低8 ----------
test('AI の画面：残り回数は esc、AI からのメッセージは個人情報を取り除いてから表示', () => {
  const src = read('js/views/aiScreenshot.js');
  assert.match(src, /今日の残り \$\{esc\(u\.remaining\)\}回（1日\$\{esc\(u\.limit\)\}回まで）/);
  assert.match(src, /confirmHtml\(stripPersonal\(result\.message/);
});

// ---------- 並び順・項目が、保存→読み込み・バックアップ→復元で変わらない ----------
test('保存→読み込み、バックアップ→復元で、並び順と項目が変わらない', () => {
  const raw = {
    app: 'TripNote', schemaVersion: 1,
    settings: { fxRates: { USD: 0.0067, VND: 170 }, ai: { enabled: false } },
    tags: [{ id: 'g2', name: '冬' }, { id: 'g1', name: '夏' }],
    packingItems: [{ id: 'p3', name: 'C', tagIds: ['g1'] }, { id: 'p1', name: 'A', tagIds: [] }, { id: 'p2', name: 'B', tagIds: [], mustHave: true }],
    places: [{
      id: 'pl', name: '那覇',
      notesToSelf: [{ id: 'n2', text: '2' }, { id: 'n1', text: '1' }],
      transportTips: [{ id: 't2', title: 'b' }, { id: 't1', title: 'a' }],
      stays: [{ id: 's2', name: '宿B' }, { id: 's1', name: '宿A' }],
      spots: [{ id: 'sp3', name: 'C', kind: 'food', status: 'want' }, { id: 'sp1', name: 'A', kind: 'bar', status: 'again' }],
      areas: [], links: [{ title: 'L', url: 'https://l.example/' }],
    }],
    trips: [{
      id: 'tr', title: '沖縄', placeIds: ['pl'], startDate: '2026-11-03', endDate: '2026-11-05', fxRates: { USD: 0.007 },
      days: [{ date: '2026-11-03', dayNotes: 'メモ', items: [{ id: 'i2', title: 'B' }, { id: 'i1', title: 'A', attachments: [{ id: 'img1', w: 1, h: 1 }] }] }],
      memos: [{ id: 'm2', text: '後', attachments: [{ id: 'img3' }, { id: 'img2' }] }, { id: 'm1', text: '先', attachments: [] }],
      todos: [{ id: 'td2', text: 'b', done: true }, { id: 'td1', text: 'a', done: false }],
      packingExtras: [{ id: 'x2', name: 'b', checked: true }, { id: 'x1', name: 'a', checked: false }],
      packingNote: 'タオルは宿にある', lookBack: '楽しかった', lookbackAnswers: { sp1: 'again' },
      packing: { tagIds: ['g1'], checked: { p3: true }, feedback: { p1: 'unused' } },
      candidates: [{ id: 'c2', title: 'b' }, { id: 'c1', title: 'a' }], unsortedNotes: ['z', 'y'],
    }],
  };
  const s = fakeStorage();
  const st = createStore(s, { saveDelayMs: 0 });
  st.load();
  assert.equal(st.replaceAll(raw).ok, true);
  const again = createStore(s);
  again.load();
  const viaBackup = normalize(JSON.parse(JSON.stringify(toBackup(again.data))));
  for (const d of [again.data, viaBackup]) {
    const t = d.trips[0];
    const p = d.places[0];
    assert.deepEqual(d.tags.map((x) => x.id), ['g2', 'g1']);
    assert.deepEqual(d.packingItems.map((x) => x.id), ['p3', 'p1', 'p2']);
    assert.deepEqual(p.notesToSelf.map((x) => x.id), ['n2', 'n1']);
    assert.deepEqual(p.transportTips.map((x) => x.id), ['t2', 't1']);
    assert.deepEqual(p.stays.map((x) => x.id), ['s2', 's1']);
    assert.deepEqual(p.spots.map((x) => x.id), ['sp3', 'sp1']);
    assert.deepEqual(t.days[0].items.map((x) => x.id), ['i2', 'i1']);
    assert.deepEqual(t.memos.map((x) => x.id), ['m2', 'm1']);
    assert.deepEqual(t.memos[0].attachments.map((x) => x.id), ['img3', 'img2']);
    assert.deepEqual(t.todos.map((x) => x.id), ['td2', 'td1']);
    assert.deepEqual(t.packingExtras.map((x) => [x.id, x.checked]), [['x2', true], ['x1', false]]);
    assert.deepEqual(t.candidates.map((x) => x.id), ['c2', 'c1']);
    assert.deepEqual(t.unsortedNotes, ['z', 'y']);
    assert.equal(t.packingNote, 'タオルは宿にある');
    assert.equal(t.lookBack, '楽しかった');
    assert.deepEqual(t.lookbackAnswers, { sp1: 'again' });
    assert.deepEqual(t.fxRates, { USD: 0.007 });
    assert.deepEqual(t.packing.feedback, { p1: 'unused' }); // 以前のデータは消さずに残す
    assert.equal(t.days[0].dayNotes, 'メモ');
    assert.deepEqual(d.settings.fxRates, { USD: 0.0067, VND: 170 });
    assert.equal(d.settings.ai.enabled, false);
  }
});

// ---------- 追加：バックアップしましょう ----------
test('needsBackupNudge：7日以上たっていて、その後にデータが変わっていたら出す。×の日は出さない', () => {
  const now = new Date(2026, 9, 12, 12);
  const today = '2026-10-12';
  const ago = (days) => new Date(2026, 9, 12 - days, 9).toISOString();
  assert.equal(needsBackupNudge({ lastExportAt: ago(8), changedAt: ago(1), today, now }), true);
  assert.equal(needsBackupNudge({ lastExportAt: ago(7), changedAt: ago(1), today, now }), true);
  assert.equal(needsBackupNudge({ lastExportAt: ago(6), changedAt: ago(1), today, now }), false); // まだ7日たっていない
  assert.equal(needsBackupNudge({ lastExportAt: ago(8), changedAt: ago(9), today, now }), false); // その後は変わっていない
  assert.equal(needsBackupNudge({ lastExportAt: ago(8), changedAt: null, today, now }), false);
  assert.equal(needsBackupNudge({ lastExportAt: null, changedAt: ago(0), today, now }), true); // 一度も書き出していない
  assert.equal(needsBackupNudge({ lastExportAt: ago(8), changedAt: ago(1), hiddenOn: today, today, now }), false); // ×を押した日
  assert.equal(needsBackupNudge({ lastExportAt: ago(8), changedAt: ago(1), hiddenOn: '2026-10-11', today, now }), true); // 次の日はまた出す
  assert.equal(lastExportText(ago(12), now), '前回 12日前');
  assert.equal(lastExportText(null, now), 'まだ書き出していません');
});

test('書き出した日時・変わった日時・×の日は tripnote.ui に（バックアップに入らない）', () => {
  const ui = read('js/uiState.js');
  for (const k of ['lastExportAt', 'dataChangedAt', 'backupNudgeHiddenOn']) assert.match(ui, new RegExp(`setUi\\('${k}'`));
  assert.match(read('js/backupActions.js'), /setLastExportAt\(now\.toISOString\(\)\)/);
  assert.doesNotMatch(JSON.stringify(toBackup(normalize({ app: 'TripNote', schemaVersion: 1 }))), /lastExportAt|dataChangedAt|backupNudgeHiddenOn/);
});

// ---------- 追加：保存の保護 ----------
test('persistText：保存の保護の表示', () => {
  assert.match(persistText('granted'), /オン/);
  assert.match(persistText('denied'), /オフ/);
  assert.match(persistText('unsupported'), /使えません/);
  assert.match(read('js/app.js'), /requestPersist\(\);/);
});

// ---------- 低12：日本語の変換を確定する Enter ----------
test('isSubmitEnter：変換中・確定の Enter（keyCode 229）では追加しない', () => {
  assert.equal(isSubmitEnter({ key: 'Enter', isComposing: false, keyCode: 13 }), true);
  assert.equal(isSubmitEnter({ key: 'Enter', isComposing: true, keyCode: 13 }), false);
  assert.equal(isSubmitEnter({ key: 'Enter', isComposing: false, keyCode: 229 }), false);
  assert.equal(isSubmitEnter({ key: 'a', isComposing: false, keyCode: 65 }), false);
  for (const f of ['js/views/tripPacking.js', 'js/views/tripNotes.js', 'js/views/packingForm.js']) {
    assert.doesNotMatch(read(f), /e\.key === 'Enter'/, f);
  }
});

// ---------- 低13：シートの左右の safe-area ----------
test('シートの左右に safe-area の余白（横向きでノッチに重ならない）', () => {
  const css = read('css/app.css');
  assert.match(css, /\.sheet-body \{[^}]*calc\(var\(--safe-right\) \+ 16px\)[^}]*calc\(var\(--safe-left\) \+ 16px\)/);
  assert.match(css, /\.sheet-head \{[^}]*calc\(var\(--safe-left\) \+ 8px\)/);
});
