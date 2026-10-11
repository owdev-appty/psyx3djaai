// バックアップ（または初期データ）を、アプリと同じ処理で確かめる。
// 中身は表示しない。形式チェックの結果・件数・読み直して同じになるかだけを出す。
//   node tools/check-backup.mjs <ファイルのパス>
import { readFileSync } from 'node:fs';
import { validateBackup, migrate, summarize, toBackup, storageBytes, STORAGE_LIMIT_BYTES } from '../js/store.js';

const path = process.argv[2];
if (!path) {
  console.error('使い方: node tools/check-backup.mjs <ファイルのパス>');
  process.exit(2);
}

let raw;
try {
  raw = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error('JSON として読めませんでした:', e.name);
  process.exit(1);
}

const check = validateBackup(raw);
console.log('形式チェック:', check.ok ? 'OK' : 'NG');
for (const err of check.errors) console.log('  -', err);
if (!check.ok) process.exit(1);

const data = migrate(raw);
const s = summarize(data);
console.log(`件数: 旅${s.trips}件・場所${s.places}件・持ち物${s.packingItems}件・タグ${data.tags.length}件`);

// id を補った数（もともと id がなかったもの）
const ids = (o) => JSON.stringify(o).match(/"id":/g)?.length ?? 0;
console.log('id を補った数:', ids(data) - ids(raw));

// 保存 → 読み直し → 書き出し → 読み直し で同じになるか
const saved = JSON.stringify(data);
const again = migrate(JSON.parse(saved));
console.log('保存して読み直すと同じ:', JSON.stringify(again) === saved ? 'はい' : 'いいえ');
const exported = JSON.parse(JSON.stringify(toBackup(again)));
console.log('書き出したファイルの形式チェック:', validateBackup(exported).ok ? 'OK' : 'NG');

const fake = { length: 1, key: () => 'tripnote.v1', getItem: () => saved };
const bytes = storageBytes(fake);
console.log(`保存したときの大きさ: ${Math.round(bytes / 1024)} KB（上限の目安 ${Math.round((bytes / STORAGE_LIMIT_BYTES) * 100)}%）`);
