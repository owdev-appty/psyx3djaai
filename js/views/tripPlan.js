// 旅の画面：Plan（行程）
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { getSeenDay, setSeenDay } from '../uiState.js';
import { formatDay } from '../logic/dates.js';
import { safeUrl } from '../logic/url.js';
import { tripDates } from '../logic/trips.js';
import { groupBySlot, reorderUntimed, SLOT_LABELS, hasTime, pickDay } from '../logic/plan.js';
import { formatYen, formatMiles } from '../logic/money.js';
import { makeSortable } from '../ui/sortable.js';
import { onTextInput } from '../ui/ime.js';
import { thumbsRow, bindThumbs } from '../ui/thumbs.js';
import { kindClass, kindIcon, kindName } from '../ui/kind.js';
import { samePlaceHtml, bindSamePlace } from './samePlace.js';
import { ITEM_STATUS_LABELS } from '../labels.js';
import { openItemForm, itemsOf, findItem, UNSCHEDULED } from './itemForm.js';

export const STATUS_CHIP = { booked: 'chip-booked', considering: 'chip-considering', todo: 'chip-todo', done: 'chip-plain', skipped: 'chip-plain' };


export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function bookingSummary(b) {
  if (!b) return '';
  const parts = [];
  if (b.number) parts.push(esc(b.number));
  if (b.from || b.to) parts.push(`${esc(b.from || '')} → ${esc(b.to || '')}`);
  if (Number.isFinite(b.priceYen)) parts.push(`<span class="num">${formatYen(b.priceYen)}</span>`);
  if (Number.isFinite(b.miles) && b.miles) parts.push(`<span class="num">${formatMiles(b.miles)}</span>`);
  return parts.length ? `<p class="item-booking">${parts.join(' · ')}</p>` : '';
}

function itemCard(it, { draggable }) {
  const timed = hasTime(it);
  const status = it.status && ITEM_STATUS_LABELS[it.status]
    ? `<span class="status-chip ${STATUS_CHIP[it.status]}">${ITEM_STATUS_LABELS[it.status]}</span>` : '';
  return `
    <li class="item ${kindClass(it.kind)} ${it.status === 'skipped' ? 'is-skipped' : ''}" data-id="${esc(it.id)}">
      <div class="item-side">
        ${timed
          ? `<time class="item-time">${esc(it.time)}</time>${it.endTime ? `<span class="item-end mono">${esc(it.endTime)}</span>` : ''}`
          : draggable ? `<span class="drag" aria-label="並べ替え" role="img">${icon('grip')}</span>` : ''}
      </div>
      <button type="button" class="item-main" data-act="edit" aria-label="${esc(kindName(it.kind))}：${esc(it.title || '予定')} Edit">
        <span class="item-head">
          ${kindIcon(it.kind, { named: true })}
          <span class="item-title">${esc(it.title || '（名前なし）')}</span>
          ${status}
        </span>
        ${it.note ? `<span class="item-note">${esc(it.note)}</span>` : ''}
        ${bookingSummary(it.booking)}
      </button>
      ${safeUrl(it.url) ? `<a class="item-link" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${esc(hostOf(it.url))}</span></a>` : ''}
      ${thumbsRow(it.attachments)}
    </li>`;
}

// daySlot：日付の列を出す場所（旅の画面の、上に止まるタブのすぐ下）。なければ Plan の中に出す
export function render(el, trip, { daySlot = null } = {}) {
  const dates = tripDates(trip);
  const dayKey = pickDay(getSeenDay(trip.id), dates, UNSCHEDULED);
  const isUnscheduled = dayKey === UNSCHEDULED;
  const day = isUnscheduled ? null : (trip.days || []).find((d) => d.date === dayKey);
  const items = isUnscheduled ? trip.unscheduled || [] : day?.items || [];
  const groups = groupBySlot(items);

  const chips = [
    ...dates.map((d, i) => `
      <button type="button" class="day-chip" data-day="${esc(d)}" aria-pressed="${d === dayKey}">
        <span class="mono">${esc(formatDay(d))}</span><span class="day-n">${i + 1}日目</span>
      </button>`),
    `<button type="button" class="day-chip" data-day="${UNSCHEDULED}" aria-pressed="${isUnscheduled}">
       <span>日程未定</span><span class="day-n">${(trip.unscheduled || []).length || ''}</span>
     </button>`,
  ].join('');

  el.innerHTML = `
    ${samePlaceHtml(trip)}
    ${daySlot ? '' : `<div class="day-chips" role="group" aria-label="Day">${chips}</div>`}
    ${isUnscheduled ? '' : `
      <label class="day-notes">
        <span class="section-title">Day notes</span>
        <textarea class="input autogrow" name="dayNotes" rows="2" placeholder="思いついたことをそのまま">${esc(day?.dayNotes || '')}</textarea>
      </label>`}
    ${groups.map((g) => `
      <section class="slot" data-slot="${g.slot}">
        <h3 class="slot-title">${SLOT_LABELS[g.slot]}</h3>
        <ul class="items items-untimed" data-slot="${g.slot}">${g.untimed.map((it) => itemCard(it, { draggable: g.untimed.length > 1 })).join('')}</ul>
        <ul class="items">${g.timed.map((it) => itemCard(it, { draggable: false })).join('')}</ul>
      </section>`).join('')}
    ${items.length ? '' : '<p class="empty-line">まだ予定がありません</p>'}
    <button type="button" class="btn btn-primary btn-block add-plan" data-act="add">＋ Add plan</button>`;

  if (daySlot) daySlot.innerHTML = `<div class="day-chips" role="group" aria-label="Day">${chips}</div>`;
  const dayBox = daySlot || el;
  const rerender = () => render(el, store.data.trips.find((t) => t.id === trip.id) || trip, { daySlot });

  bindThumbs(el);
  bindSamePlace(el, trip, () => rerender());

  // 日の切り替え
  dayBox.querySelectorAll('.day-chip').forEach((b) => b.addEventListener('click', () => {
    setSeenDay(trip.id, b.dataset.day);
    rerender();
  }));
  // 選んでいる日が見える位置へ（横だけ動かす。ページは縦に動かさない）
  const row = dayBox.querySelector('.day-chips');
  const on = row?.querySelector('.day-chip[aria-pressed="true"]');
  if (row && on) row.scrollLeft = Math.max(0, on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);

  // Day notes：入力のたびに保存（iPhone のキーボードでは keydown が当てにならないので input を使う）
  const notes = el.querySelector('[name="dayNotes"]');
  if (notes) {
    const grow = () => { notes.style.height = 'auto'; notes.style.height = `${notes.scrollHeight}px`; };
    grow();
    notes.addEventListener('input', grow);
    onTextInput(notes, () => {
      const value = notes.value;
      store.update((d) => {
        const t = d.trips.find((x) => x.id === trip.id);
        if (!t) return;
        itemsOf(t, dayKey); // 日がなければ作る
        t.days.find((x) => x.date === dayKey).dayNotes = value;
      });
    });
  }

  // 予定の追加・編集
  el.querySelector('[data-act="add"]').addEventListener('click', () => {
    openItemForm(trip.id, dayKey, null, { onSaved: rerender });
  });
  el.querySelectorAll('.item [data-act="edit"]').forEach((b) => b.addEventListener('click', () => {
    const id = b.closest('.item').dataset.id;
    const loc = findItem(trip, id);
    if (!loc) return;
    openItemForm(trip.id, loc.dayKey, loc.list[loc.index], {
      onSaved: (target) => {
        if (target && target !== dayKey) setSeenDay(trip.id, dayKey); // 移動しても今の日のまま
        rerender();
      },
    });
  }));

  // 時刻のない予定は、同じ時間帯の中でドラッグして並べ替えられる
  el.querySelectorAll('.items-untimed').forEach((ul) => {
    if (ul.children.length < 2) return;
    makeSortable(ul, {
      onEnd: () => {
        const ids = [...ul.querySelectorAll('.item')].map((li) => li.dataset.id);
        store.update((d) => {
          const t = d.trips.find((x) => x.id === trip.id);
          if (!t) return;
          const list = itemsOf(t, dayKey);
          const next = reorderUntimed(list, ul.dataset.slot, ids);
          list.splice(0, list.length, ...next);
        });
      },
    });
  });
}
