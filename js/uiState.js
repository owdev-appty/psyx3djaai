// 画面の状態（最後に開いた日など）。消えても困らないものだけ。バックアップには入らない
import { storage } from './appStore.js';
import { KEYS } from './store.js';
import { withoutSavedDays } from './logic/plan.js';

function read() {
  try {
    const v = JSON.parse(storage.getItem(KEYS.ui) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function getUi(key, fallback = null) {
  const v = read()[key];
  return v === undefined ? fallback : v;
}

export function setUi(key, value) {
  const all = read();
  all[key] = value;
  try { storage.setItem(KEYS.ui, JSON.stringify(all)); } catch { /* 画面の状態なので、保存できなくても困らない */ }
}

// 旅ごとに見ていた日。メモリの中だけで持つ（保存しないので、アプリを終了して開き直したら Day 1）
const seenDays = new Map();
export const getSeenDay = (tripId) => seenDays.get(tripId) ?? null;
export function setSeenDay(tripId, day) { seenDays.set(tripId, day); }

// 以前保存していた日（day:◯）を消す（起動のときに1回）
export function dropSavedDays() {
  const all = read();
  if (!Object.keys(all).some((k) => k.startsWith('day:'))) return;
  try { storage.setItem(KEYS.ui, JSON.stringify(withoutSavedDays(all))); } catch { /* 消せなくても使わないので困らない */ }
}
