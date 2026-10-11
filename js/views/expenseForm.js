// 支出の追加・編集のシート
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { esc } from '../ui/dom.js';
import { openSheet, bindChoice, chip } from '../ui/sheet.js';
import { confirmDelete } from '../ui/modal.js';
import { parseAmount, rateFor, foreignToYen, formatYen } from '../logic/money.js';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, PAYMENTS, PAYMENT_LABELS } from '../labels.js';

const YEN = 'JPY';

// 選べる通貨：円 ＋ 設定と旅のレートにある通貨（＋その支出の通貨）
function currencies(trip, settings, extra) {
  const set = new Set([...Object.keys(settings?.fxRates || {}), ...Object.keys(trip?.fxRates || {})]);
  if (extra && extra !== YEN) set.add(extra);
  return [YEN, ...[...set].sort()];
}

// expense が null なら追加
export function openExpenseForm(tripId, expense, { onSaved } = {}) {
  const isNew = !expense;
  const trip = store.data.trips.find((t) => t.id === tripId);
  if (!trip) return;
  const settings = store.data.settings;
  const e = expense || { title: '', category: null, amountYen: null, miles: null, foreign: null, payment: 'cashcard', logged: false, approx: false, note: '' };
  const cur0 = e.foreign?.currency || YEN;
  const amount0 = e.foreign ? e.foreign.amount : e.amountYen;
  const codes = currencies(trip, settings, cur0);
  const rateOf = (c) => rateFor(c, trip, settings);

  const body = `
    <label class="field">
      <span class="field-label">Title</span>
      <input class="input" name="title" value="${esc(e.title || '')}" autocomplete="off">
    </label>
    <div class="field-row field-row-amount">
      <label class="field">
        <span class="field-label">Amount</span>
        <input class="input mono" name="amount" value="${Number.isFinite(amount0) ? esc(amount0) : ''}" inputmode="decimal" autocomplete="off">
      </label>
      <label class="field">
        <span class="field-label">Currency</span>
        <select class="input" name="currency">
          ${codes.map((c) => `<option value="${esc(c)}" ${c === cur0 ? 'selected' : ''}>${c === YEN ? '円' : esc(c)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="field rate-field" data-rate ${cur0 === YEN ? 'hidden' : ''}>
      <span class="field-label">Rate</span>
      <div class="rate-row">
        <span class="mono">1円 =</span>
        <input class="input mono rate-input" name="rate" inputmode="decimal" autocomplete="off" value="${esc(rateOf(cur0) ?? '')}">
        <span class="mono" data-rate-code>${esc(cur0)}</span>
      </div>
      <p class="hint hint-sheet"><span data-preview></span>レートを変えると、この旅だけに使います</p>
    </div>
    ${codes.length === 1 ? '<p class="hint hint-sheet field-hint">外貨は Settings の Currency rates で追加できます</p>' : ''}
    <label class="field">
      <span class="field-label">Miles</span>
      <input class="input mono" name="miles" value="${Number.isFinite(e.miles) ? esc(e.miles) : ''}" inputmode="numeric" autocomplete="off">
    </label>
    <div class="field">
      <span class="field-label">Payment</span>
      <div class="chips" data-group="payment">
        ${PAYMENTS.map((p) => chip(p, PAYMENT_LABELS[p], (e.payment || 'cashcard') === p)).join('')}
      </div>
    </div>
    <div class="field">
      <span class="field-label">Category</span>
      <div class="chips" data-group="category">
        ${EXPENSE_CATEGORIES.map((c) => chip(c, EXPENSE_CATEGORY_LABELS[c], e.category === c)).join('')}
      </div>
    </div>
    <label class="check"><input type="checkbox" name="logged" ${e.logged === true ? 'checked' : ''}>家計簿済</label>
    <label class="check"><input type="checkbox" name="approx" ${e.approx === true ? 'checked' : ''}>概算</label>
    <label class="field">
      <span class="field-label">Note</span>
      <textarea class="input" name="note" rows="2">${esc(e.note || '')}</textarea>
    </label>
    ${isNew ? '' : '<button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>'}
    <p class="form-error" role="alert" hidden></p>`;

  openSheet({
    title: isNew ? 'Add expense' : 'Edit',
    body,
    onMount(root, close) {
      const get = (n) => root.querySelector(`[name="${n}"]`);
      const rateBox = root.querySelector('[data-rate]');
      const preview = root.querySelector('[data-preview]');
      // 外貨のとき：円での目安を出す
      const update = () => {
        const c = get('currency').value;
        rateBox.hidden = c === YEN;
        root.querySelector('[data-rate-code]').textContent = c;
        const yen = foreignToYen(parseAmount(get('amount').value), parseAmount(get('rate').value));
        preview.textContent = yen === null ? '' : `≈ ${formatYen(yen)}。`;
      };
      get('currency').addEventListener('change', () => {
        get('rate').value = rateOf(get('currency').value) ?? '';
        update();
      });
      get('amount').addEventListener('input', update);
      get('rate').addEventListener('input', update);
      update();
      root._payment = bindChoice(root, 'payment');
      root._category = bindChoice(root, 'category', { allowNone: true });
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDelete(e.title || '（名前なし）'))) return;
        store.update((d) => {
          const t = d.trips.find((x) => x.id === tripId);
          if (t) t.expenses = t.expenses.filter((x) => x.id !== e.id);
        });
        close();
        onSaved?.();
      });
      if (isNew) get('title').focus();
    },
    onSave(root) {
      const get = (n) => root.querySelector(`[name="${n}"]`);
      const err = root.querySelector('.form-error');
      const fail = (msg, focus) => {
        err.textContent = msg;
        err.hidden = false;
        if (focus) get(focus).focus();
        return false;
      };
      const title = get('title').value.trim();
      if (!title) return fail('タイトルを入れてください', 'title');
      const currency = get('currency').value;
      const amount = parseAmount(get('amount').value);
      const miles = parseAmount(get('miles').value);
      if (get('amount').value.trim() && amount === null) return fail('金額は数字で入れてください', 'amount');
      if (get('miles').value.trim() && miles === null) return fail('マイルは数字で入れてください', 'miles');
      if (amount === null && miles === null) return fail('金額かマイルを入れてください', 'amount');

      let rate = null;
      if (currency !== YEN && amount !== null) {
        rate = parseAmount(get('rate').value);
        if (!rate) return fail('レートを入れてください（1円あたりの外貨）', 'rate');
      }

      const fields = {
        title,
        category: root._category.get() || 'other',
        payment: root._payment.get() || 'cashcard',
        miles,
        logged: get('logged').checked,
        approx: get('approx').checked,
        note: get('note').value,
      };
      if (currency === YEN || amount === null) {
        fields.amountYen = amount ?? 0;
        fields.foreign = null;
      } else {
        fields.foreign = { amount, currency };
        // 外貨の金額と通貨が前と同じなら、記録してあった円をそのまま使う。変えたらレートで換算する
        const same = e.foreign && e.foreign.amount === amount && e.foreign.currency === currency;
        fields.amountYen = same && Number.isFinite(e.amountYen) ? e.amountYen : null;
      }

      store.update((d) => {
        const t = d.trips.find((x) => x.id === tripId);
        if (!t) return;
        // 旅だけのレート：設定と同じなら消す
        if (rate) {
          const base = d.settings.fxRates?.[currency];
          const own = { ...(t.fxRates || {}) };
          if (rate === base) delete own[currency];
          else own[currency] = rate;
          if (Object.keys(own).length) t.fxRates = own;
          else delete t.fxRates;
        }
        if (isNew) t.expenses.push({ id: newId(), ...fields });
        else {
          const i = t.expenses.findIndex((x) => x.id === e.id);
          if (i >= 0) t.expenses[i] = { ...t.expenses[i], ...fields };
        }
      });
      onSaved?.();
      return true;
    },
  });
}

// 家計簿済の切り替え
export function toggleLogged(tripId, expenseId) {
  store.update((d) => {
    const t = d.trips.find((x) => x.id === tripId);
    const x = t?.expenses.find((y) => y.id === expenseId);
    if (x) x.logged = x.logged !== true;
  });
}
