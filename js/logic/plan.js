// 予定の並べ方と出発リミット（画面と分けた純粋な関数）

export const SLOTS = ['morning', 'afternoon', 'evening', 'night', 'anytime'];
export const SLOT_LABELS = { morning: '朝', afternoon: '昼', evening: '夕方', night: '夜', anytime: 'いつでも' };

// 移動の種類（出発リミットの計算に使う）
export const TRANSPORT_KINDS = ['train', 'bus', 'ferry', 'car'];
export const KIND_WORDS = { flight: '飛行機', train: '電車', bus: 'バス', ferry: 'フェリー', car: '車' };
export const DEFAULT_BUFFER_MIN = 10;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(s) {
  return typeof s === 'string' && TIME_RE.test(s);
}

export function toMinutes(s) {
  const m = TIME_RE.exec(s);
  return m ? +m[1] * 60 + +m[2] : null;
}

export function fromMinutes(min) {
  const v = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

// 時刻 → 時間帯：朝（〜10:59）／昼（11:00〜15:59）／夕方（16:00〜17:59）／夜（18:00〜）
export function slotOfTime(time) {
  const m = toMinutes(time);
  if (m === null) return null;
  if (m < 11 * 60) return 'morning';
  if (m < 16 * 60) return 'afternoon';
  if (m < 18 * 60) return 'evening';
  return 'night';
}

// 予定の時間帯：時刻があれば時刻から、なければ slot、どちらもなければ「いつでも」
export function slotOf(item) {
  if (isValidTime(item?.time)) return slotOfTime(item.time);
  return SLOTS.includes(item?.slot) ? item.slot : 'anytime';
}

export function hasTime(item) {
  return isValidTime(item?.time);
}

// 1日の予定を時間帯ごとに分ける。
// 各時間帯の中は「時刻のない予定（手動の順番＝配列の順）」→「時刻のある予定（時刻順）」。
// 予定のない時間帯は返さない
export function groupBySlot(items) {
  const groups = SLOTS.map((slot) => ({ slot, untimed: [], timed: [] }));
  const bySlot = Object.fromEntries(groups.map((g) => [g.slot, g]));
  (items || []).forEach((it, index) => {
    const g = bySlot[slotOf(it)];
    if (hasTime(it)) g.timed.push({ it, index });
    else g.untimed.push(it);
  });
  return groups
    .map((g) => ({
      slot: g.slot,
      untimed: g.untimed,
      // 同じ時刻は元の順番のまま
      timed: g.timed.sort((a, b) => toMinutes(a.it.time) - toMinutes(b.it.time) || a.index - b.index).map((x) => x.it),
    }))
    .filter((g) => g.untimed.length || g.timed.length);
}

// ドラッグで並べ替えたあと：ある時間帯の「時刻のない予定」を orderedIds の順にする。
// それ以外の予定の位置は変えない
export function reorderUntimed(items, slot, orderedIds) {
  const isTarget = (it) => !hasTime(it) && slotOf(it) === slot;
  const byId = new Map(items.filter(isTarget).map((it) => [it.id, it]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  // 並べ替え後の一覧に無いもの（念のため）は後ろに残す
  for (const it of byId.values()) if (!ordered.includes(it)) ordered.push(it);
  let k = 0;
  return items.map((it) => (isTarget(it) ? ordered[k++] : it));
}

// 出発リミット：時刻のある飛行機の前に、時刻のある移動（電車・バス・フェリー・車）があれば、
// いちばん近い移動の出発時刻 − 余裕（leaveBufferMin、初期値10分）
export function departureLimits(items) {
  const list = (items || []).filter(hasTime);
  const flights = list.filter((it) => it.kind === 'flight');
  const result = [];
  for (const flight of flights) {
    const f = toMinutes(flight.time);
    const moves = list
      .filter((it) => TRANSPORT_KINDS.includes(it.kind) && it.status !== 'skipped' && toMinutes(it.time) < f)
      .sort((a, b) => toMinutes(b.time) - toMinutes(a.time));
    const move = moves[0];
    if (!move) continue;
    const buffer = Number.isFinite(move.leaveBufferMin) && move.leaveBufferMin >= 0 ? move.leaveBufferMin : DEFAULT_BUFFER_MIN;
    const time = fromMinutes(toMinutes(move.time) - buffer);
    result.push({
      time,
      buffer,
      flight,
      move,
      reason: `${flight.time}発の${KIND_WORDS.flight}に間に合う${move.time}の${KIND_WORDS[move.kind]}から逆算（余裕${buffer}分）`,
    });
  }
  return result;
}
