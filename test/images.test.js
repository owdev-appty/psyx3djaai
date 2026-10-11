import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitSize, canAddImages, remainingSlots, attachmentIds, tripAttachmentIds, orphanIds, validateImagesSection, formatSize, MAX_IMAGES_PER_ITEM, MAX_IMAGES_PER_MEMO } from '../js/logic/images.js';
import { normalize, validateBackup, toBackup } from '../js/store.js';

test('fitSize：長い辺を縮める。小さい画像は大きくしない', () => {
  assert.deepEqual(fitSize(1170, 2532, 1600), { w: 739, h: 1600 });
  assert.deepEqual(fitSize(4032, 3024, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(fitSize(800, 600, 1600), { w: 800, h: 600 });
  assert.deepEqual(fitSize(0, 600, 1600), { w: 0, h: 0 });
});

test('1つの予定に4枚まで', () => {
  assert.equal(MAX_IMAGES_PER_ITEM, 4);
  assert.equal(canAddImages(3, 1), true);
  assert.equal(canAddImages(3, 2), false);
  assert.equal(remainingSlots(1), 3);
  assert.equal(remainingSlots(5), 0);
});

const data = {
  trips: [
    { days: [{ items: [{ attachments: [{ id: 'a' }, { id: 'b' }] }, { attachments: [] }] }], unscheduled: [{ attachments: [{ id: 'c' }] }] },
    { days: [{ items: [{}] }] },
  ],
};

test('attachmentIds / tripAttachmentIds / orphanIds', () => {
  assert.deepEqual([...attachmentIds(data)].sort(), ['a', 'b', 'c']);
  assert.deepEqual(tripAttachmentIds(data.trips[0]).sort(), ['a', 'b', 'c']);
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
  assert.deepEqual(tripAttachmentIds(t).sort(), ['x', 'y']);
  assert.deepEqual([...attachmentIds(d)].sort(), ['x', 'y']);
  assert.ok(MAX_IMAGES_PER_MEMO > 1);
});
