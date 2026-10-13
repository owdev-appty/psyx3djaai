// 旅のまとめ（ホームの「次の旅」「To do」「Upcoming」「Planning」「過去の旅」など）。画面と分けた純粋な関数
import { parseISODate } from './dates.js';

const DAY_MS = 86400000;
const utc = (s) => {
  const p = parseISODate(s);
  return p ? Date.UTC(p.y, p.m - 1, p.d) : null;
};

export function addDays(iso, n) {
  const t = utc(iso);
  if (t === null) return null;
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}

// 2つの日付の差（日数）
export function diffDays(a, b) {
  const ta = utc(a), tb = utc(b);
  return ta === null || tb === null ? null : Math.round((tb - ta) / DAY_MS);
}

export function nights(trip) {
  const n = diffDays(trip?.startDate, trip?.endDate);
  return n === null || n < 0 ? null : n;
}

export function isDated(trip) {
  return !!(parseISODate(trip?.startDate) && parseISODate(trip?.endDate));
}

// 旅の日付の一覧（開始〜終了。days に範囲外の日があれば、それも入れる）
export function tripDates(trip) {
  const set = new Set();
  if (isDated(trip) && nights(trip) !== null && nights(trip) <= 366) {
    for (let d = trip.startDate; d <= trip.endDate; d = addDays(d, 1)) set.add(d);
  }
  for (const day of trip?.days || []) if (parseISODate(day.date)) set.add(day.date);
  return [...set].sort();
}

const ACTIVE = (t) => t.status !== 'done' && t.status !== 'cancelled';

// 次の旅：終わっていない・行かなかったわけではない旅のうち、まだ終わっていない日程でいちばん早いもの
export function nextTrip(trips, today) {
  return (trips || [])
    .filter((t) => ACTIVE(t) && isDated(t) && t.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || null;
}

// あと何日（出発日まで）。旅行中なら 0
export function daysUntil(trip, today) {
  const n = diffDays(today, trip?.startDate);
  return n === null ? null : Math.max(0, n);
}

export function isOngoing(trip, today) {
  return isDated(trip) && trip.startDate <= today && today <= trip.endDate;
}

// これからの旅：次の旅以外で、日程があり、まだ終わっていない旅（Booked / Planning / Idea を問わず）。日付順
export function upcomingTrips(trips, today) {
  const next = nextTrip(trips, today);
  return (trips || [])
    .filter((t) => ACTIVE(t) && isDated(t) && t.endDate >= today && t !== next)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// 計画中：日程未定の旅（日程のある旅は Next trip か Upcoming に出る）
export function planningTrips(trips, today) {
  return (trips || []).filter((t) => ACTIVE(t) && !isDated(t));
}

// 過去の旅：done・cancelled、または日程が過ぎたもの。年ごと（新しい順）
export function pastTripsByYear(trips, today) {
  const past = (trips || []).filter((t) => !ACTIVE(t) || (isDated(t) && t.endDate < today));
  const groups = new Map();
  for (const t of past.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))) {
    const year = parseISODate(t.startDate)?.y ?? null;
    const key = year === null ? '日程未定' : String(year);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups].map(([year, list]) => ({ year, trips: list }));
}

// ふりかえりの案内：最終日を過ぎたが、まだ done / cancelled にしていない旅
export function needsLookBack(trip, today) {
  return ACTIVE(trip) && isDated(trip) && trip.endDate < today;
}

// 旅のすべての予定（日ごと＋日程未定）
export function allItems(trip) {
  return [...(trip?.days || []).flatMap((d) => d.items || []), ...(trip?.unscheduled || [])];
}

// Bookings に出す予定：booking があるもの、または移動・宿の予定
export const BOOKING_KINDS = ['flight', 'train', 'bus', 'ferry', 'car', 'stay'];
export function bookingItems(trip) {
  return allItems(trip).filter((it) => it.booking || BOOKING_KINDS.includes(it.kind));
}

// Bookings の一覧：日付順（同じ日は時刻のあるものを時刻順で後ろに）、日程未定は最後。{ item, date }
export function bookingList(trip) {
  const rows = [
    ...(trip?.days || []).flatMap((d) => (d.items || []).map((item) => ({ item, date: d.date }))),
    ...(trip?.unscheduled || []).map((item) => ({ item, date: null })),
  ].filter(({ item }) => item.booking || BOOKING_KINDS.includes(item.kind));
  const key = ({ item, date }) => `${date || '9999-99-99'} ${item.time || ''}`;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => key(a.r).localeCompare(key(b.r)) || a.i - b.i).map((x) => x.r);
}

// 上部の件数：予約済み / To do / 検討中（やめたものは数えない）
export function bookingStatusCounts(trip) {
  const c = { booked: 0, todo: 0, considering: 0 };
  for (const it of bookingItems(trip)) if (it.status in c) c[it.status] += 1;
  return c;
}

// To do の予定：status が todo、または種類が todo で、済み・やめたでないもの
export function isTodoItem(it) {
  if (it.status === 'todo') return true;
  return it.kind === 'todo' && it.status !== 'done' && it.status !== 'skipped';
}

const isConsideringBooking = (it) => it.status === 'considering' && (!!it.booking || BOOKING_KINDS.includes(it.kind));

// いまやること：まだ終わっていない旅の To do の予定・未完了の todos・検討中の予約
export function todoNow(trips, today) {
  const out = [];
  for (const t of trips || []) {
    if (!ACTIVE(t) || (isDated(t) && t.endDate < today)) continue;
    const dayItems = [
      ...(t.days || []).flatMap((day) => (day.items || []).map((item) => ({ item, date: day.date }))),
      ...(t.unscheduled || []).map((item) => ({ item, date: null })),
    ];
    for (const { item, date } of dayItems) {
      if (isTodoItem(item)) out.push({ type: 'item', trip: t, item, date });
      else if (isConsideringBooking(item)) out.push({ type: 'considering', trip: t, item, date });
    }
    for (const todo of t.todos || []) if (!todo.done) out.push({ type: 'todo', trip: t, todo });
  }
  return out;
}

// ---------- Bookings から作る予定 ----------
// 空の予約（Bookings から作った予定は、予約の欄が空でも予約として付けて、Bookings の一覧に必ず出す）
export function emptyBooking() {
  return { provider: '', from: '', to: '', number: '', priceYen: null, miles: null, cancelPolicy: '', payNote: '', referenceNo: '', note: '' };
}
export function ensureBooking(booking) {
  return booking && typeof booking === 'object' ? booking : emptyBooking();
}

// 候補の「Book this」：候補のシートの今の値から、予定（予約済み）の初期値を作る
export function bookingPresetFromCandidate({ title = '', detail = '', url = '', priceYen = null } = {}) {
  return {
    title,
    status: 'booked',
    note: detail,
    url,
    booking: { ...emptyBooking(), priceYen: Number.isFinite(priceYen) ? priceYen : null },
  };
}

// 候補を消す（Book this で予定を保存したときだけ呼ぶ）
export function removeCandidate(trip, candidateId) {
  if (!trip) return false;
  const before = (trip.candidates || []).length;
  trip.candidates = (trip.candidates || []).filter((c) => c.id !== candidateId);
  return trip.candidates.length !== before;
}

