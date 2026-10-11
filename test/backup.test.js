import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysSince, lastBackupText, isBackupStale, formatBytes } from '../js/logic/backup.js';

const now = new Date(2026, 9, 11, 10, 0);

test('lastBackupText', () => {
  assert.equal(lastBackupText(null, now), 'Last backup: never');
  assert.equal(lastBackupText(new Date(2026, 9, 11, 0, 5).toISOString(), now), 'Last backup: today');
  assert.equal(lastBackupText(new Date(2026, 9, 10, 23, 0).toISOString(), now), 'Last backup: 1 day ago');
  assert.equal(lastBackupText(new Date(2026, 8, 29, 12, 0).toISOString(), now), 'Last backup: 12 days ago');
  assert.equal(lastBackupText('壊れた日付', now), 'Last backup: never');
});

test('isBackupStale: なし・14日以上で注意', () => {
  assert.equal(isBackupStale(null, now), true);
  assert.equal(isBackupStale(new Date(2026, 8, 28).toISOString(), now), false); // 13日
  assert.equal(isBackupStale(new Date(2026, 8, 27).toISOString(), now), true);  // 14日
});

test('daysSince: 未来の日付は 0', () => {
  assert.equal(daysSince(new Date(2026, 9, 20).toISOString(), now), 0);
});

test('formatBytes', () => {
  assert.equal(formatBytes(215040), '210 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5 MB');
  assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB');
});

test('lastBackupText：画像も含めたバックアップの表示', () => {
  assert.equal(lastBackupText(null, now, 'Last backup with images'), 'Last backup with images: never');
  assert.equal(lastBackupText(new Date(2026, 9, 1).toISOString(), now, 'Last backup with images'), 'Last backup with images: 10 days ago');
});
