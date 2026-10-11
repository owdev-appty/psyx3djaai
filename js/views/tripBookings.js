// 旅の画面：Bookings（予約）
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { formatDay } from '../logic/dates.js';
import { bookingList, bookingStatusCounts } from '../logic/trips.js';
import { formatYen, formatMiles } from '../logic/money.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDelete } from '../ui/modal.js';
import { ITEM_STATUS_LABELS } from '../labels.js';
import { openItemForm, findItem } from './itemForm.js';
import { hostOf, STATUS_CHIP } from './tripPlan.js';

// カードで切り替えられる状態
const SWITCH = ['booked', 'considering', 'todo'];

function money(b) {
  const parts = [];
  if (Number.isFinite(b?.priceYen)) parts.push(formatYen(b.priceYen));
  if (Number.isFinite(b?.miles) && b.miles) parts.push(formatMiles(b.miles));
  return parts.join(' + ');
}

function bookingCard({ item: it, date }) {
  const b = it.booking || {};
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
    <li class="booking ${it.status === 'skipped' ? 'is-skipped' : ''}" data-id="${esc(it.id)}">
      <button type="button" class="booking-main" data-act="edit" aria-label="${esc(it.title || '予定')} Edit">
        <span class="booking-when mono">${esc(when)}</span>
        <span class="item-head">
          <span class="item-kind" aria-hidden="true">${icon(it.kind || 'other')}</span>
          <span class="item-title">${esc(it.title || '（名前なし）')}</span>
          ${it.status === 'done' || it.status === 'skipped' ? `<span class="status-chip chip-plain">${ITEM_STATUS_LABELS[it.status]}</span>` : ''}
        </span>
        ${route ? `<span class="booking-route">${esc(route)}</span>` : ''}
        ${facts.length ? `<dl class="facts">${facts.map(([k, v, num]) => `<div><dt>${k}</dt><dd class="${num ? 'num' : ''}">${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      </button>
      ${b.referenceNo ? `
        <div class="facts facts-ref"><div>
          <span class="fact-label">Reference no.</span>
          <button type="button" class="ref-btn mono" data-act="ref" aria-label="Show reference no." aria-pressed="false">••••</button>
        </div></div>` : ''}
      <div class="booking-foot">
        <div class="chips chips-small" role="group" aria-label="Status">
          ${SWITCH.map((s) => `<button type="button" class="chip ${it.status === s ? STATUS_CHIP[s] : ''}" data-status="${s}" aria-pressed="${it.status === s}">${ITEM_STATUS_LABELS[s]}</button>`).join('')}
        </div>
        ${it.url ? `<a class="item-link" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${esc(hostOf(it.url))}</span></a>` : ''}
      </div>
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
      </button>
      ${c.url ? `<a class="item-link cand-link" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${esc(hostOf(c.url))}</span></a>` : ''}
    </li>`;
}

function openCandidateForm(tripId, cand, onSaved) {
  const isNew = !cand;
  const c = cand || { title: '', detail: '', url: '' };
  openSheet({
    title: isNew ? 'Add candidate' : 'Edit',
    body: `
      <label class="field"><span class="field-label">Title</span><input class="input" name="title" value="${esc(c.title)}" autocomplete="off"></label>
      <label class="field"><span class="field-label">Detail</span><textarea class="input" name="detail" rows="3">${esc(c.detail || '')}</textarea></label>
      <label class="field"><span class="field-label">Link</span><input class="input" type="url" name="url" value="${esc(c.url || '')}" autocomplete="off" inputmode="url"></label>
      ${isNew ? '' : '<button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>'}
      <p class="form-error" role="alert" hidden></p>`,
    onMount(root, close) {
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDelete(c.title || '（名前なし）'))) return;
        store.update((d) => {
          const t = d.trips.find((x) => x.id === tripId);
          if (t) t.candidates = t.candidates.filter((x) => x.id !== c.id);
        });
        close();
        onSaved();
      });
      if (isNew) root.querySelector('[name="title"]').focus();
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
      const fields = { title, detail: get('detail'), url: get('url').trim() };
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
    <p class="counts">${ITEM_STATUS_LABELS.booked} <span class="num">${n.booked}</span><span class="dot">·</span>To do <span class="num">${n.todo}</span><span class="dot">·</span>${ITEM_STATUS_LABELS.considering} <span class="num">${n.considering}</span></p>
    ${list.length ? `<ul class="bookings">${list.map(bookingCard).join('')}</ul>`
      : '<p class="empty-line">予約はまだありません。Plan で移動・宿の予定を足すと、ここに出ます</p>'}
    <section class="section" aria-labelledby="sec-cand">
      <h2 class="section-title" id="sec-cand">Candidates</h2>
      ${cands.length ? `<ul class="list card cands">${cands.map(candidateRow).join('')}</ul>` : ''}
      <button type="button" class="btn btn-secondary btn-block add-cand" data-act="add-cand">＋ Add candidate</button>
    </section>`;

  const current = () => store.data.trips.find((t) => t.id === trip.id) || trip;
  const rerender = () => render(el, current());

  // 予約番号：タップで表示・もう一度で隠す（表示は保存しない）
  el.querySelectorAll('[data-act="ref"]').forEach((b) => b.addEventListener('click', () => {
    const shown = b.getAttribute('aria-pressed') === 'true';
    const loc = findItem(current(), b.closest('.booking').dataset.id);
    b.textContent = shown ? '••••' : loc?.list[loc.index].booking?.referenceNo || '';
    b.setAttribute('aria-pressed', String(!shown));
    b.setAttribute('aria-label', shown ? 'Show reference no.' : 'Hide reference no.');
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
    if (loc) openItemForm(trip.id, loc.dayKey, loc.list[loc.index], { onSaved: rerender });
  }));

  el.querySelector('[data-act="add-cand"]').addEventListener('click', () => openCandidateForm(trip.id, null, rerender));
  el.querySelectorAll('[data-act="cand"]').forEach((b) => b.addEventListener('click', () => {
    const c = (current().candidates || []).find((x) => x.id === b.closest('li').dataset.cand);
    if (c) openCandidateForm(trip.id, c, rerender);
  }));
}
