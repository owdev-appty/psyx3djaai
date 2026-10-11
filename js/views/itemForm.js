// 予定の追加・編集のシート
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { esc } from '../ui/dom.js';
import { openSheet, bindChoice, chip } from '../ui/sheet.js';
import { confirmDelete, confirmModal } from '../ui/modal.js';
import { NO_AUTOCORRECT } from '../ui/ime.js';
import { addImageFile, deleteImages, hydrateThumbs } from '../images.js';
import { openImageViewer } from '../ui/imageViewer.js';
import { MAX_IMAGES_PER_ITEM, remainingSlots } from '../logic/images.js';
import { SLOTS, SLOT_LABELS, isValidTime } from '../logic/plan.js';
import { tripDates, BOOKING_KINDS } from '../logic/trips.js';
import { parseAmount } from '../logic/money.js';
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

// 予約の欄：[booking の項目, ラベル, 種類]
const BOOKING_FIELDS = [
  ['provider', 'Booked via', 'text'],
  ['from', 'From', 'text'],
  ['to', 'To', 'text'],
  ['number', 'No.（便名）', 'code'],
  ['priceYen', 'Price', 'yen'],
  ['miles', 'Miles', 'number'],
  ['cancelPolicy', 'Cancellation', 'area'],
  ['payNote', 'Payment', 'text'],
  ['referenceNo', '予約番号', 'code'],
  ['note', 'Note', 'area'],
];

function bookingFieldsHtml(b) {
  const v = (k) => (b?.[k] ?? '');
  const field = ([k, label, type]) => {
    const name = `b_${k}`;
    const input = type === 'area'
      ? `<textarea class="input" name="${name}" rows="2">${esc(v(k))}</textarea>`
      : type === 'text'
        ? `<input class="input" name="${name}" value="${esc(v(k))}" autocomplete="off">`
        // 便名・予約番号・数字の欄は、自動修正・自動大文字を止める（打っていない文字が入らないように）
        : `<input class="input mono" name="${name}" value="${esc(v(k))}" ${NO_AUTOCORRECT} ${type === 'code' ? '' : 'inputmode="numeric"'}>`;
    return `<label class="field"><span class="field-label">${label}${type === 'yen' ? '（円）' : ''}</span>${input}</label>`;
  };
  const [provider, from, to, number, price, miles, ...rest] = BOOKING_FIELDS;
  return `
    ${field(provider)}
    <div class="field-row">${field(from)}${field(to)}</div>
    ${field(number)}
    <div class="field-row">${field(price)}${field(miles)}</div>
    ${rest.map(field).join('')}`;
}

// 予約の欄を読む。どれも空で、もとの booking もなければ null
function readBooking(root, orig) {
  const out = { ...(orig || {}) };
  let any = false;
  for (const [k, , type] of BOOKING_FIELDS) {
    const raw = root.querySelector(`[name="b_${k}"]`).value;
    if (type === 'yen' || type === 'number') {
      out[k] = parseAmount(raw);
      if (out[k] !== null) any = true;
    } else {
      out[k] = k === 'note' || k === 'cancelPolicy' ? raw : raw.trim();
      if (out[k]) any = true;
    }
  }
  return any || orig ? out : null;
}

// 画像の欄（Add plan / Edit）
function imagesFieldHtml(atts) {
  const left = remainingSlots(atts.length);
  return `
    <span class="field-label">画像</span>
    ${atts.length ? `<div class="att-grid">
      ${atts.map((a, i) => `
        <div class="att" data-thumb-box>
          <button type="button" class="att-view" data-view="${esc(a.id)}" aria-label="画像を大きく表示（${i + 1}）"><img data-thumb="${esc(a.id)}" alt=""></button>
          <button type="button" class="att-del" data-del="${esc(a.id)}" aria-label="画像を削除（${i + 1}）">×</button>
        </div>`).join('')}
    </div>` : ''}
    ${left ? '<button type="button" class="btn btn-secondary btn-small" data-act-addimg>＋ 画像を追加</button>' : ''}
    <p class="hint hint-sheet">${MAX_IMAGES_PER_ITEM}枚まで。AI には送りません</p>`;
}

const WHEN_LABELS = { none: '決めない', morning: SLOT_LABELS.morning, afternoon: SLOT_LABELS.afternoon, evening: SLOT_LABELS.evening, night: SLOT_LABELS.night, time: '時刻を入れる' };

// item が null なら追加。dayKey は追加先（編集のときは今の日）。
// from: 'bookings' のときは、予定ごとの削除はできない（「予約情報を外す」だけ）。予定ごとの削除は Plan からだけ
export function openItemForm(tripId, dayKey, item, { onSaved, from = 'plan' } = {}) {
  const isNew = !item;
  const trip = store.data.trips.find((t) => t.id === tripId);
  if (!trip) return;
  const it = item || { title: '', kind: 'other', time: null, endTime: null, slot: null, status: null, note: '', url: '' };
  const when = whenOf(it);
  const statuses = isNew ? ['booked', 'considering', 'todo'] : ITEM_STATUSES;
  const days = tripDates(trip);
  const showBooking = !isNew && (!!it.booking || BOOKING_KINDS.includes(it.kind));

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
    <div class="field" data-images></div>
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
        <input class="input" type="url" name="url" value="${esc(it.url || '')}" ${NO_AUTOCORRECT} inputmode="url">
      </label>
      <fieldset class="fieldset" data-booking ${showBooking ? '' : 'hidden'}>
        <legend class="section-title">Booking</legend>
        ${bookingFieldsHtml(it.booking)}
      </fieldset>
      ${from === 'bookings'
        ? (it.booking ? '<button type="button" class="btn btn-danger-soft btn-block" data-act-unbook>予約情報を外す</button>' : '')
        : '<button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>'}`}
    <p class="form-error" role="alert" hidden></p>`;

  // 画像：保存するまでは、この3つで覚えておく
  let atts = [...(it.attachments || [])];
  const added = [];   // このシートで追加した（保存しなければ消す）
  const removed = []; // 前からあって、このシートで消した（保存したら消す）

  openSheet({
    title: isNew ? 'Add plan' : 'Edit',
    body,
    onDismiss: () => { deleteImages(added); },
    onMount(root, close) {
      const imgBox = root.querySelector('[data-images]');
      const err = root.querySelector('.form-error');
      const drawImages = () => {
        imgBox.innerHTML = imagesFieldHtml(atts);
        hydrateThumbs(imgBox);
      };
      drawImages();
      imgBox.addEventListener('click', async (e) => {
        const view = e.target.closest('[data-view]');
        if (view) return openImageViewer(view.dataset.view);
        const del = e.target.closest('[data-del]');
        if (del) {
          if (!(await confirmDelete('画像'))) return;
          const id = del.dataset.del;
          atts = atts.filter((a) => a.id !== id);
          if (added.includes(id)) deleteImages([id]);
          else removed.push(id);
          return drawImages();
        }
        if (e.target.closest('[data-act-addimg]')) {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.multiple = true;
          input.addEventListener('change', async () => {
            const files = [...(input.files || [])].slice(0, remainingSlots(atts.length));
            if (!files.length) return;
            imgBox.querySelector('[data-act-addimg]')?.setAttribute('disabled', '');
            err.hidden = true;
            for (const f of files) {
              try {
                const a = await addImageFile(f);
                atts.push(a);
                added.push(a.id);
              } catch (ex) {
                err.textContent = ex && ex.name === 'QuotaExceededError' ? '保存できませんでした（容量がいっぱいです）' : '画像を読み込めませんでした';
                err.hidden = false;
              }
              drawImages();
            }
          }, { once: true });
          input.click();
        }
      });
      const timeFields = root.querySelector('[data-time-fields]');
      root._when = bindChoice(root, 'when', {
        onChange: (v) => {
          timeFields.hidden = v !== 'time';
          if (v === 'time') root.querySelector('[name="time"]').focus();
        },
      });
      const bookingBox = root.querySelector('[data-booking]');
      root._kind = bindChoice(root, 'kind', {
        onChange: (k) => { if (bookingBox && !it.booking) bookingBox.hidden = !BOOKING_KINDS.includes(k); },
      });
      root._status = bindChoice(root, 'status', { allowNone: true });
      // 予約情報だけを外す（便名・料金・予約番号など）。予定は Plan に残す
      root.querySelector('[data-act-unbook]')?.addEventListener('click', async () => {
        const ok = await confirmModal({ title: '予約情報を外しますか？', body: 'Plan の予定は残ります。', okLabel: '外す', danger: true });
        if (!ok) return;
        store.update((d) => {
          const t = d.trips.find((x) => x.id === tripId);
          const loc = t && findItem(t, it.id);
          if (loc) loc.list[loc.index].booking = null;
        });
        close();
        onSaved?.();
      });
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDelete(it.title || '（名前なし）'))) return;
        store.update((d) => {
          const t = d.trips.find((x) => x.id === tripId);
          const loc = t && findItem(t, it.id);
          if (loc) loc.list.splice(loc.index, 1);
        });
        // 予定ごと消したら、その画像も消す
        deleteImages([...(it.attachments || []).map((a) => a.id), ...added]);
        added.length = 0;
        close(true);
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
        attachments: atts,
      };
      if (!isNew) {
        fields.note = get('note').value;
        fields.url = get('url').value.trim();
        fields.booking = root.querySelector('[data-booking]').hidden ? (it.booking ?? null) : readBooking(root, it.booking);
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
      deleteImages(removed);
      onSaved?.(targetDay);
      return true;
    },
  });
}
