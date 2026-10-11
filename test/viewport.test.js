import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleFrame, focusScrollTop } from '../js/logic/viewport.js';

test('visibleFrame：見えている範囲そのもの。シートの上端はステータスバーの下', () => {
  assert.deepEqual(visibleFrame({ vvHeight: 844, vvOffsetTop: 0, safeTop: 47 }), { top: 0, height: 844, sheetMaxHeight: 789, bottomPad: 422 });
});

test('visibleFrame：キーボード＋入力補助バーで見えている範囲が狭くなっても、その範囲だけを使う', () => {
  // 数字キーボード＋入力補助バーで、見えている範囲が 480px になった例
  assert.deepEqual(visibleFrame({ vvHeight: 480, vvOffsetTop: 0, safeTop: 47 }), { top: 0, height: 480, sheetMaxHeight: 425, bottomPad: 240 });
  // 画面が押し上げられた（offsetTop > 0）ときは、枠もその位置に
  assert.equal(visibleFrame({ vvHeight: 480, vvOffsetTop: 130, safeTop: 47 }).top, 130);
});

test('visibleFrame：とても狭くても最小の高さは保つ', () => {
  assert.equal(visibleFrame({ vvHeight: 150, safeTop: 47 }).sheetMaxHeight, 160);
});

test('focusScrollTop：欄の上端を、箱の上から3分の1の位置に', () => {
  // 箱 top=100 高さ=300 → 目標 200。欄が 450 にあれば 250 下へ
  assert.equal(focusScrollTop({ elTop: 450, boxTop: 100, boxHeight: 300, scrollTop: 40, scrollMax: 2000 }), 290);
  // 欄が目標より上なら上へ
  assert.equal(focusScrollTop({ elTop: 120, boxTop: 100, boxHeight: 300, scrollTop: 400, scrollMax: 2000 }), 320);
});

test('focusScrollTop：0 〜 scrollMax におさめる', () => {
  assert.equal(focusScrollTop({ elTop: 110, boxTop: 100, boxHeight: 300, scrollTop: 20, scrollMax: 2000 }), 0);
  assert.equal(focusScrollTop({ elTop: 900, boxTop: 100, boxHeight: 300, scrollTop: 0, scrollMax: 500 }), 500);
});
