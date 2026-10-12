// バックアップの表示ルール

export const STALE_DAYS = 14;

// 前回のバックアップから何日たったか（端末の日付で数える）。なければ null
export function daysSince(iso, now = new Date()) {
  if (typeof iso !== 'string') return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const a = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}

// label：'Last backup'、画像も含めたバックアップは 'Last backup with images'
export function lastBackupText(iso, now = new Date(), label = 'Last backup') {
  const n = daysSince(iso, now);
  if (n === null) return `${label}: never`;
  if (n === 0) return `${label}: today`;
  if (n === 1) return `${label}: 1 day ago`;
  return `${label}: ${n} days ago`;
}

// 一度もない、または14日以上たっていたら注意
export function isBackupStale(iso, now = new Date()) {
  const n = daysSince(iso, now);
  return n === null || n >= STALE_DAYS;
}

// 容量の表示：210 KB / 5 MB
export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`;
}

// ---------- 「バックアップしましょう」の表示（Trips の上） ----------
export const NUDGE_DAYS = 7;

// 前回の書き出しから7日以上たっていて、その後にデータが変わっていたら出す。
// 一度も書き出していなくて、データが変わっていたら出す。×を押した日（hiddenOn）は出さない
//   lastExportAt / changedAt：ISO 文字列。hiddenOn・today：YYYY-MM-DD
export function needsBackupNudge({ lastExportAt, changedAt, hiddenOn, today, now = new Date() }) {
  if (hiddenOn && hiddenOn === today) return false;
  const changed = changedAt ? new Date(changedAt).getTime() : NaN;
  if (Number.isNaN(changed)) return false;
  const last = lastExportAt ? new Date(lastExportAt).getTime() : NaN;
  if (Number.isNaN(last)) return true;
  if (changed <= last) return false;
  return daysSince(lastExportAt, now) >= NUDGE_DAYS;
}

// 「前回 12日前」/「まだ書き出していません」
export function lastExportText(iso, now = new Date()) {
  const n = daysSince(iso, now);
  if (n === null) return 'まだ書き出していません';
  return n === 0 ? '前回 今日' : `前回 ${n}日前`;
}

// 保存の保護（navigator.storage.persist）の表示
export function persistText(state) {
  if (state === 'granted') return '保存の保護：オン（容量が足りなくなっても消されにくくなっています）';
  if (state === 'denied') return '保存の保護：オフ（容量が足りなくなると消されることがあります。こまめにバックアップしてください）';
  return '保存の保護：この環境では使えません';
}
