// 旅の画面：Money（お金）
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { dateRange } from './home.js';
import { toISODate } from '../logic/dates.js';
import {
  tripTotals, perNight, byCategory, memoTotalDiff, unloggedCount, compareSamePlace,
  expenseAmountText, formatYen, formatMiles,
} from '../logic/money.js';
import { EXPENSE_CATEGORY_LABELS, PAYMENT_LABELS } from '../labels.js';
import { openExpenseForm, toggleLogged } from './expenseForm.js';

// 支出の1行。sub を渡すと分類の代わりにそれを出す（下のタブの Money で旅の名前を出す）
export function expenseRow(trip, e, settings, { sub } = {}) {
  const meta = sub ?? [
    EXPENSE_CATEGORY_LABELS[e.category] || EXPENSE_CATEGORY_LABELS.other,
    e.payment && e.payment !== 'cashcard' ? PAYMENT_LABELS[e.payment] : '',
    e.approx ? '概算' : '',
  ].filter(Boolean).join(' · ');
  // 外貨は「300,000₫」「≈ 1,765円」の2行に分ける（数字の途中で折り返さないように）
  const parts = expenseAmountText(e, trip, settings).split(' ≈ ').map((x, i) => (i ? `≈ ${x}` : x)).filter(Boolean);
  if (Number.isFinite(e.miles) && e.miles) parts.push(`${parts.length ? '+ ' : ''}${formatMiles(e.miles)}`);
  const amount = parts.map((x) => `<span class="amt-part">${esc(x)}</span>`).join('');
  const logged = e.logged === true;
  return `
    <li class="expense" data-trip="${esc(trip.id)}" data-exp="${esc(e.id)}">
      <button type="button" class="expense-main" data-act="edit-exp">
        <span class="row-main">
          <span class="row-title">${esc(e.title || '（名前なし）')}</span>
          <span class="row-sub">${esc(meta)}</span>
        </span>
        <span class="expense-amount num">${amount}</span>
      </button>
      <button type="button" class="logged-btn ${logged ? 'is-on' : ''}" data-act="logged" aria-pressed="${logged}">家計簿済</button>
    </li>`;
}

// 支出の行のボタン（編集・家計簿済）をつなぐ
export function bindExpenseRows(el, rerender) {
  el.querySelectorAll('.expense').forEach((li) => {
    const { trip: tripId, exp } = li.dataset;
    li.querySelector('[data-act="logged"]').addEventListener('click', () => {
      toggleLogged(tripId, exp);
      rerender();
    });
    li.querySelector('[data-act="edit-exp"]').addEventListener('click', () => {
      const t = store.data.trips.find((x) => x.id === tripId);
      const e = t?.expenses.find((x) => x.id === exp);
      if (e) openExpenseForm(tripId, e, { onSaved: rerender });
    });
  });
}

// 分類ごとの横棒（1系列なので凡例は出さず、各行に分類名と金額を書く）
function bars(rows) {
  const max = Math.max(...rows.map((r) => r.yen), 0);
  return `
    <ul class="bars" aria-label="分類ごとの合計">
      ${rows.map((r) => `
        <li class="bar-row ${r.yen ? '' : 'is-zero'}">
          <span class="bar-label">${EXPENSE_CATEGORY_LABELS[r.category]}</span>
          <span class="bar-track" aria-hidden="true"><span class="bar" style="width:${max ? Math.max(r.yen > 0 ? 2 : 0, (r.yen / max) * 100).toFixed(1) : 0}%"></span></span>
          <span class="bar-value num">${formatYen(r.yen)}</span>
        </li>`).join('')}
    </ul>`;
}

export function compareTable(rows) {
  return `
    <div class="card compare">
      <table>
        <thead><tr><th scope="col"></th><th scope="col">泊数</th><th scope="col">合計</th><th scope="col">1泊あたり</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr class="${r.current ? 'is-current' : ''}">
              <th scope="row"><span class="compare-title">${esc(r.trip.title || '（名前なし）')}</span><span class="compare-date mono">${esc(dateRange(r.trip, { yearIfNotThisYear: true }))}</span></th>
              <td class="num">${r.nights}</td>
              <td class="num">${formatYen(r.yen)}</td>
              <td class="num">${formatYen(r.perNight)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

export function render(el, trip) {
  const settings = store.data.settings;
  const { yen, miles } = tripTotals(trip, settings);
  const pn = perNight(trip, settings);
  const memo = memoTotalDiff(trip, settings);
  const unlogged = unloggedCount(trip);
  const expenses = trip.expenses || [];
  const compare = compareSamePlace(trip, store.data.trips, settings, toISODate(new Date()));

  el.innerHTML = `
    ${unlogged ? `<p class="counts"><span class="status-chip chip-todo">家計簿 未転記 <span class="num">${unlogged}</span>件</span></p>` : ''}
    <div class="card money-card">
      <dl class="stats stats-top">
        <div class="wide"><dt>Total</dt><dd class="num money-total">${formatYen(yen)}</dd></div>
        <div><dt>Miles</dt><dd class="num">${formatMiles(miles)}</dd></div>
        <div><dt>Per night</dt><dd class="num">${pn === null ? '–' : formatYen(pn)}</dd></div>
      </dl>
      ${memo !== null ? `<p class="hint">メモの合計：<span class="num">${formatYen(memo)}</span></p>` : ''}
      ${expenses.length ? bars(byCategory(trip, settings)) : ''}
    </div>

    <section class="section" aria-labelledby="sec-exp">
      <h2 class="section-title" id="sec-exp">Expenses</h2>
      ${expenses.length ? `<ul class="list card expenses">${expenses.map((e) => expenseRow(trip, e, settings)).join('')}</ul>`
        : '<p class="empty-line">まだ支出がありません</p>'}
      <button type="button" class="btn btn-primary btn-block add-plan" data-act="add-exp">＋ Add expense</button>
    </section>

    ${compare.length ? `
      <section class="section" aria-labelledby="sec-compare">
        <h2 class="section-title" id="sec-compare">過去の旅</h2>
        ${compareTable(compare)}
        <p class="hint">同じ場所の終わった旅と比べています（日帰りと行かなかった旅は除く）</p>
      </section>` : ''}`;

  const rerender = () => render(el, store.data.trips.find((t) => t.id === trip.id) || trip);
  bindExpenseRows(el, rerender);
  el.querySelector('[data-act="add-exp"]').addEventListener('click', () => openExpenseForm(trip.id, null, { onSaved: rerender }));
}
