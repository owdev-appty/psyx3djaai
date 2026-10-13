// 下のタブの Places：場所の一覧（タップで場所の画面。つまみで並べ替え）
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { topbar } from './common.js';
import { brokenNotice, storageNotice } from './notices.js';
import { openSheet } from '../ui/sheet.js';
import { confirmModal } from '../ui/modal.js';
import { toISODate } from '../logic/dates.js';
import { sortPlaces, placeStats, tripsUsingPlace, removePlace, findPlaceByName } from '../logic/places.js';
import { nextOrder, reorderByIds } from '../logic/packing.js';
import { icon } from '../ui/icons.js';
import { makeSortable } from '../ui/sortable.js';
import { onTextInput } from '../ui/ime.js';
import { setSeenDay, focusSpotSearch } from '../uiState.js';
import { searchAll, SEARCH_TYPES, SEARCH_TYPE_LABELS } from '../logic/search.js';

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
    onMount(root, close, focusWhenOpen) {
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
      if (isNew) focusWhenOpen(root.querySelector('[name="name"]'));
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

// 検索の言葉（アプリを開いている間だけ覚える。結果から戻ってきたときに同じ結果を出すため）
let lastQuery = '';

function searchResultsHtml(list) {
  if (!list.length) return '<p class="empty-line">見つかりません</p>';
  return SEARCH_TYPES.filter((t) => list.some((r) => r.type === t)).map((t) => `
    <section class="section">
      <h2 class="section-title">${SEARCH_TYPE_LABELS[t]}</h2>
      <ul class="list card">
        ${list.filter((r) => r.type === t).map((r) => `
          <li>
            <a class="row-link" href="${esc(r.href)}" data-type="${r.type}" ${r.tripId ? `data-trip="${esc(r.tripId)}"` : ''} ${r.day ? `data-day="${esc(r.day)}"` : ''} ${r.placeId ? `data-place="${esc(r.placeId)}"` : ''} ${r.spotName ? `data-spot-name="${esc(r.spotName)}"` : ''}>
              <span class="row-main">
                <span class="row-title">${esc(r.label)}</span>
                ${r.sub ? `<span class="row-sub">${esc(r.sub)}</span>` : ''}
              </span>
              <span class="row-chevron" aria-hidden="true">${icon('chevron')}</span>
            </a>
          </li>`).join('')}
      </ul>
    </section>`).join('');
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
      <input class="input app-search" type="search" name="appSearch" value="${esc(lastQuery)}" placeholder="店・メモ・予定を探す" autocomplete="off" enterkeyhint="search" aria-label="Search">
      <div data-search-results hidden></div>
      <div data-place-list>
      <div class="list-head">
        <span class="row-sub"><span class="num">${places.length}</span>件</span>
        <button type="button" class="btn btn-small btn-primary" data-act="add">＋ New place</button>
      </div>
      ${places.length ? `
        <ul class="list card place-list">
          ${places.map((p) => {
            const s = placeStats(p, store.data.trips, today);
            // 行った回数が0の場所（空港のノートなど）は、回数も年も出さない
            const meta = [p.region, s.visits ? `${s.visits}回` : '', s.visits && s.lastYear ? `${s.lastYear}年` : '', `店 ${s.spots}`].filter(Boolean).join(' · ');
            return `
              <li class="pm-row" data-id="${esc(p.id)}">
                <span class="drag" aria-label="並べ替え" role="img">${icon('grip')}</span>
                <a class="row-link" href="#/place/${esc(p.id)}/notes">
                  <span class="row-main">
                    <span class="row-title display-title">${esc(p.name || '（名前なし）')}</span>
                    <span class="row-sub">${esc(meta)}</span>
                  </span>
                  <span class="row-chevron" aria-hidden="true">${icon('chevron')}</span>
                </a>
              </li>`;
          }).join('')}
        </ul>` : '<p class="empty-line">まだ場所がありません。右上の ＋ New place から作れます</p>'}
      </div>` : ''}`;

  const rerender = () => render(el);
  el.querySelector('[data-act="add"]')?.addEventListener('click', () => openPlaceForm(null, rerender));

  // アプリ全体の検索：言葉を入れると、場所の一覧の代わりに結果を出す（オフラインでも使える）
  const q = el.querySelector('[name="appSearch"]');
  if (q) {
    const results = el.querySelector('[data-search-results]');
    const list = el.querySelector('[data-place-list]');
    const draw = () => {
      lastQuery = q.value;
      const has = !!q.value.trim();
      results.hidden = !has;
      list.hidden = has;
      if (has) results.innerHTML = searchResultsHtml(searchAll(store.data, q.value));
    };
    onTextInput(q, draw);
    q.addEventListener('search', draw);
    draw();
    // 結果を開くとき：予定はその日、店は店のタブをその名前で絞り込んだ状態で開く
    results.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-type]');
      if (!a) return;
      if (a.dataset.type === 'plan' && a.dataset.trip) setSeenDay(a.dataset.trip, a.dataset.day);
      if (a.dataset.type === 'spot' && a.dataset.place) focusSpotSearch(a.dataset.place, a.dataset.spotName);
    });
  }
  const ul = el.querySelector('.place-list');
  if (ul && ul.children.length > 1) {
    makeSortable(ul, {
      onEnd: () => {
        const ids = [...ul.querySelectorAll('[data-id]')].map((li) => li.dataset.id);
        store.update((d) => reorderByIds(d.places, ids));
      },
    });
  }
}
