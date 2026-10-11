// 旅の画面：Notes（To do・Unsorted・ふりかえり・候補）
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { confirmDelete } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { onTextInput } from '../ui/ime.js';
import { openFormSheet } from '../ui/formSheet.js';
import { formatDay } from '../logic/dates.js';
import { tripDates } from '../logic/trips.js';
import { SLOT_LABELS } from '../logic/plan.js';
import { splitFirstLine } from '../logic/places.js';
import { SPOT_KINDS, SPOT_KIND_LABELS } from '../labels.js';
import { hostOf } from './tripPlan.js';
import { itemsOf, UNSCHEDULED } from './itemForm.js';

const DESTS = [['plan', '予定'], ['note', 'Notes to self'], ['tip', '移動のコツ'], ['spot', '店']];

// Unsorted のメモを、予定・Notes to self・移動のコツ・店へ移す。移したら Unsorted から消す
function openMove(trip, index, done) {
  const text = trip.unsortedNotes[index];
  const places = [
    ...(trip.placeIds || []).map((id) => store.data.places.find((p) => p.id === id)).filter(Boolean),
    ...store.data.places.filter((p) => !(trip.placeIds || []).includes(p.id)),
  ];
  const days = [...tripDates(trip).map((d) => [d, formatDay(d)]), [UNSCHEDULED, '日程未定']];
  const slots = [['', '決めない'], ...['morning', 'afternoon', 'evening', 'night'].map((s) => [s, SLOT_LABELS[s]])];
  const placeOpts = places.map((p) => [p.id, p.name || '（名前なし）']);
  const placeKinds = ['note', 'tip', 'spot'];
  openFormSheet({
    title: 'Move',
    saveLabel: 'Move',
    fields: [
      { name: 'dest', label: '移す先', type: 'choice', value: 'plan', required: true, options: DESTS },
      { name: 'day', label: 'Day', type: 'select', value: days[0][0], options: days, showIf: { name: 'dest', values: ['plan'] } },
      { name: 'slot', label: 'いつ？', type: 'select', value: '', options: slots, showIf: { name: 'dest', values: ['plan'] } },
      ...(placeOpts.length ? [{ name: 'place', label: 'Place', type: 'select', value: placeOpts[0][0], options: placeOpts, showIf: { name: 'dest', values: placeKinds } }] : []),
      { name: 'kind', label: 'Kind', type: 'choice', value: 'food', options: SPOT_KINDS.map((k) => [k, SPOT_KIND_LABELS[k]]), showIf: { name: 'dest', values: ['spot'] } },
    ],
    onSave(v) {
      if (placeKinds.includes(v.dest) && !v.place) return '先に Places で場所を作ってください';
      const { title, rest } = splitFirstLine(text);
      store.update((d) => {
        const t = d.trips.find((x) => x.id === trip.id);
        if (!t) return;
        const p = d.places.find((x) => x.id === v.place);
        if (v.dest === 'plan') {
          itemsOf(t, v.day).push({ id: newId(), title, kind: 'other', time: null, endTime: null, slot: v.slot || null, status: null, spotId: null, note: rest, url: '', booking: null, attachments: [] });
        } else if (v.dest === 'note' && p) {
          (p.notesToSelf ||= []).push({ id: newId(), text, fromTripId: t.id });
        } else if (v.dest === 'tip' && p) {
          (p.transportTips ||= []).push({ id: newId(), title, text: rest, url: '' });
        } else if (v.dest === 'spot' && p) {
          (p.spots ||= []).push({ id: newId(), name: title, kind: v.kind || 'food', status: 'want', note: rest, hours: '', url: '', phone: '', area: '' });
        }
        t.unsortedNotes.splice(index, 1);
      });
      toast('移しました');
      done();
      return undefined;
    },
  });
}

export function render(el, trip) {
  const todos = trip.todos || [];
  const unsorted = trip.unsortedNotes || [];
  const cands = trip.candidates || [];

  el.innerHTML = `
    <section class="section section-first" aria-labelledby="nt-todo">
      <h2 class="section-title" id="nt-todo">To do</h2>
      ${todos.length ? `
        <ul class="list card pk-list">
          ${todos.map((td) => `
            <li class="pk ${td.done ? 'is-checked' : ''}" data-id="${esc(td.id)}">
              <label class="pk-check"><input type="checkbox" data-act="todo-check" ${td.done ? 'checked' : ''}><span class="pk-name">${esc(td.text || '')}</span></label>
              <button type="button" class="icon-btn pk-del" data-act="todo-del" aria-label="Delete">${icon('close')}</button>
            </li>`).join('')}
        </ul>` : ''}
      <div class="add-row">
        <input class="input" name="todo" autocomplete="off" placeholder="To do">
        <button type="button" class="btn btn-secondary" data-act="todo-add">＋ Add</button>
      </div>
    </section>

    <section class="section" aria-labelledby="nt-unsorted">
      <h2 class="section-title" id="nt-unsorted">Unsorted</h2>
      ${unsorted.length ? `
        <ul class="cards">
          ${unsorted.map((u, i) => `
            <li class="pcard unsorted" data-index="${i}">
              <div class="pcard-body">
                <span class="pcard-text">${esc(u)}</span>
                <div class="spot-actions">
                  <button type="button" class="btn btn-small btn-secondary" data-act="move">Move</button>
                  <button type="button" class="btn btn-small btn-danger-soft" data-act="unsorted-del">Delete</button>
                </div>
              </div>
            </li>`).join('')}
        </ul>` : '<p class="hint">分類できなかったメモはありません</p>'}
    </section>

    <section class="section">
      <label class="field">
        <span class="section-title">ふりかえり</span>
        <textarea class="input" name="lookBack" rows="3">${esc(trip.lookBack || '')}</textarea>
      </label>
    </section>

    ${cands.length ? `
      <section class="section" aria-labelledby="nt-cand">
        <h2 class="section-title" id="nt-cand">候補</h2>
        <ul class="list card">
          ${cands.map((c) => `
            <li>
              <a class="row-link" href="#/trip/${esc(trip.id)}/bookings">
                <span class="row-main">
                  <span class="row-title">${esc(c.title || '（名前なし）')}</span>
                  ${c.detail ? `<span class="row-sub note-clamp">${esc(c.detail)}</span>` : ''}
                  ${c.url ? `<span class="row-sub">${esc(hostOf(c.url))}</span>` : ''}
                </span>
                <span class="row-chevron" aria-hidden="true">${icon('chevron')}</span>
              </a>
            </li>`).join('')}
        </ul>
      </section>` : ''}`;

  const rerender = () => render(el, store.data.trips.find((t) => t.id === trip.id) || trip);
  const updateTrip = (fn) => store.update((d) => { const t = d.trips.find((x) => x.id === trip.id); if (t) fn(t); });

  // To do
  const todoInput = el.querySelector('[name="todo"]');
  const addTodo = () => {
    const text = todoInput.value.trim();
    if (!text) return todoInput.focus();
    updateTrip((t) => { (t.todos ||= []).push({ id: newId(), text, done: false }); });
    rerender();
  };
  el.querySelector('[data-act="todo-add"]').addEventListener('click', addTodo);
  todoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addTodo(); } });

  el.onchange = (e) => {
    const box = e.target.closest('[data-act="todo-check"]');
    if (!box) return;
    const id = box.closest('[data-id]').dataset.id;
    updateTrip((t) => { const td = t.todos.find((x) => x.id === id); if (td) td.done = box.checked; });
    rerender();
  };
  el.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'todo-del') {
      const id = btn.closest('[data-id]').dataset.id;
      const td = trip.todos.find((x) => x.id === id);
      if (!td || !(await confirmDelete(td.text))) return;
      updateTrip((t) => { t.todos = t.todos.filter((x) => x.id !== id); });
      rerender();
    }
    if (act === 'move' || act === 'unsorted-del') {
      const i = Number(btn.closest('[data-index]').dataset.index);
      if (act === 'move') return openMove(store.data.trips.find((t) => t.id === trip.id), i, rerender);
      const text = trip.unsortedNotes[i] || '';
      if (!(await confirmDelete(text.slice(0, 20)))) return;
      updateTrip((t) => { t.unsortedNotes.splice(i, 1); });
      rerender();
    }
    return undefined;
  };

  // ふりかえり（ふりかえりの画面と同じ欄）
  const lb = el.querySelector('[name="lookBack"]');
  onTextInput(lb, () => { const v = lb.value; updateTrip((t) => { t.lookBack = v; }); });
}
