// 予定・Memo に添付する画像の決まり（画面と分けた純粋な関数）
// 画像そのものは IndexedDB に保存し、予定には attachments: [{ id, w, h, bytes }] だけを持たせる

export const MAX_IMAGES_PER_ITEM = 4;
export const MAX_IMAGES_PER_MEMO = 8; // Notes の Memo 1件ごと
export const FULL_EDGE = 1600;   // 保存する画像の長い辺
export const FULL_QUALITY = 0.8;
export const THUMB_EDGE = 320;   // 小さな画像（Plan と Bookings のカードで同じものを使う）
export const THUMB_QUALITY = 0.75;

// 長い辺を maxEdge 以下に縮める（大きくはしない）
export function fitSize(w, h, maxEdge) {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

// 画像を持つもの：予定（日ごと・日程未定）と Notes の Memo
const itemsOf = (trip) => [...(trip?.days || []).flatMap((d) => d.items || []), ...(trip?.unscheduled || []), ...(trip?.memos || [])];

// データの中で使われている画像の id（旅の予定・Memo をたどる）
export function attachmentIds(data) {
  const ids = new Set();
  for (const t of data?.trips || []) {
    for (const it of itemsOf(t)) for (const a of it.attachments || []) if (a && typeof a.id === 'string') ids.add(a.id);
  }
  return ids;
}

// 片付けで残す画像の id：今のデータ＋元に戻す用のデータ（prev）が使っている画像。
// prev はあるのに読めないときは null（どの画像が要るかわからないので、片付けない）
export function keptImageIds(data, prevRaw) {
  const used = attachmentIds(data);
  if (prevRaw == null) return used;
  let prev;
  try { prev = JSON.parse(prevRaw); } catch { return null; }
  for (const id of attachmentIds(prev)) used.add(id);
  return used;
}

// どこからも使われていない画像（保存されている id − 使われている id）
export function orphanIds(storedIds, referenced) {
  return [...storedIds].filter((id) => !referenced.has(id));
}

// バックアップの images 部分の形式チェック（なければ OK）
export function validateImagesSection(images) {
  if (images == null) return [];
  if (!Array.isArray(images)) return ['images の形が違います'];
  const bad = images.some((x) => !x || typeof x.id !== 'string' || typeof x.full !== 'string' || (x.thumb != null && typeof x.thumb !== 'string'));
  return bad ? ['images の中に形の違うものがあります'] : [];
}

// "約1.2MB" / "約340KB"
export function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `約${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')}MB`;
  return `約${Math.max(1, Math.round(bytes / 1024))}KB`;
}
