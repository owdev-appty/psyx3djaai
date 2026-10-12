// リンクの URL：http / https だけを使う（javascript: や data: などは、表示も保存もしない）
// 「www.example.com/…」のように前に何も付いていなければ https:// を付ける。使えないものは ''
export function safeUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let full = s;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    if (!/^[^\s/:]+\.[^\s/:]+/.test(s)) return '';
    full = `https://${s}`;
  }
  try {
    const u = new URL(full);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? u.href : '';
  } catch {
    return '';
  }
}

// 保存の前に：空はそのまま ''、使えない URL は null（エラーにする）
export function urlForSave(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return safeUrl(s) || null;
}

export const URL_ERROR = 'Link は http:// か https:// で始まる URL にしてください';
