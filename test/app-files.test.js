import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../js/version.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

test('sw.js と js/version.js の版がそろっている', () => {
  const m = /const VERSION = '([^']+)'/.exec(sw);
  assert.ok(m, 'sw.js に VERSION がない');
  assert.equal(m[1], VERSION);
});

test('sw.js のキャッシュ一覧のファイルがすべてある', () => {
  const list = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]).filter((p) => p !== './');
  assert.ok(list.length > 5);
  for (const p of list) assert.ok(existsSync(join(root, p)), `${p} がない`);
});

test('js/ の全ファイルが sw.js のキャッシュ一覧に入っている（オフライン起動のため）', () => {
  const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p.slice(root.length)];
  });
  for (const f of walk(join(root, 'js'))) assert.ok(sw.includes(`'${f}'`), `${f} が sw.js にない`);
});

test('manifest の決まり', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'TripNote');
  assert.equal(m.short_name, 'TripNote');
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#121214');
  assert.equal(m.background_color, '#121214');
  for (const i of m.icons) assert.ok(existsSync(join(root, i.src)), `${i.src} がない`);
});
