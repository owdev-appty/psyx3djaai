// 同じ場所への新しい旅：旅の Plan の上に、その場所の Notes to self と Want to go / Next time! の店を、たたんで出す
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { toISODate } from '../logic/dates.js';
import { samePlaceHints } from '../logic/places.js';
import { SPOT_STATUS_LABELS } from '../labels.js';
import { kindIcon, SPOT_STATUS_CHIP } from '../ui/kind.js';
import { openAddToPlan } from './addToPlan.js';

export function samePlaceHtml(trip) {
  const hints = samePlaceHints(trip, store.data.places, toISODate(new Date()));
  return hints.map(({ place, notes, spots }) => `
    <details class="same-place" data-place="${esc(place.id)}">
      <summary>${esc(place.name)}：Notes to self（${notes.length}）・Want to go / Next time!（${spots.length}）</summary>
      ${notes.length ? `
        <h3 class="section-title">Notes to self</h3>
        <ul class="same-notes">${notes.map((n) => `<li class="note-card note-card-sm"><span class="note-text">${esc(n.text || '')}</span></li>`).join('')}</ul>` : ''}
      ${spots.length ? `
        <h3 class="section-title">Want to go / Next time!</h3>
        <ul class="list card">
          ${spots.map((s) => `
            <li class="same-spot" data-spot="${esc(s.id)}">
              ${kindIcon(s.kind)}
              <span class="row-main"><span class="row-title">${esc(s.name || '（名前なし）')}</span>${s.area ? `<span class="row-sub">${esc(s.area)}</span>` : ''}</span>
              <span class="status-chip ${SPOT_STATUS_CHIP[s.status]}">${SPOT_STATUS_LABELS[s.status]}</span>
              <button type="button" class="btn btn-small btn-secondary" data-act="same-add">Add to plan</button>
            </li>`).join('')}
        </ul>` : ''}
      <a class="same-link" href="#/place/${esc(place.id)}/notes">${esc(place.name)} を開く</a>
    </details>`).join('');
}

export function bindSamePlace(el, trip, onAdded) {
  el.querySelectorAll('.same-place [data-act="same-add"]').forEach((b) => b.addEventListener('click', () => {
    const place = store.data.places.find((p) => p.id === b.closest('[data-place]').dataset.place);
    const spot = place?.spots.find((s) => s.id === b.closest('[data-spot]').dataset.spot);
    if (spot) openAddToPlan(spot, place, { defaultTripId: trip.id, onAdded });
  }));
}
