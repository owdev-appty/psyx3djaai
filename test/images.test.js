import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitSize, attachmentIds, keptImageIds, orphanIds, validateImagesSection, formatSize, MAX_IMAGES_PER_ITEM, MAX_IMAGES_PER_MEMO } from '../js/logic/images.js';
import { normalize, validateBackup, toBackup } from '../js/store.js';

test('fitSize：長い辺を縮める。小さい画像は大きくしない', () => {
  assert.deepEqual(fitSize(1170, 2532, 1600), { w: 739, h: 1600 });
  assert.deepEqual(fitSize(4032, 3024, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(fitSize(800, 600, 1600), { w: 800, h: 600 });
  assert.deepEqual(fitSize(0, 600, 1600), { w: 0, h: 0 });
});

test('1つの予定に4枚まで', () => {
  assert.equal(MAX_IMAGES_PER_ITEM, 4);
});

const data = {
  trips: [
    { days: [{ items: [{ attachments: [{ id: 'a' }, { id: 'b' }] }, { attachments: [] }] }], unscheduled: [{ attachments: [{ id: 'c' }] }] },
    { days: [{ items: [{}] }] },
  ],
};

test('attachmentIds / orphanIds', () => {
  assert.deepEqual([...attachmentIds(data)].sort(), ['a', 'b', 'c']);
  assert.deepEqual(orphanIds(['a', 'x', 'c', 'y'], attachmentIds(data)), ['x', 'y']);
});

test('validateImagesSection と validateBackup', () => {
  assert.deepEqual(validateImagesSection(undefined), []);
  assert.deepEqual(validateImagesSection([{ id: 'a', full: 'AAA', thumb: 'BB' }]), []);
  assert.equal(validateImagesSection('x').length, 1);
  assert.equal(validateImagesSection([{ id: 'a' }]).length, 1);
  const base = { app: 'TripNote', schemaVersion: 1, trips: [], places: [], packingItems: [] };
  assert.equal(validateBackup({ ...base, images: [{ id: 'a', full: 'AAA' }] }).ok, true);
  assert.equal(validateBackup({ ...base, images: [{ id: 1 }] }).ok, false);
});

test('normalize：予定の attachments をそろえ、バックアップの images はデータに入れない', () => {
  const d = normalize({ app: 'TripNote', schemaVersion: 1, images: [{ id: 'a', full: 'AAA' }], trips: [{ id: 't', days: [{ date: '2026-01-01', items: [{ id: 'i', attachments: [{ id: 'a', w: 1, h: 1 }, null, { w: 1 }] }, { id: 'j' }] }] }] });
  assert.equal('images' in d, false);
  assert.deepEqual(d.trips[0].days[0].items[0].attachments, [{ id: 'a', w: 1, h: 1 }]);
  assert.deepEqual(d.trips[0].days[0].items[1].attachments, []);
  assert.equal(d.settings.lastBackupWithImagesAt, null);
  assert.equal('images' in toBackup(d), false);
});

test('formatSize', () => {
  assert.equal(formatSize(350 * 1024), '約350KB');
  assert.equal(formatSize(1.2 * 1024 * 1024), '約1.2MB');
});

test('Notes の Memo：画像の id も使われている物に数え、normalize でそろえる', () => {
  const d = normalize({ app: 'TripNote', schemaVersion: 1, trips: [{ id: 't', memos: [
    { id: 'm1', text: 'メモ', attachments: [{ id: 'x', w: 1, h: 1 }, { nope: 1 }] },
    { id: 'm2', attachments: [{ id: 'y' }] },
    { text: 5 },
  ] }, { id: 'u' }] });
  const t = d.trips[0];
  assert.equal(t.memos.length, 3);
  assert.deepEqual(t.memos[0].attachments, [{ id: 'x', w: 1, h: 1 }]);
  assert.equal(t.memos[1].text, '');
  assert.equal(t.memos[2].text, '');
  assert.ok(t.memos[2].id);
  assert.deepEqual(d.trips[1].memos, []);
  assert.deepEqual([...attachmentIds(d)].sort(), ['x', 'y']);
  assert.ok(MAX_IMAGES_PER_MEMO > 1);
});

test('keptImageIds：片付けでは、今のデータと元に戻す用のデータ（prev）の画像を残す', () => {
  const now = { trips: [{ memos: [{ attachments: [{ id: 'm1' }] }], days: [{ items: [{ attachments: [{ id: 'a' }] }] }] }] };
  // 旅を消した後：今のデータにはないが、prev が使っている画像は残す（復元の取り消しで使う）
  const prevRaw = JSON.stringify({ trips: [{ days: [{ items: [{ attachments: [{ id: 'old' }] }] }], memos: [{ attachments: [{ id: 'm-old' }] }] }] });
  assert.deepEqual([...keptImageIds(now, prevRaw)].sort(), ['a', 'm-old', 'm1', 'old']);
  assert.deepEqual(orphanIds(['a', 'm1', 'old', 'm-old', 'gone'], keptImageIds(now, prevRaw)), ['gone']);
  // prev がなければ今のデータだけ
  assert.deepEqual([...keptImageIds(now, null)].sort(), ['a', 'm1']);
  // prev はあるのに読めないとき（読めなかったデータから復元した後など）は null＝片付けない
  assert.equal(keptImageIds(now, '{broken'), null);
});

test('予定・Memo・旅を消したとき、前からある画像はすぐ消さない（片付けに任せる）', () => {
  const read = (f) => readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
  assert.doesNotMatch(read('views/tripForm.js'), /deleteImages/);
  for (const f of ['views/itemForm.js', 'views/tripNotes.js']) {
    for (const m of read(f).matchAll(/deleteImages\(([^)]*)\)/g)) assert.equal(m[1], 'imgs.added', `${f}：${m[0]}`);
  }
  assert.doesNotMatch(read('ui/imagesField.js'), /removed/);
  assert.match(read('app.js'), /keptImageIds\(store\.data, prevRaw\)/);
});
