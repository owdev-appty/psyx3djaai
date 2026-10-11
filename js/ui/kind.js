// 予定の種類ごとの色分け（Plan と Bookings で同じ）。色は css/app.css の --kind-* にまとめる
import { icon } from './icons.js';
import { KIND_GROUP, KIND_GROUP_LABELS } from '../labels.js';

export const kindGroup = (kind) => KIND_GROUP[kind] || null;

// カードに付ける class（色なしの種類は空）
export function kindClass(kind) {
  const g = kindGroup(kind);
  return g ? `kind-${g === 'bar' ? 'food' : g}` : '';
}

// アイコン：色のある種類は角丸の四角に入れる
export function kindIcon(kind) {
  const g = kindGroup(kind);
  return `<span class="item-kind ${g ? 'kind-icon' : ''}" aria-hidden="true">${icon(kind || 'other')}</span>`;
}

// タイトルの前の小さなラベル（交通・宿・食事・バー）
export function kindLabel(kind) {
  const g = kindGroup(kind);
  return g ? `<span class="kind-label">${KIND_GROUP_LABELS[g]}</span>` : '';
}
