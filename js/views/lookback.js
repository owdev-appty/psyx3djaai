// ふりかえり（ボタンだけで完結する。AI での整理はマイルストーン9）
//   1. 店：予定に入っていた店に Visited / Go again / Next time! / 行かなかった → 場所ノートの店の状態を変える
//   2. Notes to self：学びをその場所の Notes to self に足す（fromTripId 付き）
//   3. ふりかえり：自由な感想（lookBack）
//   4. Finish：旅を Done に
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { toast } from '../ui/toast.js';
import { onTextInput } from '../ui/ime.js';
import { kindIcon } from '../ui/kind.js';
import { lookbackSpots } from '../logic/places.js';
import { parseISODate } from '../logic/dates.js';
import { SPOT_STATUS_LABELS } from '../labels.js';

const ANSWERS = [['visited', SPOT_STATUS_LABELS.visited], ['again', SPOT_STATUS_LABELS.again], ['nextTime', SPOT_STATUS_LABELS.nextTime], ['skip', '行かなかった']];

export function render(el, trip) {
  const places = (trip.placeIds || []).map((id) => store.data.places.find((p) => p.id === id)).filter(Boolean);
  const spots = lookbackSpots(trip, store.data.places);
  const answers = trip.lookbackAnswers || {};
  const added = places.flatMap((p) => (p.notesToSelf || []).filter((n) => n.fromTripId === trip.id).map((n) => ({ place: p, note: n })));
  const done = trip.status === 'done';

  el.innerHTML = `
    <h2 class="lb-title">ふりかえり</h2>

    <section class="section" aria-labelledby="lb-spots">
      <h3 class="section-title" id="lb-spots">店</h3>
      ${spots.length ? `
        <ul class="list card">
          ${spots.map(({ place, spot }) => `
            <li class="lb-spot" data-place="${esc(place.id)}" data-spot="${esc(spot.id)}">
              <span class="lb-spot-head">${kindIcon(spot.kind)}<span class="row-title">${esc(spot.name || '（名前なし）')}</span></span>
              <span class="chips lb-answers">
                ${ANSWERS.map(([v, l]) => `<button type="button" class="chip chip-xs" data-answer="${v}" aria-pressed="${answers[spot.id] === v}">${l}</button>`).join('')}
              </span>
            </li>`).join('')}
        </ul>` : '<p class="hint">この旅の予定に、場所ノートの店はありません</p>'}
    </section>

    ${places.length ? `
      <section class="section" aria-labelledby="lb-notes">
        <h3 class="section-title" id="lb-notes">Notes to self</h3>
        ${places.length > 1 ? `<div class="chips" data-group="lb-place">${places.map((p, i) => `<button type="button" class="chip" data-value="${esc(p.id)}" aria-pressed="${i === 0}">${esc(p.name)}</button>`).join('')}</div>` : ''}
        <div class="add-row add-row-top">
          <textarea class="input" name="lbNote" rows="2" placeholder="次の自分へのメモ"></textarea>
          <button type="button" class="btn btn-secondary" data-act="add-note">Add</button>
        </div>
        ${added.length ? `<ul class="same-notes">${added.map(({ place, note }) => `<li class="note-card note-card-sm"><span class="note-text">${esc(note.text)}</span>${places.length > 1 ? `<span class="note-from">${esc(place.name)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      </section>` : ''}

    <section class="section">
      <label class="field">
        <span class="section-title">ふりかえり</span>
        <textarea class="input" name="lookBack" rows="4">${esc(trip.lookBack || '')}</textarea>
      </label>
    </section>

    <button type="button" class="btn btn-primary btn-block lb-finish" data-act="finish" ${done ? 'disabled' : ''}>Finish</button>`;

  const rerender = () => render(el, store.data.trips.find((t) => t.id === trip.id) || trip);
  const updateTrip = (fn) => store.update((d) => { const t = d.trips.find((x) => x.id === trip.id); if (t) fn(t, d); });

  // 1. 店の状態（「行かなかった」は店の状態を変えない。Next time! で年がなければ、その旅の年を入れる）
  el.querySelectorAll('[data-answer]').forEach((b) => b.addEventListener('click', () => {
    const li = b.closest('[data-spot]');
    const answer = b.dataset.answer;
    updateTrip((t, d) => {
      t.lookbackAnswers = { ...(t.lookbackAnswers || {}), [li.dataset.spot]: answer };
      if (answer === 'skip') return;
      const spot = d.places.find((p) => p.id === li.dataset.place)?.spots.find((s) => s.id === li.dataset.spot);
      if (!spot) return;
      spot.status = answer;
      if (answer === 'nextTime' && !spot.sinceYear) spot.sinceYear = parseISODate(t.startDate)?.y || new Date().getFullYear();
    });
    rerender();
  }));

  // 2. Notes to self に足す
  const placeChoice = () => el.querySelector('[data-group="lb-place"] .chip[aria-pressed="true"]')?.dataset.value || places[0]?.id;
  el.querySelectorAll('[data-group="lb-place"] .chip').forEach((c) => c.addEventListener('click', () => {
    el.querySelectorAll('[data-group="lb-place"] .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
  }));
  el.querySelector('[data-act="add-note"]')?.addEventListener('click', () => {
    const box = el.querySelector('[name="lbNote"]');
    const text = box.value.trim();
    if (!text) return box.focus();
    const placeId = placeChoice();
    store.update((d) => {
      const p = d.places.find((x) => x.id === placeId);
      if (p) (p.notesToSelf ||= []).push({ id: newId(), text, fromTripId: trip.id });
    });
    toast('Notes to self に足しました');
    rerender();
  });

  // 3. 自由な感想：入力のたびに保存（変換中は保存しない）
  const lb = el.querySelector('[name="lookBack"]');
  onTextInput(lb, () => { const v = lb.value; updateTrip((t) => { t.lookBack = v; }); });

  // 4. Finish
  el.querySelector('[data-act="finish"]').addEventListener('click', () => {
    updateTrip((t) => { t.status = 'done'; });
    toast('ふりかえりを終えました');
    location.hash = `#/trip/${trip.id}/plan`;
  });
}
