// データの読み書きはこのモジュールだけで行う。
// 読み込み・形式チェック・初期値の補完・移行（schemaVersion）・保存・容量確認・書き出し・復元。
// DOM には触らない（node --test でテストできるように、storage は外から渡せる）

import { validateImagesSection } from './logic/images.js';
import { paymentsOf } from './logic/money.js';

export const SCHEMA_VERSION = 1;

export const KEYS = {
  data: 'tripnote.v1',        // アプリのデータ（バックアップと同じ形）
  prev: 'tripnote.v1.prev',   // 復元する直前のデータ（Undo restore 用）
  secret: 'tripnote.secret',  // Worker の合言葉
  ui: 'tripnote.ui',          // 画面の状態
};
// バックアップに入るのは KEYS.data の中身だけ。prev / secret / ui は入れない

export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024; // localStorage の目安の上限
export const WARN_RATIO = 0.8;
export const DANGER_RATIO = 0.95;

// ---------- id ----------
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newId(len = 12) {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ID_CHARS[b % ID_CHARS.length];
  return s;
}

// ---------- 形をそろえる ----------
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const objs = (v) => arr(v).filter(isObj);
// id がなければ付ける（あるものは変えない）。知らない項目は残す
const withId = (o) => (typeof o.id === 'string' && o.id ? o : { ...o, id: newId() });

export function emptyData() {
  return {
    app: 'TripNote',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: null,
    source: 'backup',
    settings: { fxRates: {}, lastBackupAt: null, lastBackupWithImagesAt: null, ai: { enabled: true } },
    tags: [],
    packingItems: [],
    places: [],
    trips: [],
  };
}

function normalizeItem(it) {
  const o = withId(it);
  return {
    ...o,
    booking: isObj(o.booking) ? o.booking : null,
    // 添付した画像（中身は IndexedDB。ここには id と大きさだけ）
    attachments: objs(o.attachments).filter((a) => typeof a.id === 'string' && a.id),
  };
}

function normalizePlace(p) {
  const o = withId(p);
  return {
    ...o,
    notesToSelf: objs(o.notesToSelf).map(withId),
    transportTips: objs(o.transportTips).map(withId),
    stays: objs(o.stays).map(withId),
    areas: objs(o.areas).map(withId),
    spots: objs(o.spots).map(withId),
    links: objs(o.links),
  };
}

function normalizePacking(p) {
  const o = isObj(p) ? p : {};
  return {
    ...o,
    tagIds: arr(o.tagIds).filter((x) => typeof x === 'string'),
    checked: isObj(o.checked) ? o.checked : {},
    skipped: isObj(o.skipped) ? o.skipped : {},
    feedback: isObj(o.feedback) ? o.feedback : {},
  };
}

function normalizeTrip(t) {
  const o = withId(t);
  return {
    ...o,
    placeIds: arr(o.placeIds).filter((x) => typeof x === 'string'),
    days: objs(o.days).map((d) => ({ ...d, items: objs(d.items).map(normalizeItem) })),
    unscheduled: objs(o.unscheduled).map(normalizeItem),
    // 支払いは配列（古いデータの文字1つも読む）
    expenses: objs(o.expenses).map((e) => ({ ...withId(e), payment: paymentsOf(e) })),
    todos: objs(o.todos).map(withId),
    // この旅だけの持ち物：{ id, name, checked, atStay }
    packingExtras: objs(o.packingExtras).map((x) => ({ ...withId(x), checked: x.checked === true, atStay: x.atStay === true })),
    candidates: objs(o.candidates).map(withId),
    unsortedNotes: arr(o.unsortedNotes).filter((x) => typeof x === 'string'),
    packing: normalizePacking(o.packing),
  };
}

// 足りない項目・null を初期値で補う。知らない項目は消さない
export function normalize(raw) {
  const base = emptyData();
  // バックアップに入っている画像（images）は、データには入れない（IndexedDB に入れる）
  const { images, ...o } = isObj(raw) ? raw : {};
  const s = isObj(o.settings) ? o.settings : {};
  return {
    ...base,
    ...o,
    app: 'TripNote',
    schemaVersion: SCHEMA_VERSION,
    settings: {
      ...base.settings,
      ...s,
      fxRates: isObj(s.fxRates) ? s.fxRates : {},
      lastBackupAt: typeof s.lastBackupAt === 'string' ? s.lastBackupAt : null,
      lastBackupWithImagesAt: typeof s.lastBackupWithImagesAt === 'string' ? s.lastBackupWithImagesAt : null,
      ai: { ...base.settings.ai, ...(isObj(s.ai) ? s.ai : {}) },
    },
    tags: objs(o.tags).map(withId),
    packingItems: objs(o.packingItems).map((p) => {
      const x = withId(p);
      return { ...x, tagIds: arr(x.tagIds).filter((t) => typeof t === 'string'), mustHave: x.mustHave === true };
    }),
    places: objs(o.places).map(normalizePlace),
    trips: objs(o.trips).map(normalizeTrip),
  };
}

// schemaVersion を見て今の形に移行する。今は 1 だけなので形をそろえるだけ
export function migrate(raw) {
  // 将来：if (raw.schemaVersion === 1) raw = v1to2(raw); のように順に足していく
  return normalize(raw);
}

// ---------- 形式チェック（復元の前に使う） ----------
export function validateBackup(raw) {
  const errors = [];
  if (!isObj(raw)) return { ok: false, errors: ['JSON の形が違います'] };
  if (raw.app !== 'TripNote') errors.push('TripNote のバックアップではありません');
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) errors.push('schemaVersion がありません');
  else if (raw.schemaVersion > SCHEMA_VERSION) errors.push('このアプリより新しい形式です。アプリを更新してください');
  for (const key of ['trips', 'places', 'packingItems']) {
    if (!Array.isArray(raw[key])) errors.push(`${key} がありません`);
    else if (raw[key].some((x) => !isObj(x))) errors.push(`${key} の中に形の違うものがあります`);
  }
  if (raw.tags != null && !Array.isArray(raw.tags)) errors.push('tags の形が違います');
  if (raw.settings != null && !isObj(raw.settings)) errors.push('settings の形が違います');
  errors.push(...validateImagesSection(raw.images));
  return { ok: errors.length === 0, errors };
}

export function summarize(data) {
  return {
    trips: arr(data?.trips).length,
    places: arr(data?.places).length,
    packingItems: arr(data?.packingItems).length,
  };
}

export function summaryText(data) {
  const s = summarize(data);
  return `旅${s.trips}件・場所${s.places}件・持ち物${s.packingItems}件`;
}

// ---------- 書き出し ----------
export function localISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function backupFileName(now = new Date()) {
  return `tripnote-backup-${localISODate(now)}.json`;
}

// バックアップの中身（KEYS.data の形そのまま）。合言葉・画面の状態・復元前のデータは入らない
export function toBackup(data, now = new Date()) {
  return { ...data, app: 'TripNote', schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), source: 'backup' };
}

// ---------- 容量 ----------
// localStorage は文字数で数える（1文字 = 2バイトとして目安を出す）
export function storageBytes(storage) {
  let chars = 0;
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    chars += k.length + (storage.getItem(k) || '').length;
  }
  return chars * 2;
}

export function usageLevel(bytes, limit = STORAGE_LIMIT_BYTES) {
  const ratio = bytes / limit;
  return ratio >= DANGER_RATIO ? 'danger' : ratio >= WARN_RATIO ? 'warn' : 'ok';
}

function isQuotaError(e) {
  return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}

// ---------- ストア ----------
// status: 'ok' | 'broken'（保存されたデータを読めなかった。上書きしない）
// saveState: 'saved' | 'pending' | 'full'（容量がいっぱいで保存できなかった）
export function createStore(storage, { saveDelayMs = 300 } = {}) {
  let data = emptyData();
  let status = 'ok';
  let brokenRaw = null;
  let saveState = 'saved';
  let timer = null;
  const listeners = new Set();

  // reason: 'change'（update）/ 'saved' / 'save-failed' / 'replaced'（復元・取り消し）
  const emit = (reason) => listeners.forEach((fn) => fn(reason));

  function load() {
    let raw = null;
    try {
      raw = storage.getItem(KEYS.data);
    } catch {
      raw = null;
    }
    if (raw == null) {
      data = emptyData();
      status = 'ok';
      return;
    }
    try {
      data = migrate(JSON.parse(raw));
      status = 'ok';
      brokenRaw = null;
    } catch {
      // 読めなかったデータは消さずに残し、書き出せるようにする
      status = 'broken';
      brokenRaw = raw;
      data = emptyData();
    }
  }

  function writeNow() {
    clearTimeout(timer);
    timer = null;
    if (status === 'broken') return false; // 読めなかったデータを上書きしない
    try {
      storage.setItem(KEYS.data, JSON.stringify(data));
      saveState = 'saved';
      emit('saved');
      return true;
    } catch (e) {
      saveState = isQuotaError(e) ? 'full' : 'pending';
      emit('save-failed');
      return false;
    }
  }

  function scheduleSave() {
    saveState = 'pending';
    clearTimeout(timer);
    timer = setTimeout(writeNow, saveDelayMs);
  }

  return {
    load,
    get data() { return data; },
    get status() { return status; },
    get brokenRaw() { return brokenRaw; },
    get saveState() { return saveState; },

    // fn(data) の中で data を書き換える。少し待ってからまとめて保存する
    update(fn) {
      if (status === 'broken') return;
      fn(data);
      scheduleSave();
      emit('change');
    },
    flush() {
      if (timer) return writeNow();
      return true;
    },

    usage() {
      const bytes = storageBytes(storage);
      return { bytes, limit: STORAGE_LIMIT_BYTES, level: usageLevel(bytes) };
    },

    backupJSON(now = new Date()) {
      return JSON.stringify(toBackup(data, now), null, 2);
    },
    markBackedUp(now = new Date(), { withImages = false } = {}) {
      data.settings.lastBackupAt = now.toISOString();
      if (withImages) data.settings.lastBackupWithImagesAt = now.toISOString();
      writeNow();
    },

    // 保存されたデータがあるか（なければ復元しても「元に戻す」用は残らない）
    hasSavedData() {
      try { return storage.getItem(KEYS.data) != null; } catch { return false; }
    },

    // 復元：形式チェック済みのデータで全部置き換える。直前のデータは prev に1つだけ残す
    // undo: 'kept'（残した）/ 'none'（残すデータがなかった）/ 'failed'（容量が足りず残せなかった）
    replaceAll(raw) {
      const check = validateBackup(raw);
      if (!check.ok) return { ok: false, errors: check.errors };
      const next = migrate(raw);
      let undo = 'none';
      const current = status === 'broken' ? brokenRaw : storage.getItem(KEYS.data);
      if (current != null) {
        try {
          storage.setItem(KEYS.prev, current);
          undo = 'kept';
        } catch {
          undo = 'failed';
          try { storage.removeItem(KEYS.prev); } catch { /* 何もしない */ }
        }
      }
      data = next;
      status = 'ok';
      brokenRaw = null;
      const saved = writeNow();
      emit('replaced');
      return saved ? { ok: true, undo } : { ok: false, errors: ['保存できませんでした（容量がいっぱいです）'] };
    },

    hasUndo() {
      try { return storage.getItem(KEYS.prev) != null; } catch { return false; }
    },
    undoRestore() {
      const prev = storage.getItem(KEYS.prev);
      if (prev == null) return false;
      storage.setItem(KEYS.data, prev);
      storage.removeItem(KEYS.prev);
      load();
      emit('replaced');
      return true;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// 合言葉（バックアップに入れない別のキー）
export function getSecret(storage) {
  try { return storage.getItem(KEYS.secret) || ''; } catch { return ''; }
}
export function setSecret(storage, value) {
  if (value) storage.setItem(KEYS.secret, value);
  else storage.removeItem(KEYS.secret);
}
