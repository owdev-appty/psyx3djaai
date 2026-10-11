// お金の計算（画面と分けた純粋な関数）。マイルストーン5で分類別・1泊あたりなどを足す

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

// 1件の支出の円。amountYen があればそれ、なければ外貨から換算
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

// 98025 → "98,025円"
export function formatYen(n) {
  return `${Math.round(n || 0).toLocaleString('ja-JP')}円`;
}

export function formatMiles(n) {
  return `${Math.round(n || 0).toLocaleString('en-US')} mi`;
}
