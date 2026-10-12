// M10（仕上げ）の直し
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateBackupBytes, backupSizeText } from '../js/logic/backup.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('アプリ更新：戻ってきたときにも確かめ、準備ができたら知らせる（勝手に読み込み直さない。入力中・シート中は出さない）', () => {
  const src = read('js/appUpdate.js');
  assert.match(src, /visibilitychange[\s\S]*reg\.update\(\)/);
  assert.match(src, /addEventListener\('controllerchange'/);
  assert.match(src, /if \(!hadController\) return;/);
  assert.match(src, /新しい版があります/);
  assert.match(src, /今すぐ切り替える/);
  assert.match(src, /classList\.contains\('typing'\)[\s\S]*\.sheet-backdrop/);
  // 読み込み直すのは「今すぐ切り替える」を押したときだけ
  assert.equal((src.match(/location\.reload\(\)/g) || []).length, 1);
  assert.match(src, /data-act="update-now"\]'\)\.addEventListener\('click', \(\) => location\.reload\(\)\)/);
  assert.match(src, /v\$\{VERSION\} になりました/);
  assert.match(read('js/app.js'), /watchUpdates\(\);/);
  assert.doesNotMatch(read('js/app.js'), /serviceWorker\.register/);
});

test('オフライン：AI のボタンは押した時点で「オフラインです」（写真を選ぶ画面・シートを開かない）', () => {
  assert.match(read('js/views/aiCommon.js'), /navigator\.onLine !== false\) return false;[\s\S]*title: 'オフラインです'/);
  for (const [f, fn] of [['aiScreenshot', 'openScreenshotImport'], ['aiMemo', 'openMemoImport'], ['aiLookback', 'openLookbackTidy'], ['aiTidy', 'openPlaceTidy']]) {
    assert.match(read(`js/views/${f}.js`), new RegExp(`export function ${fn}\\([^)]*\\) \\{\\n  if \\(offlineBlocked\\(\\)\\) return;`), f);
  }
});

test('電波が弱いとき：AI は120秒、今日の残りは10秒で止める', () => {
  const src = read('js/aiClient.js');
  assert.match(src, /const TIMEOUT_MS = 120000;/);
  assert.match(src, /const USAGE_TIMEOUT_MS = 10000;/);
  assert.match(src, /request\('\/tripnote\/usage', token, \{ method: 'GET' \}, USAGE_TIMEOUT_MS\)/);
});

test('表記：AI の確認画面の保存ボタンも Save', () => {
  for (const f of ['aiScreenshot', 'aiMemo', 'aiLookback', 'aiTidy']) {
    const src = read(`js/views/${f}.js`);
    assert.match(src, /saveBtn\.textContent = 'Save';/, f);
    assert.doesNotMatch(src, /'保存'|「保存」/, f);
  }
});

test('空の状態：次に何をすればよいかを書く', () => {
  assert.match(read('js/views/home.js'), /右上の ＋ New trip から作れます/);
  assert.match(read('js/views/places.js'), /右上の ＋ New place から作れます/);
  assert.match(read('js/views/place.js'), /まだありません。下の ＋ Add から足せます/);
  assert.match(read('js/views/packingMaster.js'), /右上の ＋ Add から足せます/);
  assert.match(read('js/views/tags.js'), /右上の ＋ Add から作れます/);
  assert.match(read('js/views/moneyAll.js'), /旅の Money タブで支出を足すと、ここにまとまります/);
});

test('タップのしやすさ：押すものは 44px 以上', () => {
  const css = read('css/app.css');
  assert.match(css, /--tap: 44px;/);
  for (const sel of ['.btn-small', '.chips-small .chip', '.chip-xs', '.ref-btn', '.logged-btn']) {
    const rule = css.match(new RegExp(`${sel.replace(/[.*]/g, (c) => `\\${c}`)} \\{[^}]*\\}`))[0];
    assert.match(rule, /min-height: var\(--tap\)/, sel);
  }
  assert.match(css, /\.chip \{\n  min-height: var\(--tap\);/);
  assert.match(css, /\.seg \{[^}]*min-height: var\(--tap\);/);
  assert.match(css, /\.item-link \{[^}]*min-height: var\(--tap\);/);
  assert.match(css, /\.drag \{[^}]*width: var\(--tap\); height: var\(--tap\);/);
  assert.doesNotMatch(css, /min-height: (3\d|4[0-3])px/);
});

test('バックアップ：初期値は画像あり。書き出す前にだいたいの大きさを出す', () => {
  assert.equal(estimateBackupBytes({ dataBytes: 1000, imageCount: 2, imageBytes: 3000, withImages: true }), 1000 + 4000 + 240);
  assert.equal(estimateBackupBytes({ dataBytes: 1000, imageCount: 2, imageBytes: 3000, withImages: false }), 1000);
  assert.equal(estimateBackupBytes({ dataBytes: 1000, withImages: true }), 1000);
  assert.equal(backupSizeText({ bytes: 35 * 1024 * 1024, imageCount: 100, withImages: true }), 'ファイルの大きさ：約35MB（画像100枚を含む）');
  assert.equal(backupSizeText({ bytes: 363 * 1024, imageCount: 100, withImages: false }), 'ファイルの大きさ：約363KB（画像なし）');
  assert.equal(backupSizeText({ bytes: 2 * 1024, imageCount: 0, withImages: true }), 'ファイルの大きさ：約2KB');
  const settings = read('js/views/settings.js');
  assert.match(settings, /<input type="checkbox" name="withImages" checked>/);
  assert.match(settings, /exportBackup\(\{ withImages: withImages\(\) \}\)/);
  assert.match(read('js/views/home.js'), /backupSizeText\(\{ bytes, imageCount: images\.count, withImages: true \}\)/);
});

test('公開リポジトリ：Worker の名前などの中の情報は、アプリのコードの URL 以外に書かない', () => {
  for (const f of ['README.md', 'docs/tripnote-plan.md', 'js/aiClient.js']) {
    const src = read(f).replace(/export const WORKER_URL = '[^']+';/, '');
    assert.doesNotMatch(src, /damp-field|r8q3n6xw2p|reflect-rate|77750cfb|nyrdhbksau/, f);
  }
});
