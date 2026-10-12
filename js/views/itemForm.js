// 予定の追加・編集のシート
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { esc } from '../ui/dom.js';
import { openSheet, bindChoice, chip, iconChip } from '../ui/sheet.js';
import { icon } from '../ui/icons.js';
import { confirmDelete, confirmModal } from '../ui/modal.js';
import { NO_AUTOCORRECT, onTextInput } from '../ui/ime.js';
import { deleteImages } from '../images.js';
import { mountImagesField } from '../ui/imagesField.js';
import { MAX_IMAGES_PER_ITEM } from '../logic/images.js';
import { SLOTS, SLOT_LABELS, isValidTime } from '../logic/plan.js';
import { tripDates, BOOKING_KINDS } from '../logic/trips.js';
import { parseAmount } from '../logic/money.js';
import { formatDay } from '../logic/dates.js';
import { urlForSave, URL_ERROR } from '../logic/url.js';
import { placeTargetOf, findByName, addPlanToPlace, PLAN_TO_SPOT_KINDS } from '../logic/places.js';
import { toast } from '../ui/toast.js';
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


const WHEN_LABELS = { none: '決めない', morning: SLOT_LABELS.morning, afternoon: SLOT_LABELS.afternoon, evening: SLOT_LABELS.evening, night: SLOT_LABELS.night, time: '時刻を入れる' };

// item が null なら追加。dayKey は追加先（編集のときは今の日）。preset：追加のときの初期値（Bookings の Add booking・候補の Book this）
// from: 'bookings' のときは、予定ごとの削除はできない（「予約情報を外す」だけ）。予定ごとの削除は Plan からだけ
// 追加のときは、店の種類（Food など）なら「店にも入れる」、Stay なら「宿にも入れる」（旅の場所ノートへ。同じ名前があればつなぐ）
export function openItemForm(tripId, dayKey, item, { onSaved, from = 'plan', preset = null } = {}) {
  const isNew = !item;
  const trip = store.data.trips.find((t) => t.id === tripId);
  if (!trip) return;
  const it = item || { title: '', kind: 'other', time: null, endTime: null, slot: null, status: null, note: '', url: '', ...(preset || {}) };
  const when = whenOf(it);
  const statuses = isNew ? ['booked', 'considering', 'todo'] : ITEM_STATUSES;
  const days = tripDates(trip);
  const showBooking = !!it.booking || BOOKING_KINDS.includes(it.kind);
  const places = (trip.placeIds || []).map((id) => store.data.places.find((p) => p.id === id)).filter(Boolean);
  const spotNames = [...new Set(places.flatMap((p) => (p.spots || []).map((s) => s.name).filter(Boolean)))];

  const body = `
    <label class="field">
      <span class="field-label">Title</span>
      <input class="input" name="title" value="${esc(it.title)}" autocomplete="off" ${isNew && spotNames.length ? 'list="tn-spot-names"' : ''}>
      ${isNew && spotNames.length ? `<datalist id="tn-spot-names">${spotNames.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>` : ''}
    </label>
    <label class="field">
      <span class="field-label">Day</span>
      <select class="input" name="day">
        ${days.map((d) => `<option value="${esc(d)}" ${d === dayKey ? 'selected' : ''}>${esc(formatDay(d))}</option>`).join('')}
        <option value="${UNSCHEDULED}" ${dayKey === UNSCHEDULED ? 'selected' : ''}>日程未定</option>
      </select>
    </label>
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
        ${KINDS.map((k) => iconChip(k, icon(k), KIND_LABELS[k], (it.kind || 'other') === k)).join('')}
      </div>
    </div>
    ${isNew && places.length ? `
      <div class="field to-place" data-to-place hidden>
        <label class="check check-tight"><input type="checkbox" name="toPlace" checked><span data-to-place-label></span></label>
        ${places.length > 1 ? `<select class="input" name="toPlaceId" aria-label="Place">${places.map((p) => `<option value="${esc(p.id)}">${esc(p.name || '（名前なし）')}</option>`).join('')}</select>`
          : `<input type="hidden" name="toPlaceId" value="${esc(places[0].id)}">`}
        <p class="hint hint-sheet" data-to-place-hint></p>
      </div>` : ''}
    <div class="field">
      <span class="field-label">Status</span>
      <div class="chips" data-group="status">
        ${statuses.map((s) => chip(s, ITEM_STATUS_LABELS[s], it.status === s)).join('')}
      </div>
    </div>
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
    ${isNew ? '' : `
      ${from === 'bookings'
        ? (it.booking ? '<button type="button" class="btn btn-danger-soft btn-block" data-act-unbook>予約情報を外す</button>' : '')
        : '<button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>'}`}
    <p class="form-error" role="alert" hidden></p>`;

  // 画像：保存するまでは、画像の欄が追加・削除を覚えておく
  let imgs = null;

  openSheet({
    title: isNew ? (from === 'bookings' ? 'Add booking' : 'Add plan') : 'Edit',
    body,
    onDismiss: () => { if (imgs) deleteImages(imgs.added); },
    onMount(root, close, focusWhenOpen) {
      const err = root.querySelector('.form-error');
      imgs = mountImagesField(root.querySelector('[data-images]'), { initial: it.attachments || [], max: MAX_IMAGES_PER_ITEM, errEl: err });
      const timeFields = root.querySelector('[data-time-fields]');
      root._when = bindChoice(root, 'when', {
        onChange: (v) => {
          timeFields.hidden = v !== 'time';
          if (v === 'time') root.querySelector('[name="time"]').focus();
        },
      });
      const bookingBox = root.querySelector('[data-booking]');
      // 店にも入れる / 宿にも入れる：種類・Title・場所が変わるたびに、出すかどうかと説明を直す
      const toPlace = root.querySelector('[data-to-place]');
      const syncToPlace = () => {
        if (!toPlace) return;
        const kind = root._kind?.get() || 'other';
        const target = placeTargetOf(kind);
        toPlace.hidden = !target;
        if (!target) return;
        const place = places.find((p) => p.id === root.querySelector('[name="toPlaceId"]').value) || places[0];
        const title = root.querySelector('[name="title"]').value;
        const word = target === 'spot' ? '店' : '宿';
        root.querySelector('[data-to-place-label]').textContent = `${word}にも入れる${places.length > 1 ? '' : `（${place.name || '（名前なし）'}）`}`;
        const hit = findByName(target === 'spot' ? place.spots : place.stays, title);
        root.querySelector('[data-to-place-hint]').textContent = hit
          ? (target === 'spot' ? `「${hit.name}」は店にあります。新しく作らずにつなぎます` : `「${hit.name}」は宿にあります。新しくは作りません`)
          : (target === 'spot' ? '場所ノートの店に Want to go で入ります' : '場所ノートの宿に入ります');
      };
      root._kind = bindChoice(root, 'kind', {
        onChange: (k) => {
          if (bookingBox && !it.booking) bookingBox.hidden = !BOOKING_KINDS.includes(k);
          syncToPlace();
        },
      });
      if (toPlace) {
        const titleBox = root.querySelector('[name="title"]');
        onTextInput(titleBox, () => {
          // 店の名前を選んだら、種類が Other のときは店の種類にそろえる
          const spot = places.map((p) => findByName(p.spots, titleBox.value)).find(Boolean);
          if (spot && root._kind.get() === 'other' && PLAN_TO_SPOT_KINDS.includes(spot.kind)) root.querySelector(`[data-group="kind"] [data-value="${spot.kind}"]`)?.click();
          syncToPlace();
        });
        root.querySelector('[name="toPlaceId"]')?.addEventListener('change', syncToPlace);
        syncToPlace();
      }
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
        // このシートで足した画像だけすぐ消す。前からある画像は、次に開いたときの片付け（app.js）で消す
        deleteImages(imgs.added);
        imgs.added.length = 0;
        close(true);
        onSaved?.();
      });
      if (isNew) focusWhenOpen(root.querySelector('[name="title"]'));
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
        attachments: imgs.atts,
      };
      fields.note = get('note').value;
      fields.url = urlForSave(get('url').value);
      if (fields.url === null) {
        err.textContent = URL_ERROR;
        err.hidden = false;
        return false;
      }
      fields.booking = root.querySelector('[data-booking]').hidden ? (it.booking ?? null) : readBooking(root, it.booking);
      const targetDay = get('day').value;
      const toPlaceOn = isNew && !root.querySelector('[data-to-place]')?.hidden && !!get('toPlace')?.checked;
      const toPlaceId = toPlaceOn ? get('toPlaceId').value : null;
      let added = null;
      store.update((d) => {
        const t = d.trips.find((x) => x.id === tripId);
        if (!t) return;
        if (isNew) {
          const item = { id: newId(), spotId: null, ...fields };
          // 店にも入れる / 宿にも入れる（同じ名前があればつなぐ）
          const place = toPlaceId && d.places.find((p) => p.id === toPlaceId);
          if (place) {
            added = { ...addPlanToPlace(place, { title: fields.title, kind: fields.kind, url: fields.url }, newId), place: place.name || '' };
            if (added.spotId) item.spotId = added.spotId;
          }
          itemsOf(t, targetDay).push(item);
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
      if (added?.target) {
        const word = added.target === 'spot' ? '店' : '宿';
        toast(added.created ? `${added.place}の${word}にも入れました` : added.target === 'spot' ? `${added.place}の店とつなぎました` : `${added.place}の宿にあります`);
      }
      onSaved?.(targetDay);
      return true;
    },
  });
}
