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

export function lastBackupText(iso, now = new Date()) {
  const n = daysSince(iso, now);
  if (n === null) return 'Last backup: never';
  if (n === 0) return 'Last backup: today';
  if (n === 1) return 'Last backup: 1 day ago';
  return `Last backup: ${n} days ago`;
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
