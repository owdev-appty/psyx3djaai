import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KEYS, emptyData, normalize, validateBackup, summarize, summaryText, toBackup,
  backupFileName, createStore, storageBytes, usageLevel, STORAGE_LIMIT_BYTES, newId,
} from '../js/store.js';

const sample = () => JSON.parse(readFileSync(new URL('./fixtures/sample.json', import.meta.url), 'utf8'));

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

test('newId: 12文字の英小文字と数字', () => {
  const id = newId();
  assert.match(id, /^[a-z0-9]{12}$/);
  assert.notEqual(newId(), id);
});

test('normalize: 足りない項目・null を補い、知らない項目と既存の id は残す', () => {
  const d = normalize(sample());
  assert.deepEqual(d.places[0].transportTips, []);
  assert.equal(d.places[0].extraField, '残す');
  assert.equal(d.places[0].id, 'pl1');
  assert.match(d.places[0].areas[0].id, /^[a-z0-9]{12}$/); // id がなかったものには付ける
  assert.deepEqual(d.packingItems[1].tagIds, []);
  assert.equal(d.packingItems[1].mustHave, false);
  const t = d.trips[0];
  assert.deepEqual(t.unscheduled, []);
  assert.deepEqual(t.packing, { tagIds: [], checked: {}, skipped: {}, feedback: {} });
  assert.match(t.days[0].items[1].id, /^[a-z0-9]{12}$/);
  assert.equal(t.days[0].items[0].booking.number, 'XX000');
  assert.deepEqual(t.unsortedNotes, ['架空の分類できないメモ']);
  assert.equal(d.settings.fxRates.VND, 170);
});

test('normalize: 空や壊れた形でも動く', () => {
  assert.deepEqual(normalize(null), emptyData());
  const d = normalize({ settings: null, trips: [null, 3, { title: 'x', days: null }] });
  assert.equal(d.trips.length, 1);
  assert.deepEqual(d.trips[0].days, []);
  assert.equal(d.settings.ai.enabled, true);
});

test('validateBackup: 正しい形', () => {
  assert.deepEqual(validateBackup(sample()), { ok: true, errors: [] });
});

test('validateBackup: 違う形は理由つきで NG', () => {
  assert.equal(validateBackup('x').ok, false);
  assert.equal(validateBackup([]).ok, false);
  const s = sample();
  assert.equal(validateBackup({ ...s, app: 'Other' }).ok, false);
  assert.equal(validateBackup({ ...s, schemaVersion: 2 }).ok, false);
  assert.equal(validateBackup({ ...s, schemaVersion: '1' }).ok, false);
  const { trips, ...noTrips } = s;
  assert.ok(validateBackup(noTrips).errors.includes('trips がありません'));
  assert.equal(validateBackup({ ...s, places: [1] }).ok, false);
});

test('summarize / summaryText', () => {
  assert.deepEqual(summarize(sample()), { trips: 1, places: 1, packingItems: 2 });
  assert.equal(summaryText(sample()), '旅1件・場所1件・持ち物2件');
});

test('toBackup / backupFileName', () => {
  const now = new Date(2026, 9, 11, 9, 0);
  const b = toBackup(normalize(sample()), now);
  assert.equal(b.app, 'TripNote');
  assert.equal(b.schemaVersion, 1);
  assert.equal(b.source, 'backup');
  assert.equal(b.exportedAt, now.toISOString());
  assert.equal(backupFileName(now), 'tripnote-backup-2026-10-11.json');
});

test('ストア：何もないときは空のデータ', () => {
  const st = createStore(fakeStorage());
  st.load();
  assert.equal(st.status, 'ok');
  assert.deepEqual(st.data, emptyData());
});

test('ストア：保存して読み直すと同じ', async () => {
  const s = fakeStorage();
  const st = createStore(s, { saveDelayMs: 0 });
  st.load();
  st.update((d) => { d.trips.push({ id: 'a', title: 'テスト' }); });
  assert.equal(st.saveState, 'pending');
  assert.equal(st.flush(), true);
  const st2 = createStore(s);
  st2.load();
  assert.equal(st2.data.trips[0].title, 'テスト');
  assert.deepEqual(st2.data.trips[0].days, []);
});

test('ストア：読めないデータは上書きしない', () => {
  const s = fakeStorage();
  s.setItem(KEYS.data, '{壊れた');
  const st = createStore(s, { saveDelayMs: 0 });
  st.load();
  assert.equal(st.status, 'broken');
  assert.equal(st.brokenRaw, '{壊れた');
  st.update((d) => { d.trips.push({}); });
  st.flush();
  assert.equal(s.getItem(KEYS.data), '{壊れた');
});

test('ストア：復元は全部置き換え、直前のデータを prev に残し、取り消せる', () => {
  const s = fakeStorage();
  const st = createStore(s, { saveDelayMs: 0 });
  st.load();
  st.update((d) => { d.trips.push({ id: 'old', title: '前のデータ' }); });
  st.flush();
  const r = st.replaceAll(sample());
  assert.deepEqual(r, { ok: true, undo: 'kept' });
  assert.equal(st.data.trips[0].id, 'tr1');
  assert.equal(st.hasUndo(), true);
  assert.equal(st.undoRestore(), true);
  assert.equal(st.data.trips[0].id, 'old');
  assert.equal(st.hasUndo(), false);
});

test('ストア：保存されたデータがなければ undo は none', () => {
  const st = createStore(fakeStorage());
  st.load();
  assert.equal(st.hasSavedData(), false);
  assert.deepEqual(st.replaceAll(sample()), { ok: true, undo: 'none' });
  assert.equal(st.hasUndo(), false);
  assert.equal(st.hasSavedData(), true);
});

test('ストア：容量が足りず prev を残せなければ undo は failed（復元はする）', () => {
  const s = fakeStorage(8000); // 古いデータ約5千字 → 2つ目は入らないが、新しいデータ（約3千字）は入る
  const st = createStore(s, { saveDelayMs: 0 });
  st.load();
  st.update((d) => { d.trips.push({ id: 'old', title: 'x'.repeat(5000) }); });
  st.flush();
  const r = st.replaceAll(sample());
  assert.equal(r.ok, true);
  assert.equal(r.undo, 'failed');
  assert.equal(st.data.trips[0].id, 'tr1');
});

test('ストア：形の違うファイルでは何も変えない', () => {
  const s = fakeStorage();
  const st = createStore(s);
  st.load();
  const r = st.replaceAll({ app: 'Other' });
  assert.equal(r.ok, false);
  assert.equal(s.getItem(KEYS.data), null);
  assert.equal(s.getItem(KEYS.prev), null);
});

test('ストア：読めなかったデータも、復元の前に prev へ残す', () => {
  const s = fakeStorage();
  s.setItem(KEYS.data, '{壊れた');
  const st = createStore(s);
  st.load();
  assert.equal(st.replaceAll(sample()).ok, true);
  assert.equal(s.getItem(KEYS.prev), '{壊れた');
});

test('ストア：容量がいっぱいなら saveState は full、画面のデータは残る', () => {
  const s = fakeStorage(300);
  const st = createStore(s, { saveDelayMs: 0 });
  st.load();
  st.update((d) => { d.trips.push({ id: 'big', title: 'x'.repeat(500) }); });
  assert.equal(st.flush(), false);
  assert.equal(st.saveState, 'full');
  assert.equal(st.data.trips[0].id, 'big');
});

test('バックアップに合言葉・画面の状態・復元前のデータは入らない', () => {
  const s = fakeStorage();
  s.setItem(KEYS.secret, 'SECRET-VALUE');
  s.setItem(KEYS.ui, '{"tab":"plan"}');
  s.setItem(KEYS.prev, '{"prev":true}');
  const st = createStore(s);
  st.load();
  st.replaceAll(sample());
  const json = st.backupJSON();
  assert.ok(!json.includes('SECRET-VALUE'));
  assert.ok(!json.includes('"tab"'));
  assert.ok(!json.includes('"prev"'));
  assert.deepEqual(Object.keys(JSON.parse(json)).sort(),
    ['app', 'exportedAt', 'packingItems', 'places', 'schemaVersion', 'settings', 'source', 'tags', 'trips']);
});

test('markBackedUp: lastBackupAt を更新して保存', () => {
  const s = fakeStorage();
  const st = createStore(s);
  st.load();
  const now = new Date('2026-10-11T00:00:00Z');
  st.markBackedUp(now);
  assert.equal(JSON.parse(s.getItem(KEYS.data)).settings.lastBackupAt, '2026-10-11T00:00:00.000Z');
});

test('容量：文字数×2 で数え、80% で warn、95% で danger', () => {
  const s = fakeStorage();
  s.setItem('ab', 'cdef');
  assert.equal(storageBytes(s), 12);
  assert.equal(usageLevel(0.5 * STORAGE_LIMIT_BYTES), 'ok');
  assert.equal(usageLevel(0.8 * STORAGE_LIMIT_BYTES), 'warn');
  assert.equal(usageLevel(0.95 * STORAGE_LIMIT_BYTES), 'danger');
});

test('ストア：通知の理由（入力中は change、復元は replaced）', () => {
  const st = createStore(fakeStorage(), { saveDelayMs: 0 });
  st.load();
  const seen = [];
  st.subscribe((r) => seen.push(r));
  st.update((d) => { d.tags.push({ id: 't', name: 'x' }); });
  st.flush();
  st.replaceAll(sample());
  assert.deepEqual(seen, ['change', 'saved', 'saved', 'replaced']);
});
