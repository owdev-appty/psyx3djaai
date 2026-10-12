// 旅の画面：Packing（持ち物）
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { confirmDelete } from '../ui/modal.js';
import { toISODate } from '../logic/dates.js';
import { sortTags, tripPackingSections, packingProgress } from '../logic/packing.js';
import { MUST_LABEL } from '../labels.js';
import { onTextInput, isSubmitEnter } from '../ui/ime.js';

// 旅の packing を書き換える（なければ作る）
function updateTrip(tripId, fn) {
  store.update((d) => {
    const t = d.trips.find((x) => x.id === tripId);
    if (!t) return;
    t.packing ||= { tagIds: [], checked: {} };
    t.packing.checked ||= {};
    t.packing.tagIds ||= [];
    t.packingExtras ||= [];
    fn(t.packing, t);
  });
}

const star = (p) => (p.mustHave ? `<span class="star" aria-label="${MUST_LABEL}">★</span>` : '');

// 1行。kind: 'item'（マスターの物）/ 'extra'（この旅だけの物）
function row({ kind, id, name, mustHave = false, checked }) {
  const key = `data-kind="${kind}" data-id="${esc(id)}"`;
  const label = `${mustHave ? star({ mustHave }) : ''}${esc(name || '（名前なし）')}`;
  return `
    <li class="pk ${checked ? 'is-checked' : ''}" ${key}>
      <label class="pk-check"><input type="checkbox" data-act="check" ${checked ? 'checked' : ''}><span class="pk-name">${label}</span></label>
      ${kind === 'extra' ? `<button type="button" class="icon-btn pk-del" data-act="del-extra" aria-label="Delete">${icon('close')}</button>` : ''}
    </li>`;
}

export function render(el, trip) {
  const today = toISODate(new Date());
  const d = store.data;
  const tags = sortTags(d.tags);
  const on = new Set(trip.packing?.tagIds || []);
  const s = tripPackingSections(trip, d.packingItems, d.tags);
  const prog = packingProgress(trip, d.packingItems);
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const checked = trip.packing?.checked || {};
  const itemRow = (p) => row({ kind: 'item', id: p.id, name: p.name, mustHave: p.mustHave, checked: !!checked[p.id] });
  const extraRow = (x) => row({ kind: 'extra', id: x.id, name: x.name, checked: !!x.checked });

  el.innerHTML = `
    ${tags.length ? `
      <div class="chips" role="group" aria-label="タグ">
        ${tags.map((t) => `<button type="button" class="chip" data-act="tag" data-tag="${esc(t.id)}" aria-pressed="${on.has(t.id)}">${esc(t.name)}</button>`).join('')}
      </div>` : '<p class="hint">持ち物マスターでタグを作ると、旅ごとに選べます</p>'}

    <div class="pk-progress">
      <span class="num pk-count">${prog.done} / ${prog.total}</span>
      <span class="bar-track" aria-hidden="true"><span class="bar" style="width:${pct}%"></span></span>
    </div>

    ${s.must.length ? `
      <section class="section" aria-labelledby="pk-must">
        <h2 class="section-title" id="pk-must">${MUST_LABEL}</h2>
        <ul class="list card pk-list">${s.must.map((p) => itemRow(p)).join('')}</ul>
      </section>` : ''}

    ${s.byTag.map((g, i) => `
      <section class="section" aria-labelledby="pk-tag-${i}">
        <h2 class="section-title" id="pk-tag-${i}">${esc(g.tag.name)}</h2>
        ${g.items.length
          ? `<ul class="list card pk-list">${g.items.map((p) => itemRow(p)).join('')}</ul>`
          : '<p class="hint hint-tight">このタグの持ち物はまだありません</p>'}
      </section>`).join('')}

    <section class="section" aria-labelledby="pk-extra">
      <h2 class="section-title" id="pk-extra">This trip only</h2>
      ${s.extras.length ? `<ul class="list card pk-list">${s.extras.map((x) => extraRow(x)).join('')}</ul>` : ''}
      <div class="add-row">
        <input class="input" name="extra" autocomplete="off" placeholder="This trip only">
        <button type="button" class="btn btn-secondary" data-act="add-extra">＋ Add</button>
      </div>
      <label class="field pk-note">
        <span class="field-label">Note</span>
        <textarea class="input autogrow" name="packingNote" rows="3" placeholder="例：タオル、ドライヤーは宿にある">${esc(trip.packingNote || '')}</textarea>
      </label>
    </section>`;

  const rerender = () => render(el, store.data.trips.find((t) => t.id === trip.id) || trip);

  // 操作は、この画面の1か所でまとめて受ける（ボタンの中のどこを押しても動くように）
  el.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.dataset.act === 'check') return;
    const id = btn.closest('.pk')?.dataset.id;
    switch (btn.dataset.act) {
      case 'tag': {
        const tagId = btn.dataset.tag;
        updateTrip(trip.id, (pk) => { pk.tagIds = pk.tagIds.includes(tagId) ? pk.tagIds.filter((x) => x !== tagId) : [...pk.tagIds, tagId]; });
        return rerender();
      }
      case 'del-extra': {
        const x = (trip.packingExtras || []).find((y) => y.id === id);
        if (!x || !(await confirmDelete(x.name))) return;
        updateTrip(trip.id, (pk, t) => { t.packingExtras = t.packingExtras.filter((y) => y.id !== id); });
        return rerender();
      }
      case 'add-extra': return addExtra();
      default:
    }
  };
  // チェックは同じ物なら1つ（MUST! とタグの欄の両方に反映）
  el.onchange = (e) => {
    const box = e.target.closest('[data-act="check"]');
    if (!box) return;
    const li = box.closest('.pk');
    const { kind, id } = li.dataset;
    updateTrip(trip.id, (pk, t) => {
      if (kind === 'item') { if (box.checked) pk.checked[id] = true; else delete pk.checked[id]; }
      else { const x = t.packingExtras.find((y) => y.id === id); if (x) x.checked = box.checked; }
    });
    rerender();
  };

  // この旅だけの物
  const extraInput = el.querySelector('[name="extra"]');
  function addExtra() {
    const name = extraInput.value.trim();
    if (!name) return extraInput.focus();
    updateTrip(trip.id, (pk, t) => { t.packingExtras.push({ id: newId(), name, checked: false }); });
    rerender();
  }
  extraInput.addEventListener('keydown', (e) => { if (isSubmitEnter(e)) { e.preventDefault(); addExtra(); } });

  // 持ち物のメモ：入力のたびに保存（変換中は保存しない）。描き直さない（入力中の欄を消さないように）
  const note = el.querySelector('[name="packingNote"]');
  const grow = () => { note.style.height = 'auto'; note.style.height = `${note.scrollHeight}px`; };
  grow();
  note.addEventListener('input', grow);
  onTextInput(note, () => {
    const value = note.value;
    store.update((dd) => {
      const t = dd.trips.find((x) => x.id === trip.id);
      if (t) t.packingNote = value;
    });
  });
}
