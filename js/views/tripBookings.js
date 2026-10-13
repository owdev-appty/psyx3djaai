// 旅の画面：Bookings（予約）
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { formatDay } from '../logic/dates.js';
import { bookingList, bookingStatusCounts, tripDates, bookingPresetFromCandidate, removeCandidate } from '../logic/trips.js';
import { formatYen, formatMiles, parseAmount, expenseOfItem, expensePresetFromItem, sortCandidatesByPrice, canAddToMoney, moneyLinkedText } from '../logic/money.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDelete } from '../ui/modal.js';
import { NO_AUTOCORRECT } from '../ui/ime.js';
import { thumbsRow, bindThumbs } from '../ui/thumbs.js';
import { kindClass, kindIcon, kindLabel } from '../ui/kind.js';
import { ITEM_STATUS_LABELS } from '../labels.js';
import { openItemForm, findItem, UNSCHEDULED } from './itemForm.js';
import { openExpenseForm } from './expenseForm.js';

// 候補を安い順に並べるか（アプリを開いている間だけ覚える）
let candByPrice = false;
import { openScreenshotImport } from './aiScreenshot.js';
import { safeUrl, urlForSave, URL_ERROR } from '../logic/url.js';
import { hostOf, STATUS_CHIP } from './tripPlan.js';

// カードで切り替えられる状態
const SWITCH = ['booked', 'considering', 'todo'];

function money(b) {
  const parts = [];
  if (Number.isFinite(b?.priceYen)) parts.push(formatYen(b.priceYen));
  if (Number.isFinite(b?.miles) && b.miles) parts.push(formatMiles(b.miles));
  return parts.join(' + ');
}

function bookingCard({ item: it, date }, trip) {
  const b = it.booking || {};
  // 予約の料金を Money に：入れた後は、その金額を出す（二重に入れないように）
  const exp = expenseOfItem(trip, it.id);
  const moneyHtml = exp
    ? `<span class="money-linked">Money に入れました（${esc(moneyLinkedText(exp))}）</span>`
    : canAddToMoney(trip, it) ? `
      <span class="to-money">
        <button type="button" class="btn btn-small btn-secondary" data-act="to-money">${icon('plusCircle')}Add to Money</button>
        <span class="to-money-hint">手で Money に入れていれば不要です</span>
      </span>` : '';
  const when = [date ? formatDay(date) : '日程未定', it.time ? `${it.time}${it.endTime ? `–${it.endTime}` : ''}` : ''].filter(Boolean).join(' ');
  const route = b.from || b.to ? `${b.from || ''} → ${b.to || ''}` : '';
  const facts = [
    ['No.', b.number],
    ['Price', money(b), true],
    ['Cancellation', b.cancelPolicy],
    ['Payment', b.payNote],
    ['Booked via', b.provider],
    ['Note', b.note],
  ].filter(([, v]) => v);
  return `
    <li class="booking ${kindClass(it.kind)} ${it.status === 'skipped' ? 'is-skipped' : ''}" data-id="${esc(it.id)}">
      <button type="button" class="booking-main" data-act="edit" aria-label="${esc(it.title || '予定')} Edit">
        <span class="booking-when mono">${esc(when)}</span>
        <span class="item-head">
          ${kindIcon(it.kind)}
          ${kindLabel(it.kind)}
          <span class="item-title">${esc(it.title || '（名前なし）')}</span>
          ${it.status === 'done' || it.status === 'skipped' ? `<span class="status-chip chip-plain">${ITEM_STATUS_LABELS[it.status]}</span>` : ''}
        </span>
        ${route ? `<span class="booking-route">${esc(route)}</span>` : ''}
        ${facts.length ? `<dl class="facts">${facts.map(([k, v, num]) => `<div><dt>${k}</dt><dd class="${num ? 'num' : ''}">${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      </button>
      ${b.referenceNo ? `
        <div class="facts facts-ref"><div>
          <span class="fact-label">予約番号</span>
          <button type="button" class="ref-btn mono" data-act="ref" aria-label="予約番号を表示" aria-pressed="false">••••</button>
        </div></div>` : ''}
      <div class="booking-foot">
        <div class="chips chips-small" role="group" aria-label="Status">
          ${SWITCH.map((s) => `<button type="button" class="chip ${it.status === s ? STATUS_CHIP[s] : ''}" data-status="${s}" aria-pressed="${it.status === s}">${ITEM_STATUS_LABELS[s]}</button>`).join('')}
        </div>
        ${moneyHtml}
        ${safeUrl(it.url) ? `<a class="item-link" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${esc(hostOf(it.url))}</span></a>` : ''}
      </div>
      ${thumbsRow(it.attachments)}
    </li>`;
}

function candidateRow(c) {
  return `
    <li data-cand="${esc(c.id)}">
      <button type="button" class="row-link row-btn" data-act="cand">
        <span class="row-main">
          <span class="row-title">${esc(c.title || '（名前なし）')}</span>
          ${c.detail ? `<span class="row-sub cand-detail">${esc(c.detail)}</span>` : ''}
        </span>
        ${Number.isFinite(c.priceYen) ? `<span class="row-amount num">${esc(formatYen(c.priceYen))}</span>` : ''}
      </button>
      ${safeUrl(c.url) ? `<a class="item-link cand-link" href="${esc(safeUrl(c.url))}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${esc(hostOf(c.url))}</span></a>` : ''}
    </li>`;
}

// 候補の追加・編集。Edit には「Book this」（この候補で予約：予定と予約の欄に移し、この候補は消す）
function openCandidateForm(tripId, cand, onSaved) {
  const isNew = !cand;
  const c = cand || { title: '', detail: '', url: '', priceYen: null };
  openSheet({
    title: isNew ? '候補を追加' : 'Edit',
    body: `
      <label class="field"><span class="field-label">Title</span><input class="input" name="title" value="${esc(c.title)}" autocomplete="off"></label>
      <label class="field"><span class="field-label">Price（円）</span><input class="input mono" name="price" value="${esc(Number.isFinite(c.priceYen) ? c.priceYen : '')}" inputmode="numeric" ${NO_AUTOCORRECT}></label>
      <label class="field"><span class="field-label">Detail</span><textarea class="input" name="detail" rows="3">${esc(c.detail || '')}</textarea></label>
      <label class="field"><span class="field-label">Link</span><input class="input" type="url" name="url" value="${esc(c.url || '')}" ${NO_AUTOCORRECT} inputmode="url"></label>
      ${isNew ? '' : `
        <button type="button" class="btn btn-primary btn-block" data-act-book>Book this</button>
        <p class="hint hint-sheet">この候補を予定（予約済み）にします。Price は予約の Price に入り、この候補は候補から消えます</p>
        <button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>`}
      <p class="form-error" role="alert" hidden></p>`,
    onMount(root, close, focusWhenOpen) {
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDelete(c.title || '（名前なし）'))) return;
        store.update((d) => {
          const t = d.trips.find((x) => x.id === tripId);
          if (t) t.candidates = t.candidates.filter((x) => x.id !== c.id);
        });
        close();
        onSaved();
      });
      // Book this：このシートの今の値で予定のシートを開く（直した Price なども使う）。予定を保存したときだけ候補を消す
      root.querySelector('[data-act-book]')?.addEventListener('click', () => {
        const get = (n) => root.querySelector(`[name="${n}"]`).value;
        const err = root.querySelector('.form-error');
        const priceYen = parseAmount(get('price'));
        if (get('price').trim() && priceYen === null) { err.textContent = 'Price は数字で入れてください'; err.hidden = false; return; }
        const url = urlForSave(get('url'));
        if (url === null) { err.textContent = URL_ERROR; err.hidden = false; return; }
        const t = store.data.trips.find((x) => x.id === tripId);
        const day = tripDates(t)[0] || UNSCHEDULED;
        close();
        openItemForm(tripId, day, null, {
          from: 'bookings',
          preset: bookingPresetFromCandidate({ title: get('title').trim() || c.title || '', detail: get('detail'), url, priceYen }),
          onSaved: () => {
            store.update((d) => { removeCandidate(d.trips.find((x) => x.id === tripId), c.id); });
            onSaved();
          },
        });
      });
      if (isNew) focusWhenOpen(root.querySelector('[name="title"]'));
    },
    onSave(root) {
      const get = (n) => root.querySelector(`[name="${n}"]`).value;
      const title = get('title').trim();
      if (!title) {
        const err = root.querySelector('.form-error');
        err.textContent = 'タイトルを入れてください';
        err.hidden = false;
        return false;
      }
      const priceYen = parseAmount(get('price'));
      if (get('price').trim() && priceYen === null) {
        const err = root.querySelector('.form-error');
        err.textContent = 'Price は数字で入れてください';
        err.hidden = false;
        return false;
      }
      const url = urlForSave(get('url'));
      if (url === null) {
        const err = root.querySelector('.form-error');
        err.textContent = URL_ERROR;
        err.hidden = false;
        return false;
      }
      const fields = { title, detail: get('detail'), url, priceYen };
      store.update((d) => {
        const t = d.trips.find((x) => x.id === tripId);
        if (!t) return;
        if (isNew) t.candidates.push({ id: newId(), ...fields });
        else {
          const i = t.candidates.findIndex((x) => x.id === c.id);
          if (i >= 0) t.candidates[i] = { ...t.candidates[i], ...fields };
        }
      });
      onSaved();
      return true;
    },
  });
}

export function render(el, trip) {
  const list = bookingList(trip);
  const n = bookingStatusCounts(trip);
  const cands = trip.candidates || [];

  el.innerHTML = `
    <div class="two-buttons booking-adds">
      <button type="button" class="btn btn-secondary ai-entry" data-act="ai-shot">${icon('image')}Add from screenshot</button>
      <button type="button" class="btn btn-secondary ai-entry" data-act="add-booking">＋ Add booking</button>
    </div>
    <p class="counts">${ITEM_STATUS_LABELS.booked} <span class="num">${n.booked}</span><span class="dot">·</span>To do <span class="num">${n.todo}</span><span class="dot">·</span>${ITEM_STATUS_LABELS.considering} <span class="num">${n.considering}</span></p>
    ${list.length ? `<ul class="bookings">${list.map((x) => bookingCard(x, trip)).join('')}</ul>`
      : '<p class="empty-line">予約はまだありません。Plan で移動・宿の予定を足すと、ここに出ます</p>'}
    <section class="section" aria-labelledby="sec-cand">
      <div class="area-head">
        <h2 class="section-title" id="sec-cand">候補</h2>
        ${cands.filter((c) => Number.isFinite(c.priceYen)).length > 1 ? `<button type="button" class="chip chip-xs" data-act="cand-sort" aria-pressed="${candByPrice}">安い順</button>` : ''}
      </div>
      ${cands.length ? `<ul class="list card cands">${(candByPrice ? sortCandidatesByPrice(cands) : cands).map(candidateRow).join('')}</ul>` : ''}
      <button type="button" class="btn btn-secondary btn-block add-cand" data-act="add-cand">＋ 候補を追加</button>
    </section>`;

  bindThumbs(el);
  const current = () => store.data.trips.find((t) => t.id === trip.id) || trip;
  const rerender = () => render(el, current());

  // 予約番号：タップで表示・もう一度で隠す（表示は保存しない）
  el.querySelectorAll('[data-act="ref"]').forEach((b) => b.addEventListener('click', () => {
    const shown = b.getAttribute('aria-pressed') === 'true';
    const loc = findItem(current(), b.closest('.booking').dataset.id);
    b.textContent = shown ? '••••' : loc?.list[loc.index].booking?.referenceNo || '';
    b.setAttribute('aria-pressed', String(!shown));
    b.setAttribute('aria-label', shown ? '予約番号を表示' : '予約番号を隠す');
  }));

  // 状態の切り替え（同じものをもう一度押すと外す）
  el.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => {
    const id = b.closest('.booking').dataset.id;
    store.update((d) => {
      const t = d.trips.find((x) => x.id === trip.id);
      const loc = t && findItem(t, id);
      if (!loc) return;
      const it = loc.list[loc.index];
      it.status = it.status === b.dataset.status ? null : b.dataset.status;
    });
    rerender();
  }));

  el.querySelectorAll('.booking [data-act="edit"]').forEach((b) => b.addEventListener('click', () => {
    const loc = findItem(current(), b.closest('.booking').dataset.id);
    if (loc) openItemForm(trip.id, loc.dayKey, loc.list[loc.index], { onSaved: rerender, from: 'bookings' });
  }));

  el.querySelector('[data-act="ai-shot"]').addEventListener('click', () => openScreenshotImport(trip.id, rerender));
  // 予約を手で足す（Kind は Flight から。Day は旅の初日）
  el.querySelector('[data-act="add-booking"]').addEventListener('click', () => {
    openItemForm(trip.id, tripDates(current())[0] || UNSCHEDULED, null, { from: 'bookings', preset: { kind: 'flight', status: 'booked' }, onSaved: rerender });
  });
  // 予約の料金を Money に（Add expense を、料金を入れた状態で開く）
  el.querySelectorAll('[data-act="to-money"]').forEach((b) => b.addEventListener('click', () => {
    const loc = findItem(current(), b.closest('.booking').dataset.id);
    if (loc) openExpenseForm(trip.id, null, { preset: expensePresetFromItem(loc.list[loc.index]), onSaved: rerender });
  }));
  el.querySelector('[data-act="cand-sort"]')?.addEventListener('click', () => { candByPrice = !candByPrice; rerender(); });
  el.querySelector('[data-act="add-cand"]').addEventListener('click', () => openCandidateForm(trip.id, null, rerender));
  el.querySelectorAll('[data-act="cand"]').forEach((b) => b.addEventListener('click', () => {
    const c = (current().candidates || []).find((x) => x.id === b.closest('li').dataset.cand);
    if (c) openCandidateForm(trip.id, c, rerender);
  }));
}
