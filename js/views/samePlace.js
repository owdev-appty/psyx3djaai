// 同じ場所への新しい旅：旅の Plan の上に「前回の学び」をたたんで出す
//   前回のふりかえり（先頭3行）、Notes to self、店（Want to go / Go again / Next time!）、移動のコツ
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { toISODate } from '../logic/dates.js';
import { samePlaceHints } from '../logic/places.js';
import { SPOT_STATUS_LABELS, SPOT_KIND_LABELS } from '../labels.js';
import { kindIcon, SPOT_STATUS_CHIP } from '../ui/kind.js';
import { openAddToPlan } from './addToPlan.js';

export function samePlaceHtml(trip) {
  const hints = samePlaceHints(trip, store.data.places, toISODate(new Date()), store.data.trips);
  return hints.map(({ place, notes, spots, tips, lastLook }) => {
    const pid = esc(place.id);
    const counts = [
      notes.length ? `Notes to self ${notes.length}` : '',
      spots.length ? `店 ${spots.length}` : '',
      tips.length ? `移動のコツ ${tips.length}` : '',
      lastLook ? '前回のふりかえり' : '',
    ].filter(Boolean).join('・');
    return `
    <details class="same-place" data-place="${pid}">
      <summary><span class="same-title">${esc(place.name)}：前回の学び</span><span class="same-counts">${esc(counts)}</span></summary>
      ${lastLook ? `
        <h3 class="section-title">前回のふりかえり（${esc(lastLook.trip.title || '（名前なし）')}）</h3>
        <p class="same-look">${lastLook.lines.map(esc).join('<br>')}</p>` : ''}
      ${notes.length ? `
        <h3 class="section-title">Notes to self</h3>
        <ul class="same-notes">${notes.map((n) => `<li class="note-card note-card-sm"><span class="note-text">${esc(n.text || '')}</span></li>`).join('')}</ul>` : ''}
      ${spots.length ? `
        <h3 class="section-title">Want to go / Go again / Next time!</h3>
        <ul class="list card">
          ${spots.map((s) => `
            <li class="same-spot" data-spot="${esc(s.id)}">
              <div class="same-spot-head">
                ${kindIcon(s.kind, { named: SPOT_KIND_LABELS[s.kind] || 'Other' })}
                <span class="row-main"><span class="row-title">${esc(s.name || '（名前なし）')}</span>${s.area ? `<span class="row-sub">${esc(s.area)}</span>` : ''}</span>
              </div>
              <div class="same-spot-foot">
                <span class="status-chip ${SPOT_STATUS_CHIP[s.status]}">${SPOT_STATUS_LABELS[s.status]}</span>
                <button type="button" class="btn btn-small btn-secondary" data-act="same-add">Add to plan</button>
              </div>
            </li>`).join('')}
        </ul>` : ''}
      ${tips.length ? `
        <h3 class="section-title">移動のコツ</h3>
        <ul class="same-tips">${tips.map((t) => `<li><a href="#/place/${pid}/tips">${esc(t.title || String(t.text || '').split('\n')[0] || '（名前なし）')}</a></li>`).join('')}</ul>` : ''}
      <a class="same-link" href="#/place/${pid}/notes">${esc(place.name)} を開く</a>
    </details>`;
  }).join('');
}

export function bindSamePlace(el, trip, onAdded) {
  el.querySelectorAll('.same-place [data-act="same-add"]').forEach((b) => b.addEventListener('click', () => {
    const place = store.data.places.find((p) => p.id === b.closest('[data-place]').dataset.place);
    const spot = place?.spots.find((s) => s.id === b.closest('[data-spot]').dataset.spot);
    if (spot) openAddToPlan(spot, place, { defaultTripId: trip.id, onAdded });
  }));
}
