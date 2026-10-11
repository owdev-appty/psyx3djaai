import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetBox, revealScrollTop } from '../js/logic/viewport.js';

test('sheetBox：キーボードがないとき、上端はステータスバーの下', () => {
  // iPhone 390×844、ステータスバー 47px
  assert.deepEqual(sheetBox({ innerHeight: 844, vvHeight: 844, vvOffsetTop: 0, safeTop: 47 }), { bottom: 0, maxHeight: 789 });
});

test('sheetBox：キーボードが出たら、下端をキーボードの上に、高さは見えている範囲から', () => {
  // キーボード 336px
  assert.deepEqual(sheetBox({ innerHeight: 844, vvHeight: 508, vvOffsetTop: 0, safeTop: 47 }), { bottom: 336, maxHeight: 453 });
  // 画面全体が押し上げられた（offsetTop > 0）ときも、下端は見えている範囲の下
  assert.deepEqual(sheetBox({ innerHeight: 844, vvHeight: 508, vvOffsetTop: 120, safeTop: 47 }), { bottom: 216, maxHeight: 453 });
});

test('sheetBox：とても狭くても最小の高さは保つ', () => {
  assert.equal(sheetBox({ innerHeight: 400, vvHeight: 150, safeTop: 47 }).maxHeight, 160);
});

test('revealScrollTop：欄がキーボードの後ろ（箱の下）なら、その分だけ下へ', () => {
  assert.equal(revealScrollTop({ elTop: 500, elBottom: 544, boxTop: 100, boxBottom: 450, scrollTop: 200 }), 310);
});

test('revealScrollTop：欄が箱の上に隠れていたら上へ（0より小さくしない）', () => {
  assert.equal(revealScrollTop({ elTop: 60, elBottom: 104, boxTop: 100, boxBottom: 450, scrollTop: 30 }), 0);
  assert.equal(revealScrollTop({ elTop: 60, elBottom: 104, boxTop: 100, boxBottom: 450, scrollTop: 300 }), 244);
});

test('revealScrollTop：見えていれば変えない。箱より高い欄は上端を見せる', () => {
  assert.equal(revealScrollTop({ elTop: 200, elBottom: 244, boxTop: 100, boxBottom: 450, scrollTop: 80 }), 80);
  assert.equal(revealScrollTop({ elTop: 300, elBottom: 900, boxTop: 100, boxBottom: 450, scrollTop: 0 }), 184);
});
