// 旅の画面：上部（戻る・旅の名前・日程）とタブ
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { dateRange, nightsText } from './home.js';
import { openTripForm } from './tripForm.js';
import * as plan from './tripPlan.js';
import * as bookings from './tripBookings.js';
import * as money from './tripMoney.js';
import * as packing from './tripPacking.js';
import * as notes from './tripNotes.js';
import * as lookback from './lookback.js';
import { needsLookBack } from '../logic/trips.js';
import { toISODate } from '../logic/dates.js';

const TABS = [
  ['plan', 'Plan'],
  ['bookings', 'Bookings'],
  ['money', 'Money'],
  ['packing', 'Packing'],
  ['notes', 'Notes'],
];

export function render(el, [tripId, tab = 'plan']) {
  const trip = store.data.trips.find((t) => t.id === tripId);
  if (!trip) {
    el.innerHTML = `
      <header class="topbar topbar-back">
        <a class="icon-btn icon-btn-lead" href="#/trips" aria-label="Back">${icon('back')}</a>
      </header>
      <section class="empty"><p>旅が見つかりません</p></section>`;
    return;
  }
  const current = TABS.some(([k]) => k === tab) || tab === 'lookback' ? tab : 'plan';
  const meta = [dateRange(trip), nightsText(trip)].filter(Boolean).join(' · ');
  // 旅の場所（押すと場所ノートを開く）
  const places = (trip.placeIds || []).map((id) => store.data.places.find((p) => p.id === id)).filter(Boolean);

  el.innerHTML = `
    <header class="trip-head">
      <div class="topbar">
        <a class="icon-btn icon-btn-lead" href="#/trips" aria-label="Back">${icon('back')}</a>
        <button type="button" class="btn btn-small btn-secondary" data-act="edit">Edit</button>
      </div>
      <h1 class="display-title trip-title">${esc(trip.title || '（名前なし）')}</h1>
      <p class="page-sub mono">${esc(meta)}</p>
      ${places.length ? `<div class="trip-places">${places.map((p) => `<a class="trip-place" href="#/place/${esc(p.id)}/notes">${esc(p.name || '（名前なし）')} ›</a>`).join('')}</div>` : ''}
    </header>
    ${needsLookBack(trip, toISODate(new Date())) && current !== 'lookback' ? `
      <div class="notice notice-todo">
        <div class="notice-row">
          <p>旅が終わりました。ふりかえりをしましょう</p>
          <a class="btn btn-small btn-todo" href="#/trip/${esc(trip.id)}/lookback">ふりかえり</a>
        </div>
      </div>` : ''}
    <div class="trip-sticky">
      <nav class="segmented" aria-label="Trip">
        ${TABS.map(([k, label]) => `<a href="#/trip/${esc(trip.id)}/${k}" class="seg" ${k === current ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
      </nav>
      <div class="trip-sticky-sub" data-sticky-sub></div>
    </div>
    <div class="tab-body"></div>`;

  el.querySelector('[data-act="edit"]').addEventListener('click', () => {
    openTripForm(trip, {
      onSaved: () => render(el, [tripId, current]),
      onDeleted: () => { location.hash = '#/trips'; },
    });
  });

  const body = el.querySelector('.tab-body');
  // Plan の日付の列は、タブのすぐ下（上に止まる所）に出す
  if (current === 'plan') plan.render(body, trip, { daySlot: el.querySelector('[data-sticky-sub]') });
  else if (current === 'bookings') bookings.render(body, trip);
  else if (current === 'money') money.render(body, trip);
  else if (current === 'packing') packing.render(body, trip);
  else if (current === 'notes') notes.render(body, trip);
  else if (current === 'lookback') lookback.render(body, trip);
}
