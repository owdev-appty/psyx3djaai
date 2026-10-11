// 画面の状態（最後に開いた日など）。消えても困らないものだけ。バックアップには入らない
import { storage } from './appStore.js';
import { KEYS } from './store.js';

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
