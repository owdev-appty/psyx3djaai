// AI の画面で共通に使うもの
import { knownUsage, fetchUsage } from '../aiClient.js';
import { esc } from '../ui/dom.js';

// 実行する前の「回数を1回使います（今日の残り◯回）」
export function costLine() {
  const u = knownUsage();
  const left = u ? `今日の残り ${esc(u.remaining)}回` : '今日の残りを確かめています…';
  return `<p class="hint hint-sheet ai-usage" data-ai-cost>回数を1回使います（${left}）</p>`;
}

export function updateCost(root) {
  const el = root.querySelector('[data-ai-cost]');
  if (el) el.outerHTML = costLine();
}

// 今日の残りがまだわからなければ、Worker に聞いて表示を直す（回数は使わない）
export function refreshCost(root) {
  if (knownUsage()) return;
  fetchUsage()
    .then(() => updateCost(root))
    .catch(() => {
      const el = root.querySelector('[data-ai-cost]');
      if (el) el.textContent = '回数を1回使います（今日の残りはわかりませんでした）';
    });
}
