// 旅の画面：Packing（持ち物）
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { confirmDelete } from '../ui/modal.js';
import { toISODate } from '../logic/dates.js';
import { sortTags, tripPackingSections, packingProgress, tripEnded } from '../logic/packing.js';

const FEEDBACK = [['unused', '使わなかった'], ['missing', '足りなかった']];

// 旅の packing を書き換える（なければ作る）
function updatePacking(tripId, fn) {
  store.update((d) => {
    const t = d.trips.find((x) => x.id === tripId);
    if (!t) return;
    t.packing ||= { tagIds: [], checked: {}, skipped: {}, feedback: {} };
    for (const k of ['checked', 'skipped', 'feedback']) t.packing[k] ||= {};
    t.packing.tagIds ||= [];
    fn(t.packing, t);
  });
}

function row(p, trip, { ended, atStay = false }) {
  const pk = trip.packing || {};
  const checked = !!pk.checked?.[p.id];
  const fb = pk.feedback?.[p.id];
  return `
    <li class="pk ${checked && !atStay ? 'is-checked' : ''}" data-id="${esc(p.id)}">
      ${atStay ? `<span class="pk-name">${p.mustHave ? '<span class="star" aria-label="忘れると困る">★</span>' : ''}${esc(p.name)}</span>` : `
        <label class="pk-check">
          <input type="checkbox" data-act="check" ${checked ? 'checked' : ''}>
          <span class="pk-name">${p.mustHave ? '<span class="star" aria-label="忘れると困る">★</span>' : ''}${esc(p.name)}</span>
        </label>`}
      ${ended && !atStay
        ? `<span class="pk-actions">${FEEDBACK.map(([v, l]) => `<button type="button" class="chip chip-xs" data-fb="${v}" aria-pressed="${fb === v}">${l}</button>`).join('')}</span>`
        : `<button type="button" class="icon-btn pk-stay" data-act="stay" aria-label="宿にある" aria-pressed="${atStay}">${icon('stay')}</button>`}
    </li>`;
}

export function render(el, trip) {
  const today = toISODate(new Date());
  const d = store.data;
  const tags = sortTags(d.tags);
  const on = new Set(trip.packing?.tagIds || []);
  const s = tripPackingSections(trip, d.packingItems);
  const prog = packingProgress(trip, d.packingItems);
  const ended = tripEnded(trip, today);
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;

  el.innerHTML = `
    ${tags.length ? `
      <div class="chips" role="group" aria-label="タグ">
        ${tags.map((t) => `<button type="button" class="chip" data-tag="${esc(t.id)}" aria-pressed="${on.has(t.id)}">${esc(t.name)}</button>`).join('')}
      </div>` : '<p class="hint">持ち物マスターでタグを作ると、旅ごとに選べます</p>'}

    <div class="pk-progress">
      <span class="num pk-count">${prog.done} / ${prog.total}</span>
      <span class="bar-track" aria-hidden="true"><span class="bar" style="width:${pct}%"></span></span>
    </div>

    ${s.mustHave.length ? `
      <section class="section" aria-labelledby="pk-must">
        <h2 class="section-title" id="pk-must">忘れると困る</h2>
        <ul class="list card pk-list">${s.mustHave.map((p) => row(p, trip, { ended })).join('')}</ul>
      </section>` : ''}

    ${s.tagged.length ? `
      <section class="section">
        <ul class="list card pk-list">${s.tagged.map((p) => row(p, trip, { ended })).join('')}</ul>
      </section>` : ''}

    <section class="section" aria-labelledby="pk-extra">
      <h2 class="section-title" id="pk-extra">This trip only</h2>
      ${s.extras.length ? `
        <ul class="list card pk-list">
          ${s.extras.map((x) => `
            <li class="pk ${x.checked ? 'is-checked' : ''}" data-extra="${esc(x.id)}">
              <label class="pk-check">
                <input type="checkbox" data-act="check-extra" ${x.checked ? 'checked' : ''}>
                <span class="pk-name">${esc(x.name)}</span>
              </label>
              <button type="button" class="icon-btn pk-del" data-act="del-extra" aria-label="Delete">${icon('close')}</button>
            </li>`).join('')}
        </ul>` : ''}
      <div class="add-row">
        <input class="input" name="extra" autocomplete="off" placeholder="この旅だけの物">
        <button type="button" class="btn btn-secondary" data-act="add-extra">＋ Add</button>
      </div>
    </section>

    ${s.atStay.length ? `
      <section class="section" aria-labelledby="pk-stay">
        <h2 class="section-title" id="pk-stay">宿にある</h2>
        <p class="hint hint-tight">宿にあるので持っていかない</p>
        <ul class="list card pk-list">${s.atStay.map((p) => row(p, trip, { ended, atStay: true })).join('')}</ul>
      </section>` : ''}

    ${!s.mustHave.length && !s.tagged.length && !s.atStay.length && tags.length ? '<p class="empty-line">タグを選ぶと、持ち物が出ます</p>' : ''}

    <a class="btn btn-secondary btn-block pk-master" href="#/packing">持ち物マスター</a>`;

  const rerender = () => render(el, store.data.trips.find((t) => t.id === trip.id) || trip);

  el.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.tag;
    updatePacking(trip.id, (pk) => {
      pk.tagIds = pk.tagIds.includes(id) ? pk.tagIds.filter((x) => x !== id) : [...pk.tagIds, id];
    });
    rerender();
  }));
  el.querySelectorAll('[data-act="check"]').forEach((c) => c.addEventListener('change', () => {
    const id = c.closest('.pk').dataset.id;
    updatePacking(trip.id, (pk) => { if (c.checked) pk.checked[id] = true; else delete pk.checked[id]; });
    rerender();
  }));
  el.querySelectorAll('[data-act="stay"]').forEach((b) => b.addEventListener('click', () => {
    const id = b.closest('.pk').dataset.id;
    updatePacking(trip.id, (pk) => { if (pk.skipped[id]) delete pk.skipped[id]; else pk.skipped[id] = 'atStay'; });
    rerender();
  }));
  el.querySelectorAll('[data-fb]').forEach((b) => b.addEventListener('click', () => {
    const id = b.closest('.pk').dataset.id;
    updatePacking(trip.id, (pk) => { if (pk.feedback[id] === b.dataset.fb) delete pk.feedback[id]; else pk.feedback[id] = b.dataset.fb; });
    rerender();
  }));
  // この旅だけの物
  const extraInput = el.querySelector('[name="extra"]');
  const addExtra = () => {
    const name = extraInput.value.trim();
    if (!name) return extraInput.focus();
    store.update((dd) => {
      const t = dd.trips.find((x) => x.id === trip.id);
      if (t) (t.packingExtras ||= []).push({ id: newId(), name, checked: false });
    });
    rerender();
    el.querySelector('[name="extra"]')?.focus();
  };
  el.querySelector('[data-act="add-extra"]').addEventListener('click', addExtra);
  extraInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addExtra(); } });
  el.querySelectorAll('[data-act="check-extra"]').forEach((c) => c.addEventListener('change', () => {
    const id = c.closest('[data-extra]').dataset.extra;
    store.update((dd) => {
      const x = dd.trips.find((t) => t.id === trip.id)?.packingExtras.find((y) => y.id === id);
      if (x) x.checked = c.checked;
    });
    rerender();
  }));
  el.querySelectorAll('[data-act="del-extra"]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('[data-extra]').dataset.extra;
    const x = trip.packingExtras.find((y) => y.id === id);
    if (!x || !(await confirmDelete(x.name))) return;
    store.update((dd) => {
      const t = dd.trips.find((tt) => tt.id === trip.id);
      if (t) t.packingExtras = t.packingExtras.filter((y) => y.id !== id);
    });
    rerender();
  }));
}
