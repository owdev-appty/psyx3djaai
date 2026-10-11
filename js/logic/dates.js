// 日付の表示と計算。日付は "YYYY-MM-DD" の文字列で扱う（時刻・タイムゾーンを持ち込まない）

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// Date → "YYYY-MM-DD"（端末の日付）
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// "YYYY-MM-DD" → { y, m, d, weekday }。形が違えば null
export function parseISODate(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d, weekday: dt.getUTCDay() };
}

// "2026-12-04" → "12/4 金"。withYear なら "2026/12/4 金"
export function formatDay(s, { withYear = false } = {}) {
  const p = parseISODate(s);
  if (!p) return '';
  const md = `${p.m}/${p.d} ${WEEKDAYS[p.weekday]}`;
  return withYear ? `${p.y}/${md}` : md;
}
