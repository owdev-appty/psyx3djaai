import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { formatDay, toISODate } from '../logic/dates.js';
import { nextTrip, daysUntil, isOngoing, nights, planningTrips, pastTripsByYear, needsLookBack, bookingCounts, todoNow } from '../logic/trips.js';
import { tripTotals, formatYen, formatMiles } from '../logic/money.js';
import { packingProgress } from '../logic/packing.js';
import { store } from '../appStore.js';
import { setUi } from '../uiState.js';
import { ITEM_STATUS_LABELS, TRIP_STATUS_LABELS } from '../labels.js';
import { brokenNotice, storageNotice } from './notices.js';
import { openTripForm } from './tripForm.js';

// 年は、年をまたぐ旅と、今年以外の旅（年ごとにまとめる過去の旅は除く）にだけ付ける
export function dateRange(t, { yearIfNotThisYear = true } = {}) {
  if (!t.startDate || !t.endDate) return '日程未定';
  const crossYear = t.startDate.slice(0, 4) !== t.endDate.slice(0, 4);
  const otherYear = yearIfNotThisYear && t.startDate.slice(0, 4) !== toISODate(new Date()).slice(0, 4);
  const a = formatDay(t.startDate, { withYear: crossYear || otherYear });
  const b = formatDay(t.endDate, { withYear: crossYear });
  return t.startDate === t.endDate ? a : `${a} – ${b}`;
}

export function nightsText(t) {
  const n = nights(t);
  return n === null ? '' : n === 0 ? '日帰り' : `${n}泊`;
}

function spentText(trip) {
  const { yen, miles } = tripTotals(trip, store.data.settings);
  return miles ? `${formatYen(yen)} + ${formatMiles(miles)}` : formatYen(yen);
}

function nextTripCard(t, today) {
  const b = bookingCounts(t);
  const p = packingProgress(t, store.data.packingItems);
  const until = isOngoing(t, today) ? '旅行中' : daysUntil(t, today) === 0 ? '今日から' : `あと${daysUntil(t, today)}日`;
  return `
    <section class="section" aria-labelledby="sec-next">
      <h2 class="section-title" id="sec-next">Next trip</h2>
      <a class="card card-link next-trip" href="#/trip/${esc(t.id)}/plan">
        <div class="next-head">
          <h3 class="display-title next-title">${esc(t.title || '（名前なし）')}</h3>
          <span class="pill pill-accent">${until}</span>
        </div>
        <p class="next-dates mono">${esc(dateRange(t))}${nightsText(t) ? `<span class="dot">·</span>${nightsText(t)}` : ''}</p>
        <dl class="stats">
          <div><dt>Bookings</dt><dd class="num">${b.booked}/${b.total}</dd></div>
          <div><dt>Packing</dt><dd class="num">${p.done}/${p.total}</dd></div>
          <div class="wide"><dt>Spent</dt><dd class="num">${esc(spentText(t))}</dd></div>
        </dl>
      </a>
    </section>`;
}

function lookBackNotices(trips, today) {
  const list = trips.filter((t) => needsLookBack(t, today));
  return list.map((t) => `
    <div class="notice notice-todo">
      <p>旅が終わりました。ふりかえりをしましょう</p>
      <div class="notice-row">
        <span class="display-title">${esc(t.title || '（名前なし）')}</span>
        <a class="btn btn-small btn-todo" href="#/trip/${esc(t.id)}/lookback">ふりかえり</a>
      </div>
    </div>`).join('');
}

function todoSection(trips, today) {
  const list = todoNow(trips, today);
  if (!list.length) return '';
  const row = (x) => {
    const title = x.type === 'todo' ? x.todo.text : x.item.title;
    const chipCls = x.type === 'considering' ? 'chip-considering' : 'chip-todo';
    const chipText = x.type === 'considering' ? ITEM_STATUS_LABELS.considering : 'To do';
    const href = `#/trip/${esc(x.trip.id)}/${x.type === 'todo' ? 'notes' : 'plan'}`;
    const day = x.type === 'todo' ? '' : x.date ? formatDay(x.date) : '日程未定';
    return `
      <li>
        <a class="row-link" href="${href}" data-trip="${esc(x.trip.id)}" data-date="${esc(x.date ?? '')}">
          <span class="status-chip ${chipCls}">${chipText}</span>
          <span class="row-main">
            <span class="row-title">${esc(title || '（名前なし）')}</span>
            <span class="row-sub">${esc(x.trip.title || '')}${day ? ` · <span class="mono">${esc(day)}</span>` : ''}</span>
          </span>
        </a>
      </li>`;
  };
  return `
    <section class="section" aria-labelledby="sec-todo">
      <h2 class="section-title" id="sec-todo">To do</h2>
      <ul class="list card">${list.map(row).join('')}</ul>
    </section>`;
}

function tripRow(t, { past = false } = {}) {
  const cancelled = t.status === 'cancelled';
  const meta = [dateRange(t, { yearIfNotThisYear: !past }), nightsText(t)].filter(Boolean).join(' · ');
  return `
    <li class="${cancelled ? 'is-cancelled' : ''}">
      <a class="row-link" href="#/trip/${esc(t.id)}/plan">
        <span class="row-main">
          <span class="row-title display-title">${esc(t.title || '（名前なし）')}</span>
          <span class="row-sub mono">${esc(meta)}</span>
        </span>
        ${cancelled ? `<span class="status-chip chip-plain">${TRIP_STATUS_LABELS.cancelled}</span>`
          : past ? `<span class="row-amount num">${esc(spentText(t))}</span>`
          : `<span class="status-chip chip-plain">${TRIP_STATUS_LABELS[t.status] || ''}</span>`}
      </a>
    </li>`;
}

export function render(el) {
  const today = toISODate(new Date());
  const ok = store.status === 'ok';
  const trips = ok ? store.data.trips : [];
  const next = nextTrip(trips, today);
  const planning = planningTrips(trips, today);
  const past = pastTripsByYear(trips, today);

  el.innerHTML = `
    <header class="topbar">
      <div>
        <h1 class="page-title">Trips</h1>
        <p class="page-sub"><time class="mono">${formatDay(today)}</time></p>
      </div>
      <div class="topbar-actions">
        ${ok ? '<button type="button" class="btn btn-small btn-secondary" data-act="new">＋ New trip</button>' : ''}
        <a class="icon-btn" href="#/settings" aria-label="Settings">${icon('settings')}</a>
      </div>
    </header>
    ${brokenNotice()}
    ${storageNotice()}
    ${lookBackNotices(trips, today)}
    ${next ? nextTripCard(next, today) : ''}
    ${todoSection(trips, today)}
    ${planning.length ? `
      <section class="section" aria-labelledby="sec-planning">
        <h2 class="section-title" id="sec-planning">Planning</h2>
        <ul class="list card">${planning.map((t) => tripRow(t)).join('')}</ul>
      </section>` : ''}
    ${past.length ? `
      <section class="section" aria-labelledby="sec-past">
        <h2 class="section-title" id="sec-past">過去の旅</h2>
        ${past.map((g) => `
          <h3 class="year-title mono">${esc(g.year)}</h3>
          <ul class="list card">${g.trips.map((t) => tripRow(t, { past: true })).join('')}</ul>`).join('')}
      </section>` : ''}
    ${trips.length ? '' : `
      <section class="empty">
        <img class="app-icon md" src="icons/icon.svg" alt="" width="64" height="64">
        <p>まだ旅がありません</p>
      </section>`}`;

  el.querySelector('[data-act="new"]')?.addEventListener('click', () => {
    openTripForm(null, { onSaved: (id) => { location.hash = `#/trip/${id}/plan`; } });
  });
  // To do から開くときは、その日を表示する
  el.querySelectorAll('[data-trip][data-date]').forEach((a) => {
    a.addEventListener('click', () => { if (a.dataset.date) setUi(`day:${a.dataset.trip}`, a.dataset.date); });
  });
}
