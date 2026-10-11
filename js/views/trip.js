// 旅の画面：上部（戻る・旅の名前・日程）とタブ
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { dateRange, nightsText } from './home.js';
import { openTripForm } from './tripForm.js';
import * as plan from './tripPlan.js';

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

  el.innerHTML = `
    <header class="trip-head">
      <div class="topbar">
        <a class="icon-btn icon-btn-lead" href="#/trips" aria-label="Back">${icon('back')}</a>
        <button type="button" class="btn btn-small btn-secondary" data-act="edit">Edit</button>
      </div>
      <h1 class="display-title trip-title">${esc(trip.title || '（名前なし）')}</h1>
      <p class="page-sub mono">${esc(meta)}</p>
    </header>
    <nav class="segmented" aria-label="Trip">
      ${TABS.map(([k, label]) => `<a href="#/trip/${esc(trip.id)}/${k}" class="seg" ${k === current ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
    <div class="tab-body"></div>`;

  el.querySelector('[data-act="edit"]').addEventListener('click', () => {
    openTripForm(trip, {
      onSaved: () => render(el, [tripId, current]),
      onDeleted: () => { location.hash = '#/trips'; },
    });
  });

  const body = el.querySelector('.tab-body');
  if (current === 'plan') plan.render(body, trip);
  else body.innerHTML = '<section class="empty"><p>準備中です</p></section>';
}
