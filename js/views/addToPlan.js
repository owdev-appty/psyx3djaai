// 店の「Add to plan」：旅・日・時間帯を選んで、その旅の予定に追加する（予定の spotId に店の id を入れる）
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { esc } from '../ui/dom.js';
import { openSheet, bindChoice, chip } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { formatDay, toISODate } from '../logic/dates.js';
import { tripDates } from '../logic/trips.js';
import { SLOT_LABELS, isValidTime } from '../logic/plan.js';
import { tripsForAddToPlan, spotItemKind } from '../logic/places.js';
import { itemsOf, UNSCHEDULED } from './itemForm.js';

const WHEN = [['none', '決めない'], ['morning', SLOT_LABELS.morning], ['afternoon', SLOT_LABELS.afternoon], ['evening', SLOT_LABELS.evening], ['night', SLOT_LABELS.night], ['time', '時刻を入れる']];

function dayOptions(trip) {
  return [...tripDates(trip).map((d) => [d, formatDay(d)]), [UNSCHEDULED, '日程未定']];
}

// defaultTripId：旅の画面から開いたときはその旅
export function openAddToPlan(spot, place, { defaultTripId = null, onAdded } = {}) {
  const today = toISODate(new Date());
  const trips = tripsForAddToPlan(store.data.trips, place.id, today);
  if (!trips.length) {
    toast('追加できる旅がありません（終わっていない旅を作ってください）', { ms: 4000 });
    return;
  }
  const first = trips.find((t) => t.id === defaultTripId) || trips[0];
  const opts = (trip) => dayOptions(trip).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');

  openSheet({
    title: 'Add to plan',
    body: `
      <p class="row-text">${esc(spot.name || '（名前なし）')}</p>
      <label class="field">
        <span class="field-label">Trip</span>
        <select class="input" name="trip">${trips.map((t) => `<option value="${esc(t.id)}" ${t.id === first.id ? 'selected' : ''}>${esc(t.title || '（名前なし）')}</option>`).join('')}</select>
      </label>
      <label class="field">
        <span class="field-label">Day</span>
        <select class="input" name="day">${opts(first)}</select>
      </label>
      <div class="field">
        <span class="field-label">いつ？</span>
        <div class="chips" data-group="when">${WHEN.map(([v, l]) => chip(v, l, v === 'none')).join('')}</div>
        <div class="field-row" data-time hidden>
          <label class="field"><span class="field-label">Time</span><input class="input mono" type="time" name="time"></label>
        </div>
      </div>
      <p class="form-error" role="alert" hidden></p>`,
    onMount(root) {
      const tripSel = root.querySelector('[name="trip"]');
      tripSel.addEventListener('change', () => {
        const t = store.data.trips.find((x) => x.id === tripSel.value);
        root.querySelector('[name="day"]').innerHTML = opts(t);
      });
      root._when = bindChoice(root, 'when', { onChange: (v) => { root.querySelector('[data-time]').hidden = v !== 'time'; } });
    },
    onSave(root) {
      const tripId = root.querySelector('[name="trip"]').value;
      const day = root.querySelector('[name="day"]').value;
      const when = root._when.get() || 'none';
      const time = root.querySelector('[name="time"]').value;
      if (when === 'time' && !isValidTime(time)) {
        const err = root.querySelector('.form-error');
        err.textContent = '時刻を入れてください';
        err.hidden = false;
        return false;
      }
      store.update((d) => {
        const t = d.trips.find((x) => x.id === tripId);
        if (!t) return;
        itemsOf(t, day).push({
          id: newId(), title: spot.name || '', kind: spotItemKind(spot.kind),
          time: when === 'time' ? time : null, endTime: null,
          slot: when === 'time' || when === 'none' ? null : when,
          status: null, spotId: spot.id, note: '', url: '', booking: null, attachments: [],
        });
      });
      toast('Plan に追加しました');
      onAdded?.(tripId);
      return true;
    },
  });
}
