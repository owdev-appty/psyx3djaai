// 検索（画面と分けた純粋な関数）
//   ・ひらがな / カタカナ、全角 / 半角、大文字 / 小文字は同じとみなす
//   ・空白で区切った言葉は、すべて含むものだけ（例「台北 麺」）

// 比べるための形：NFKC（全角英数→半角）・小文字・カタカナ→ひらがな
export function normalizeForSearch(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function searchWords(query) {
  return normalizeForSearch(query).split(/\s+/).filter(Boolean);
}

// texts（いくつかの文字）が、words をすべて含むか
export function matchesAll(texts, words) {
  if (!words.length) return true;
  const hay = normalizeForSearch(texts.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}

// ---------- 場所の店のタブ：状態・種類・言葉で絞り込む ----------
export function filterSpotList(spots, { status = null, kind = null, query = '' } = {}) {
  const words = searchWords(query);
  return (spots || []).filter((s) => (!status || s.status === status)
    && (!kind || s.kind === kind)
    && matchesAll([s.name, s.note, s.area, s.hours], words));
}

// ---------- アプリ全体の検索 ----------
// 結果：{ type, label, sub, href, placeId?, tripId?, day?, spotName? }。種類ごとに max 件まで
export const SEARCH_TYPES = ['spot', 'note', 'tip', 'stay', 'plan', 'memo', 'trip'];
export const SEARCH_TYPE_LABELS = { spot: '店', note: 'Notes to self', tip: '移動のコツ', stay: '宿', plan: '予定', memo: 'Memo', trip: 'Trips' };

const firstLine = (s, max = 60) => {
  const line = String(s || '').split('\n').find((x) => x.trim()) || '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
};

export function searchAll(data, query, { max = 30 } = {}) {
  const words = searchWords(query);
  if (!words.length) return [];
  const out = [];
  const push = (r) => { if (out.filter((x) => x.type === r.type).length < max) out.push(r); };
  for (const p of data?.places || []) {
    const pid = encodeURIComponent(p.id);
    for (const s of p.spots || []) {
      if (matchesAll([s.name, s.note, s.area, s.hours], words)) {
        push({ type: 'spot', label: s.name || '（名前なし）', sub: [p.name, s.area].filter(Boolean).join(' · '), href: `#/place/${pid}/spots`, placeId: p.id, spotName: s.name || '' });
      }
    }
    for (const n of p.notesToSelf || []) {
      if (matchesAll([n.text], words)) push({ type: 'note', label: firstLine(n.text), sub: p.name || '', href: `#/place/${pid}/notes`, placeId: p.id });
    }
    for (const t of p.transportTips || []) {
      if (matchesAll([t.title, t.text], words)) push({ type: 'tip', label: t.title || firstLine(t.text), sub: p.name || '', href: `#/place/${pid}/tips`, placeId: p.id });
    }
    for (const s of p.stays || []) {
      if (matchesAll([s.name, s.area, s.note], words)) push({ type: 'stay', label: s.name || '（名前なし）', sub: [p.name, s.area].filter(Boolean).join(' · '), href: `#/place/${pid}/stays`, placeId: p.id });
    }
  }
  for (const t of data?.trips || []) {
    const tid = encodeURIComponent(t.id);
    if (matchesAll([t.title], words)) push({ type: 'trip', label: t.title || '（名前なし）', sub: t.startDate || '日程未定', href: `#/trip/${tid}/plan`, tripId: t.id });
    const days = [...(t.days || []).map((d) => [d.date, d.items || []]), ['unscheduled', t.unscheduled || []]];
    for (const [day, items] of days) {
      for (const it of items) {
        if (matchesAll([it.title, it.note], words)) {
          push({ type: 'plan', label: it.title || '（名前なし）', sub: [t.title, day === 'unscheduled' ? '日程未定' : day].filter(Boolean).join(' · '), href: `#/trip/${tid}/plan`, tripId: t.id, day });
        }
      }
    }
    for (const m of t.memos || []) {
      if (matchesAll([m.text], words)) push({ type: 'memo', label: firstLine(m.text) || '（画像）', sub: t.title || '', href: `#/trip/${tid}/notes`, tripId: t.id });
    }
  }
  return SEARCH_TYPES.flatMap((type) => out.filter((r) => r.type === type));
}
