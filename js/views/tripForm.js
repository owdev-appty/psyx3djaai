// 旅の追加・編集のシート
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { esc } from '../ui/dom.js';
import { openSheet, bindChoice, bindMulti, chip } from '../ui/sheet.js';
import { confirmDelete } from '../ui/modal.js';
import { TRIP_STATUSES, TRIP_STATUS_LABELS } from '../labels.js';
import { deleteImages } from '../images.js';
import { tripAttachmentIds } from '../logic/images.js';

export function newPlace(name) {
  return { id: newId(), name, region: '', order: store.data.places.length, notesToSelf: [], transportTips: [], stays: [], areas: [], spots: [], links: [] };
}

export function emptyTrip() {
  return {
    id: newId(), title: '', placeIds: [], startDate: null, endDate: null, status: 'planning', summary: '',
    days: [], unscheduled: [], expenses: [], memoTotalYen: null, lookBack: '', todos: [], packingExtras: [],
    candidates: [], unsortedNotes: [], packing: { tagIds: [], checked: {}, skipped: {}, feedback: {} },
  };
}

// trip が null なら新しい旅。保存したら onSaved(tripId)
export function openTripForm(trip, { onSaved, onDeleted } = {}) {
  const isNew = !trip;
  const t = trip || emptyTrip();
  const undated = !t.startDate || !t.endDate;
  const places = [...store.data.places].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const body = `
    <label class="field">
      <span class="field-label">Title</span>
      <input class="input" name="title" value="${esc(t.title)}" autocomplete="off" placeholder="例：石垣島 2026夏">
    </label>
    <div class="field">
      <span class="field-label">Places</span>
      <div class="chips" data-group="places">
        ${places.map((p) => chip(p.id, esc(p.name), t.placeIds.includes(p.id))).join('')}
      </div>
      <input class="input" name="newPlace" autocomplete="off" placeholder="＋ New place（新しい場所の名前）">
    </div>
    <div class="field-row">
      <label class="field">
        <span class="field-label">Start</span>
        <input class="input mono" type="date" name="startDate" value="${esc(t.startDate || '')}" ${undated && !isNew ? '' : ''}>
      </label>
      <label class="field">
        <span class="field-label">End</span>
        <input class="input mono" type="date" name="endDate" value="${esc(t.endDate || '')}">
      </label>
    </div>
    <label class="check">
      <input type="checkbox" name="undated" ${undated && !isNew ? 'checked' : ''}>
      <span>日程未定</span>
    </label>
    ${isNew ? '' : `
      <div class="field">
        <span class="field-label">Status</span>
        <div class="chips" data-group="status">
          ${TRIP_STATUSES.map((s) => chip(s, TRIP_STATUS_LABELS[s], t.status === s)).join('')}
        </div>
      </div>
      <button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>`}
    <p class="form-error" role="alert" hidden></p>`;

  openSheet({
    title: isNew ? 'New trip' : 'Edit',
    body,
    onMount(root, close) {
      const undatedBox = root.querySelector('[name="undated"]');
      const dates = root.querySelectorAll('[type="date"]');
      const sync = () => dates.forEach((d) => { d.disabled = undatedBox.checked; });
      undatedBox.addEventListener('change', sync);
      sync();
      // 開始日を入れたら、終了日が空なら同じ日にする
      root.querySelector('[name="startDate"]').addEventListener('input', (e) => {
        const end = root.querySelector('[name="endDate"]');
        if (!end.value || end.value < e.target.value) end.value = e.target.value;
      });
      root._places = bindMulti(root, 'places');
      root._status = bindChoice(root, 'status');
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDelete(t.title || '（名前なし）'))) return;
        const ids = tripAttachmentIds(t);
        store.update((d) => { d.trips = d.trips.filter((x) => x.id !== t.id); });
        deleteImages(ids); // 旅を消したら、その予定の画像も消す
        close(true);
        onDeleted?.();
      });
      if (isNew) root.querySelector('[name="title"]').focus();
    },
    onSave(root) {
      const get = (n) => root.querySelector(`[name="${n}"]`);
      const title = get('title').value.trim();
      const err = root.querySelector('.form-error');
      const undatedNow = get('undated').checked;
      let start = get('startDate').value || null;
      let end = get('endDate').value || null;
      if (!title) {
        err.textContent = 'タイトルを入れてください';
        err.hidden = false;
        get('title').focus();
        return false;
      }
      if (!undatedNow && (!start || !end)) {
        err.textContent = '日程を入れるか、「日程未定」にしてください';
        err.hidden = false;
        return false;
      }
      if (!undatedNow && end < start) [start, end] = [end, start];
      const placeName = get('newPlace').value.trim();
      const placeIds = root._places.get();
      store.update((d) => {
        if (placeName) {
          const existing = d.places.find((p) => p.name === placeName);
          const p = existing || newPlace(placeName);
          if (!existing) d.places.push(p);
          if (!placeIds.includes(p.id)) placeIds.push(p.id);
        }
        const target = isNew ? t : d.trips.find((x) => x.id === t.id);
        if (!target) return;
        target.title = title;
        target.placeIds = placeIds;
        target.startDate = undatedNow ? null : start;
        target.endDate = undatedNow ? null : end;
        if (!isNew) target.status = root._status.get() || target.status;
        if (isNew) d.trips.push(target);
      });
      onSaved?.(t.id);
      return true;
    },
  });
}
