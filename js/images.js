// 予定に添付する画像の保存（IndexedDB）。画像はここだけで扱う。添付した画像は AI には送らない
// （AI のスクショ取り込みでは、選んだ画像を縮小して送るだけで、保存はしない：shrinkForAI）
// 1件 = { id, full: Blob(JPEG 長い辺1600px), thumb: Blob(JPEG 長い辺320px), w, h, bytes, createdAt }
// 小さな画像（thumb）は Plan と Bookings のカードで同じものを使う
import { newId } from './store.js';
import { fitSize, FULL_EDGE, FULL_QUALITY, THUMB_EDGE, THUMB_QUALITY, orphanIds } from './logic/images.js';

const DB_NAME = 'tripnote-images';
const STORE = 'images';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// 1つのトランザクションで run(store) を行い、終わったら result を返す
async function withStore(mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    run(store, (v) => { result = v; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const reqValue = (req, set) => { req.onsuccess = () => set(req.result); };

export const putImage = (rec) => withStore('readwrite', (s) => s.put(rec));
export const getImage = (id) => withStore('readonly', (s, set) => reqValue(s.get(id), set));
export const allImages = () => withStore('readonly', (s, set) => reqValue(s.getAll(), set));
export function deleteImages(ids) {
  const list = [...ids].filter(Boolean);
  if (!list.length) return Promise.resolve();
  list.forEach(forgetUrl);
  return withStore('readwrite', (s) => list.forEach((id) => s.delete(id)));
}

// 枚数と合計の大きさ（Settings の Data とバックアップの目安に使う）
export async function imageStats(ids = null) {
  const list = await allImages();
  const pick = ids ? list.filter((r) => ids.has(r.id)) : list;
  return { count: pick.length, bytes: pick.reduce((n, r) => n + (r.full?.size || 0) + (r.thumb?.size || 0), 0) };
}

// どこからも使われていない画像を消す（referenced：使われている id の Set）
export async function removeOrphans(referenced) {
  const list = await allImages();
  const orphans = orphanIds(list.map((r) => r.id), referenced);
  await deleteImages(orphans);
  return orphans.length;
}

// ---------- 表示用の URL（同じ画像は1回だけ作る） ----------
const urls = new Map();
function forgetUrl(id) {
  for (const k of [`t:${id}`, `f:${id}`]) {
    if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); }
  }
}
export async function imageUrl(id, kind = 'thumb') {
  const key = `${kind === 'thumb' ? 't' : 'f'}:${id}`;
  if (urls.has(key)) return urls.get(key);
  const rec = await getImage(id);
  const blob = rec && (kind === 'thumb' ? rec.thumb || rec.full : rec.full);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

// 画面の中の <img data-thumb="id"> に小さな画像を入れる
export function hydrateThumbs(root) {
  root.querySelectorAll('img[data-thumb]').forEach(async (img) => {
    try {
      const url = await imageUrl(img.dataset.thumb, 'thumb');
      if (url) img.src = url;
      else img.closest('[data-thumb-box]')?.classList.add('is-missing');
    } catch {
      img.closest('[data-thumb-box]')?.classList.add('is-missing');
    }
  });
}

// ---------- 縮小 ----------
async function decode(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* 下の方法で */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(src, w, h, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // 透明な部分（PNG のスクショなど）は白にする
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', quality));
}

// ファイル → 縮小して IndexedDB に保存。予定に入れる attachment（{ id, w, h, bytes }）を返す
export async function addImageFile(file) {
  const src = await decode(file);
  const sw = src.width, sh = src.height;
  const full = fitSize(sw, sh, FULL_EDGE);
  const thumb = fitSize(sw, sh, THUMB_EDGE);
  const [fullBlob, thumbBlob] = await Promise.all([
    toJpeg(src, full.w, full.h, FULL_QUALITY),
    toJpeg(src, thumb.w, thumb.h, THUMB_QUALITY),
  ]);
  src.close?.();
  const id = newId();
  await putImage({ id, full: fullBlob, thumb: thumbBlob, w: full.w, h: full.h, bytes: fullBlob.size, createdAt: new Date().toISOString() });
  // 画像を消されにくくするよう、ブラウザにお願いする（だめでも続ける）
  navigator.storage?.persist?.().catch(() => {});
  return { id, w: full.w, h: full.h, bytes: fullBlob.size };
}

// AI のスクショ取り込み用：長い辺1600px・JPEG 0.8 に縮小して base64 にする（保存はしない）。
// 1枚が大きすぎるときは、もう少し小さくする
export async function shrinkForAI(file) {
  const src = await decode(file);
  try {
    for (const [edge, q] of [[FULL_EDGE, FULL_QUALITY], [1280, 0.7], [1024, 0.6]]) {
      const size = fitSize(src.width, src.height, edge);
      const blob = await toJpeg(src, size.w, size.h, q);
      if (blob.size <= AI_IMAGE_BYTES) return { mediaType: 'image/jpeg', data: await blobToBase64(blob) };
    }
    throw new Error('too_large');
  } finally {
    src.close?.();
  }
}
const AI_IMAGE_BYTES = 1.5 * 1024 * 1024;

// ---------- バックアップ（文字に変えて JSON に入れる） ----------
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(b64, type = 'image/jpeg') {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// 使われている画像を、バックアップの images の形にする
export async function exportImages(ids) {
  const list = (await allImages()).filter((r) => ids.has(r.id));
  const out = [];
  for (const r of list) {
    out.push({ id: r.id, w: r.w, h: r.h, createdAt: r.createdAt, full: await blobToBase64(r.full), thumb: r.thumb ? await blobToBase64(r.thumb) : null });
  }
  return out;
}

// バックアップの images を IndexedDB に入れる（同じ id は上書き）
export async function importImages(images) {
  for (const x of images || []) {
    const full = base64ToBlob(x.full);
    const thumb = x.thumb ? base64ToBlob(x.thumb) : null;
    forgetUrl(x.id);
    await putImage({ id: x.id, full, thumb, w: x.w || 0, h: x.h || 0, bytes: full.size, createdAt: x.createdAt || new Date().toISOString() });
  }
  return (images || []).length;
}
