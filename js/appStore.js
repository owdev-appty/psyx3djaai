import { createStore } from './store.js';

// localStorage が使えない環境（プライベートブラウズの一部など）でも画面は動くようにする
function pickStorage() {
  try {
    const s = window.localStorage;
    const k = 'tripnote.__test';
    s.setItem(k, '1');
    s.removeItem(k);
    return { storage: s, persistent: true };
  } catch {
    const m = new Map();
    return {
      persistent: false,
      storage: {
        get length() { return m.size; },
        key: (i) => [...m.keys()][i] ?? null,
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
      },
    };
  }
}

const picked = pickStorage();
export const storage = picked.storage;
export const persistent = picked.persistent;
export const store = createStore(storage);
store.load();
