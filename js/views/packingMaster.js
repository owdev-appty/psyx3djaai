// 下のタブの Packing：持ち物マスター
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { topbar } from './common.js';
import { brokenNotice, storageNotice } from './notices.js';
import { getUi, setUi } from '../uiState.js';
import { sortTags, filterByTag } from '../logic/packing.js';
import { openPackingItemForm } from './packingForm.js';

export function render(el) {
  const ok = store.status === 'ok';
  const d = store.data;
  const tags = ok ? sortTags(d.tags) : [];
  let filter = getUi('packingFilter');
  if (!tags.some((t) => t.id === filter)) filter = null;
  const items = ok ? filterByTag(d.packingItems, filter) : [];
  const tagName = new Map(tags.map((t) => [t.id, t.name]));

  el.innerHTML = `
    ${topbar('持ち物マスター')}
    ${brokenNotice()}
    ${storageNotice()}
    ${ok ? `
      <div class="chips chips-scroll" role="group" aria-label="タグ">
        <button type="button" class="chip" data-filter="" aria-pressed="${!filter}">All</button>
        ${tags.map((t) => `<button type="button" class="chip" data-filter="${esc(t.id)}" aria-pressed="${filter === t.id}">${esc(t.name)}</button>`).join('')}
        <a class="chip chip-link" href="#/tags">＋ タグ</a>
      </div>
      <div class="list-head">
        <span class="row-sub"><span class="num">${items.length}</span>件</span>
        <button type="button" class="btn btn-small btn-primary" data-act="add">＋ Add</button>
      </div>
      ${items.length ? `
        <ul class="list card packing-master">
          ${items.map((p) => `
            <li>
              <button type="button" class="row-link row-btn" data-id="${esc(p.id)}">
                <span class="row-main">
                  <span class="row-title">${p.mustHave ? '<span class="star" aria-label="忘れると困る">★</span>' : ''}${esc(p.name || '（名前なし）')}</span>
                  ${(p.tagIds || []).length ? `<span class="tag-chips">${p.tagIds.filter((t) => tagName.has(t)).map((t) => `<span class="status-chip chip-plain">${esc(tagName.get(t))}</span>`).join('')}</span>` : ''}
                  ${p.note ? `<span class="row-sub note-clamp">${esc(p.note)}</span>` : ''}
                </span>
              </button>
            </li>`).join('')}
        </ul>` : '<p class="empty-line">まだ持ち物がありません</p>'}` : ''}`;

  el.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    setUi('packingFilter', b.dataset.filter || null);
    render(el);
  }));
  el.querySelector('[data-act="add"]')?.addEventListener('click', () => {
    openPackingItemForm(null, { defaultTagId: filter, onSaved: () => render(el) });
  });
  el.querySelectorAll('.packing-master [data-id]').forEach((b) => b.addEventListener('click', () => {
    const p = store.data.packingItems.find((x) => x.id === b.dataset.id);
    if (p) openPackingItemForm(p, { onSaved: () => render(el) });
  }));
}
