// 下のタブの Places：場所の一覧（場所の画面のタブはマイルストーン7で作る）
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { topbar } from './common.js';
import { brokenNotice, storageNotice } from './notices.js';
import { openSheet } from '../ui/sheet.js';
import { confirmModal } from '../ui/modal.js';
import { toISODate } from '../logic/dates.js';
import { sortPlaces, placeStats, tripsUsingPlace, removePlace, findPlaceByName } from '../logic/places.js';
import { nextOrder } from '../logic/packing.js';

// 場所の追加・編集（名前・地域）と削除
export function openPlaceForm(place, onSaved) {
  const isNew = !place;
  openSheet({
    title: isNew ? 'New place' : 'Edit',
    body: `
      <label class="field"><span class="field-label">Name</span><input class="input" name="name" value="${esc(place?.name || '')}" autocomplete="off"></label>
      <label class="field"><span class="field-label">Region</span><input class="input" name="region" value="${esc(place?.region || '')}" autocomplete="off"></label>
      ${isNew ? '' : '<button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>'}
      <p class="form-error" role="alert" hidden></p>`,
    onMount(root, close) {
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        const n = tripsUsingPlace(store.data.trips, place.id).length;
        const ok = await confirmModal({
          title: `Delete "${place.name || '（名前なし）'}"?`,
          body: [n ? `${n}件の旅からこの場所が外れます（旅は消えません）` : 'この場所を使っている旅はありません', "This can't be undone."],
          okLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        store.update((d) => removePlace(d, place.id));
        close(true);
        onSaved();
      });
      if (isNew) root.querySelector('[name="name"]').focus();
    },
    onSave(root) {
      const err = root.querySelector('.form-error');
      const name = root.querySelector('[name="name"]').value.trim();
      const region = root.querySelector('[name="region"]').value.trim();
      const fail = (m) => { err.textContent = m; err.hidden = false; return false; };
      if (!name) return fail('名前を入れてください');
      const same = findPlaceByName(store.data.places, name);
      if (same && same.id !== place?.id) return fail('同じ名前の場所があります');
      store.update((d) => {
        if (isNew) d.places.push({ id: newId(), name, region, order: nextOrder(d.places), notesToSelf: [], transportTips: [], stays: [], areas: [], spots: [], links: [] });
        else {
          const p = d.places.find((x) => x.id === place.id);
          if (p) { p.name = name; p.region = region; }
        }
      });
      onSaved();
      return true;
    },
  });
}

export function render(el) {
  const ok = store.status === 'ok';
  const today = toISODate(new Date());
  const places = ok ? sortPlaces(store.data.places) : [];
  el.innerHTML = `
    ${topbar('Places')}
    ${brokenNotice()}
    ${storageNotice()}
    ${ok ? `
      <div class="list-head">
        <span class="row-sub"><span class="num">${places.length}</span>件</span>
        <button type="button" class="btn btn-small btn-primary" data-act="add">＋ New place</button>
      </div>
      ${places.length ? `
        <ul class="list card">
          ${places.map((p) => {
            const s = placeStats(p, store.data.trips, today);
            const meta = [`${s.visits}回`, s.lastYear ? `${s.lastYear}年` : '', `店 ${s.spots}`].filter(Boolean).join(' · ');
            return `
              <li>
                <button type="button" class="row-link row-btn" data-id="${esc(p.id)}">
                  <span class="row-main">
                    <span class="row-title display-title">${esc(p.name || '（名前なし）')}</span>
                    <span class="row-sub">${esc([p.region, meta].filter(Boolean).join(' · '))}</span>
                  </span>
                  <span class="row-amount">Edit</span>
                </button>
              </li>`;
          }).join('')}
        </ul>` : '<p class="empty-line">まだ場所がありません</p>'}` : ''}`;

  const rerender = () => render(el);
  el.querySelector('[data-act="add"]')?.addEventListener('click', () => openPlaceForm(null, rerender));
  el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
    const p = store.data.places.find((x) => x.id === b.dataset.id);
    if (p) openPlaceForm(p, rerender);
  }));
}
