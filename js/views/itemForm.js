// 予定の追加・編集のシート
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { esc } from '../ui/dom.js';
import { openSheet, bindChoice, chip } from '../ui/sheet.js';
import { confirmDelete } from '../ui/modal.js';
import { SLOTS, SLOT_LABELS, isValidTime } from '../logic/plan.js';
import { tripDates } from '../logic/trips.js';
import { formatDay } from '../logic/dates.js';
import { KINDS, KIND_LABELS, ITEM_STATUSES, ITEM_STATUS_LABELS } from '../labels.js';

export const UNSCHEDULED = 'unscheduled';

// 予定がどこにあるか：{ list（配列）, dayKey（日付 or 'unscheduled'） }
export function findItem(trip, itemId) {
  for (const day of trip.days || []) {
    const i = (day.items || []).findIndex((it) => it.id === itemId);
    if (i >= 0) return { list: day.items, index: i, dayKey: day.date };
  }
  const i = (trip.unscheduled || []).findIndex((it) => it.id === itemId);
  return i >= 0 ? { list: trip.unscheduled, index: i, dayKey: UNSCHEDULED } : null;
}

// その日の予定の配列（日がなければ作る）
export function itemsOf(trip, dayKey) {
  if (dayKey === UNSCHEDULED) return (trip.unscheduled ||= []);
  let day = trip.days.find((d) => d.date === dayKey);
  if (!day) {
    day = { date: dayKey, dayNotes: '', items: [] };
    trip.days.push(day);
    trip.days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  return (day.items ||= []);
}

// 「いつ？」の初期値：時刻があれば time、時間帯があればそれ、どちらもなければ 決めない
function whenOf(item) {
  if (isValidTime(item?.time)) return 'time';
  return SLOTS.includes(item?.slot) && item.slot !== 'anytime' ? item.slot : 'none';
}

const WHEN_LABELS = { none: '決めない', morning: SLOT_LABELS.morning, afternoon: SLOT_LABELS.afternoon, evening: SLOT_LABELS.evening, night: SLOT_LABELS.night, time: '時刻を入れる' };

// item が null なら追加。dayKey は追加先（編集のときは今の日）
export function openItemForm(tripId, dayKey, item, { onSaved } = {}) {
  const isNew = !item;
  const trip = store.data.trips.find((t) => t.id === tripId);
  if (!trip) return;
  const it = item || { title: '', kind: 'other', time: null, endTime: null, slot: null, status: null, note: '', url: '' };
  const when = whenOf(it);
  const statuses = isNew ? ['booked', 'considering', 'todo'] : ITEM_STATUSES;
  const days = tripDates(trip);

  const body = `
    <label class="field">
      <span class="field-label">Title</span>
      <input class="input" name="title" value="${esc(it.title)}" autocomplete="off">
    </label>
    ${isNew ? '' : `
      <label class="field">
        <span class="field-label">Day</span>
        <select class="input" name="day">
          ${days.map((d) => `<option value="${esc(d)}" ${d === dayKey ? 'selected' : ''}>${esc(formatDay(d))}</option>`).join('')}
          <option value="${UNSCHEDULED}" ${dayKey === UNSCHEDULED ? 'selected' : ''}>日程未定</option>
        </select>
      </label>`}
    <div class="field">
      <span class="field-label">いつ？</span>
      <div class="chips" data-group="when">
        ${Object.entries(WHEN_LABELS).map(([v, l]) => chip(v, l, when === v)).join('')}
      </div>
      <div class="field-row" data-time-fields ${when === 'time' ? '' : 'hidden'}>
        <label class="field">
          <span class="field-label">Time</span>
          <input class="input mono" type="time" name="time" value="${esc(isValidTime(it.time) ? it.time : '')}">
        </label>
        <label class="field">
          <span class="field-label">End time</span>
          <input class="input mono" type="time" name="endTime" value="${esc(isValidTime(it.endTime) ? it.endTime : '')}">
        </label>
      </div>
    </div>
    <div class="field">
      <span class="field-label">Kind</span>
      <div class="chips" data-group="kind">
        ${KINDS.map((k) => chip(k, KIND_LABELS[k], (it.kind || 'other') === k)).join('')}
      </div>
    </div>
    <div class="field">
      <span class="field-label">Status</span>
      <div class="chips" data-group="status">
        ${statuses.map((s) => chip(s, ITEM_STATUS_LABELS[s], it.status === s)).join('')}
      </div>
    </div>
    ${isNew ? '' : `
      <label class="field">
        <span class="field-label">Note</span>
        <textarea class="input" name="note" rows="3">${esc(it.note || '')}</textarea>
      </label>
      <label class="field">
        <span class="field-label">Link</span>
        <input class="input" type="url" name="url" value="${esc(it.url || '')}" autocomplete="off" inputmode="url">
      </label>
      <button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>`}
    <p class="form-error" role="alert" hidden></p>`;

  openSheet({
    title: isNew ? 'Add plan' : 'Edit',
    body,
    onMount(root, close) {
      const timeFields = root.querySelector('[data-time-fields]');
      root._when = bindChoice(root, 'when', {
        onChange: (v) => {
          timeFields.hidden = v !== 'time';
          if (v === 'time') root.querySelector('[name="time"]').focus();
        },
      });
      root._kind = bindChoice(root, 'kind');
      root._status = bindChoice(root, 'status', { allowNone: true });
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDelete(it.title || '（名前なし）'))) return;
        store.update((d) => {
          const t = d.trips.find((x) => x.id === tripId);
          const loc = t && findItem(t, it.id);
          if (loc) loc.list.splice(loc.index, 1);
        });
        close();
        onSaved?.();
      });
      if (isNew) root.querySelector('[name="title"]').focus();
    },
    onSave(root) {
      const get = (n) => root.querySelector(`[name="${n}"]`);
      const err = root.querySelector('.form-error');
      const title = get('title').value.trim();
      if (!title) {
        err.textContent = 'タイトルを入れてください';
        err.hidden = false;
        get('title').focus();
        return false;
      }
      const w = root._when.get() || 'none';
      const time = get('time').value;
      if (w === 'time' && !isValidTime(time)) {
        err.textContent = '時刻を入れてください';
        err.hidden = false;
        return false;
      }
      const endTime = get('endTime').value;
      const fields = {
        title,
        kind: root._kind.get() || 'other',
        status: root._status.get(),
        time: w === 'time' ? time : null,
        endTime: w === 'time' && isValidTime(endTime) ? endTime : null,
        slot: w === 'time' || w === 'none' ? null : w,
      };
      if (!isNew) {
        fields.note = get('note').value;
        fields.url = get('url').value.trim();
      }
      const targetDay = isNew ? dayKey : get('day').value;
      store.update((d) => {
        const t = d.trips.find((x) => x.id === tripId);
        if (!t) return;
        if (isNew) {
          itemsOf(t, targetDay).push({ id: newId(), spotId: null, note: '', url: '', booking: null, ...fields });
          return;
        }
        const loc = findItem(t, it.id);
        if (!loc) return;
        const updated = { ...loc.list[loc.index], ...fields };
        if (targetDay === loc.dayKey) {
          loc.list[loc.index] = updated;
        } else {
          // 別の日へ移動
          loc.list.splice(loc.index, 1);
          itemsOf(t, targetDay).push(updated);
        }
      });
      onSaved?.(targetDay);
      return true;
    },
  });
}
