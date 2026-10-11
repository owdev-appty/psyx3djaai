// 予定の種類ごとの色分け（Plan と Bookings で同じ）。色は css/app.css の --kind-* にまとめる
import { icon } from './icons.js';
import { esc } from './dom.js';
import { KIND_GROUP, KIND_GROUP_LABELS, KIND_LABELS } from '../labels.js';

export const kindGroup = (kind) => KIND_GROUP[kind] || null;

// 場所ノートの店の状態のチップの色
export const SPOT_STATUS_CHIP = { want: 'pill-accent', again: 'chip-booked', nextTime: 'chip-todo', visited: 'chip-plain' };

// カードに付ける class（色なしの種類は空）
export function kindClass(kind) {
  const g = kindGroup(kind);
  return g ? `kind-${g === 'bar' ? 'food' : g}` : '';
}

// 種類の名前（読み上げ用。Flight / Stay など）
export const kindName = (kind) => KIND_LABELS[kind] || KIND_LABELS.other;

// アイコン：色のある種類は角丸の四角に入れる
//   named: true なら読み上げ用に名前を付ける（Plan の一覧・場所の店と宿はアイコンだけなので）。
//   文字を渡せば、その名前を使う（店の種類 Souvenir / Cowork など、予定の種類にない名前）
export function kindIcon(kind, { named = false } = {}) {
  const g = kindGroup(kind);
  const name = typeof named === 'string' ? named : kindName(kind);
  const a11y = named ? `role="img" aria-label="${esc(name)}"` : 'aria-hidden="true"';
  return `<span class="item-kind ${g ? 'kind-icon' : ''}" ${a11y}>${icon(kind || 'other')}</span>`;
}

// タイトルの前の小さなラベル（交通・宿・食事・バー）
export function kindLabel(kind) {
  const g = kindGroup(kind);
  return g ? `<span class="kind-label">${KIND_GROUP_LABELS[g]}</span>` : '';
}
