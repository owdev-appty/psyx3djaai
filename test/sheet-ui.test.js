import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pickDay, withoutSavedDays } from '../js/logic/plan.js';
import { kindIcon } from '../js/ui/kind.js';
import { iconChip } from '../js/ui/sheet.js';

const dates = ['2026-07-05', '2026-07-06', '2026-07-07'];

test('pickDay：アプリを開き直したとき（見ていた日がない）は旅の初日。旅行中でも今日ではなく Day 1', () => {
  assert.equal(pickDay(null, dates), '2026-07-05');
  assert.equal(pickDay(undefined, dates), '2026-07-05');
});

test('pickDay：アプリを開いている間に見ていた日は、そのまま', () => {
  assert.equal(pickDay('2026-07-07', dates), '2026-07-07');
  assert.equal(pickDay('unscheduled', dates), 'unscheduled');
  // 旅の日程が変わって、その日がなくなったら Day 1
  assert.equal(pickDay('2026-07-09', dates), '2026-07-05');
  // 日程のない旅は日程未定
  assert.equal(pickDay(null, []), 'unscheduled');
});

test('withoutSavedDays：以前 tripnote.ui に保存していた日（day:◯）だけを消す', () => {
  assert.deepEqual(withoutSavedDays({ 'day:t1': '2026-07-07', packingFilter: 'g1', 'spotFilter:p1': 'want' }), { packingFilter: 'g1', 'spotFilter:p1': 'want' });
  assert.deepEqual(withoutSavedDays(null), {});
});

test('Kind：Plan の一覧のアイコンは読み上げ用の名前つき。選ぶチップはアイコンと名前', () => {
  const named = kindIcon('flight', { named: true });
  assert.match(named, /role="img"/);
  assert.match(named, /aria-label="Flight"/);
  assert.match(kindIcon('flight'), /aria-hidden="true"/);
  const c = iconChip('sight', '<svg></svg>', 'Sight', true);
  assert.match(c, />Sight<\/button>$/);
  assert.match(c, /aria-pressed="true"/);
});

test('Plan の一覧には種類の文字のラベルを出さない（アイコンだけ）', () => {
  const src = readFileSync(new URL('../js/views/tripPlan.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /kindLabel\(/);
  assert.match(src, /kindIcon\(it\.kind, \{ named: true \}\)/);
});

test('シートを開いたときの focus は focusWhenOpen で（onMount の中で直接 focus() しない。タップに応じた focus は別）', () => {
  const dirs = ['../js/views/', '../js/ui/'];
  for (const d of dirs) {
    for (const f of readdirSync(new URL(d, import.meta.url))) {
      if (!f.endsWith('.js')) continue;
      const src = readFileSync(new URL(d + f, import.meta.url), 'utf8');
      for (const m of src.matchAll(/onMount\(root[^)]*\) \{([\s\S]*?)\n    \},\n    onSave/g)) {
        assert.doesNotMatch(m[1], /^ {6}(if \([^)]*\) )?[^\s][^\n]*\.focus\(\);/m, `${f}：onMount で直接 focus() している`);
      }
    }
  }
});

test('Notes to self と Memo の入力欄は複数行の <textarea>', () => {
  const place = readFileSync(new URL('../js/views/place.js', import.meta.url), 'utf8');
  assert.match(place, /'notesToSelf', n, \[\{ name: 'text', label: 'Text', type: 'textarea'/);
  const form = readFileSync(new URL('../js/ui/formSheet.js', import.meta.url), 'utf8');
  assert.match(form, /case 'textarea':\n\s+return `<label[^`]*<textarea class="input"/);
  const notes = readFileSync(new URL('../js/views/tripNotes.js', import.meta.url), 'utf8');
  assert.match(notes, /<textarea class="input" name="memoText"/);
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  assert.match(css, /textarea\.input \{[^}]*vertical-align: top;/);
  assert.match(css, /input, textarea, select \{ font-size: 16px; \}/);
});

test('Places の店・宿の一覧はアイコンだけ（読み上げ用の名前つき）。宿もドラッグで並べ替え', () => {
  const src = readFileSync(new URL('../js/views/place.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /kindLabel\(/);
  assert.match(src, /kindIcon\(s\.kind, \{ named: SPOT_KIND_LABELS\[s\.kind\] \|\| 'Other' \}\)/);
  assert.match(src, /kindIcon\('stay', \{ named: true \}\)/);
  assert.match(src, /<ul class="cards sortable" data-list="stays">/);
  const icon = kindIcon('work', { named: 'Cowork' });
  assert.match(icon, /aria-label="Cowork"/);
  assert.match(kindIcon('stay', { named: true }), /aria-label="Stay"/);
});
