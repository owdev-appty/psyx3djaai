// お金の計算（画面と分けた純粋な関数）
import { nights, isDated } from './trips.js';
import { parseISODate } from './dates.js';
import { EXPENSE_CATEGORIES, PAYMENTS } from '../labels.js';

// 外貨 → 円。rate は「1円あたりの外貨」（例：VND 170 → 1円 = 170ドン）
export function foreignToYen(amount, rate) {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(amount / rate);
}

// 旅のレート（旅ごとに変えたもの）→ 設定のレート
export function rateFor(currency, trip, settings) {
  const own = trip?.fxRates?.[currency];
  if (Number.isFinite(own) && own > 0) return own;
  const base = settings?.fxRates?.[currency];
  return Number.isFinite(base) && base > 0 ? base : null;
}

// 支払い（複数選べる）。古いデータは文字1つ（'miles' など）なので、どちらも配列にして読む。
// 何もなければ「現金・カード」
export function paymentsOf(e) {
  const raw = Array.isArray(e?.payment) ? e.payment : e?.payment != null ? [e.payment] : [];
  const list = PAYMENTS.filter((p) => raw.includes(p)); // 決まった順番で、重なりなし
  return list.length ? list : ['cashcard'];
}

// 金額（円・外貨）を使う支払いか / マイルを使う支払いか
export const usesAmount = (payments) => payments.includes('cashcard') || payments.includes('subsidy');
export const usesMiles = (payments) => payments.includes('miles');

// 1件の支出の円。amountYen があればそれ（記録した円）、なければ外貨からレートで換算
export function expenseYen(e, trip, settings) {
  if (Number.isFinite(e?.amountYen)) return e.amountYen;
  if (e?.foreign && Number.isFinite(e.foreign.amount)) {
    return foreignToYen(e.foreign.amount, rateFor(e.foreign.currency, trip, settings));
  }
  return null;
}

export function tripTotals(trip, settings) {
  let yen = 0, miles = 0;
  for (const e of trip?.expenses || []) {
    yen += expenseYen(e, trip, settings) ?? 0;
    if (Number.isFinite(e?.miles)) miles += e.miles;
  }
  return { yen, miles };
}

// 1泊あたり（円）。泊数がない・日帰りなら null
export function perNight(trip, settings) {
  const n = nights(trip);
  if (!n) return null;
  return Math.round(tripTotals(trip, settings).yen / n);
}

// 分類ごとの合計。6つの分類をいつも同じ順で返す（知らない分類は「その他」に入れる）
export function byCategory(trip, settings) {
  const sums = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0]));
  for (const e of trip?.expenses || []) {
    const c = EXPENSE_CATEGORIES.includes(e?.category) ? e.category : 'other';
    sums[c] += expenseYen(e, trip, settings) ?? 0;
  }
  return EXPENSE_CATEGORIES.map((category) => ({ category, yen: sums[category] }));
}

// メモに書いてあった合計が、計算した合計と違うときだけその値を返す
export function memoTotalDiff(trip, settings) {
  const memo = trip?.memoTotalYen;
  if (!Number.isFinite(memo)) return null;
  return memo === tripTotals(trip, settings).yen ? null : memo;
}

// 家計簿に未転記の支出（旅をまたいで）。旅の新しい順
export function unloggedExpenses(trips) {
  return [...(trips || [])]
    .sort((a, b) => (b.startDate || '9999').localeCompare(a.startDate || '9999'))
    .flatMap((trip) => (trip.expenses || []).filter((e) => e && e.logged !== true).map((expense) => ({ trip, expense })));
}

export const unloggedCount = (trip) => (trip?.expenses || []).filter((e) => e && e.logged !== true).length;

// 旅の支出をすべて家計簿済にする。済にした件数を返す
export function markAllLogged(trip) {
  let n = 0;
  for (const e of trip?.expenses || []) {
    if (e && e.logged !== true) { e.logged = true; n += 1; }
  }
  return n;
}

// 年ごとの合計（旅の開始日の年）。新しい年から。日程未定の旅は「日程未定」
export function totalsByYear(trips, settings) {
  const map = new Map();
  for (const t of trips || []) {
    if (!(t.expenses || []).length) continue;
    const key = parseISODate(t.startDate)?.y?.toString() ?? '日程未定';
    const cur = map.get(key) || { year: key, yen: 0, miles: 0, trips: 0 };
    const { yen, miles } = tripTotals(t, settings);
    cur.yen += yen; cur.miles += miles; cur.trips += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => (a.year === '日程未定' ? 1 : b.year === '日程未定' ? -1 : b.year.localeCompare(a.year)));
}

// 比べられる旅：日程があり、1泊以上で、支出があり、行かなかった旅ではないもの
const comparable = (t) => t.status !== 'cancelled' && isDated(t) && nights(t) > 0 && (t.expenses || []).length > 0;
// 終わった旅（Done、または最終日を過ぎた）。まだ支出が増えるかもしれない旅は比べない
const finished = (t, today) => t.status === 'done' || (isDated(t) && t.endDate < today);

function tripRow(t, settings) {
  const n = nights(t);
  const { yen, miles } = tripTotals(t, settings);
  return { trip: t, nights: n, yen, miles, perNight: Math.round(yen / n) };
}

// 同じ場所の終わった旅と1泊あたりを比べる。その旅自身も（比べられる形なら）入れる（current: true）。新しい順
export function compareSamePlace(trip, trips, settings, today) {
  const placeIds = new Set(trip?.placeIds || []);
  if (!placeIds.size) return [];
  const others = (trips || []).filter((t) => t.id !== trip.id && (t.placeIds || []).some((p) => placeIds.has(p)) && comparable(t) && finished(t, today));
  if (!others.length) return [];
  const rows = [...(comparable(trip) ? [trip] : []), ...others]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((t) => ({ ...tripRow(t, settings), current: t.id === trip.id }));
  return rows;
}

// 場所ごとの1泊あたり（その場所の終わった旅の合計 ÷ 泊数の合計）。高い順
export function perNightByPlace(trips, places, settings, today) {
  const out = [];
  for (const p of places || []) {
    const list = (trips || []).filter((t) => (t.placeIds || []).includes(p.id) && comparable(t) && finished(t, today));
    if (!list.length) continue;
    let yen = 0, n = 0;
    for (const t of list) { yen += tripTotals(t, settings).yen; n += nights(t); }
    out.push({ place: p, trips: list.length, nights: n, yen, perNight: Math.round(yen / n) });
  }
  return out.sort((a, b) => b.perNight - a.perNight);
}

// 入力された金額を数にする。"1,765" や全角数字も受け付ける。空や数でなければ null
export function parseAmount(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const t = String(s ?? '')
    .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[,，\s円]/g, '');
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

// 98025 → "98,025円"
export function formatYen(n) {
  return `${Math.round(n || 0).toLocaleString('ja-JP')}円`;
}

export function formatMiles(n) {
  return `${Math.round(n || 0).toLocaleString('en-US')} mi`;
}

// 外貨の記号。ないものは "300 XXX" の形
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€', KRW: '₩', TWD: 'NT$', THB: '฿', HKD: 'HK$', SGD: 'S$', CNY: '元', GBP: '£', PHP: '₱', MYR: 'RM', IDR: 'Rp', AUD: 'A$' };
const PREFIX = new Set(['USD', 'EUR', 'TWD', 'HKD', 'SGD', 'GBP', 'PHP', 'MYR', 'IDR', 'AUD']);

// 300000, 'VND' → "300,000₫"
export function formatForeign(amount, currency) {
  const n = Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const sym = SYMBOLS[currency];
  if (!sym) return `${n} ${currency}`;
  return PREFIX.has(currency) ? `${sym}${n}` : `${n}${sym}`;
}

// 支出の金額の表示："1,000円"、外貨は "300,000₫ ≈ 1,765円"
export function expenseAmountText(e, trip, settings) {
  const yen = expenseYen(e, trip, settings);
  if (e?.foreign && Number.isFinite(e.foreign.amount)) {
    const f = formatForeign(e.foreign.amount, e.foreign.currency);
    return yen === null ? f : `${f} ≈ ${formatYen(yen)}`;
  }
  return yen === null ? '' : formatYen(yen);
}
