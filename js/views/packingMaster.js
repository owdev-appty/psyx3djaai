// 下のタブの Packing：持ち物マスター
// ・タグで絞り込み（All・各タグ）
// ・つまみ（⋮⋮）でドラッグして並べ替え（絞り込み中は、その中だけの順番を入れ替える）
// ・「選択」で複数選び、まとめてタグを付ける・外す
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { topbar } from './common.js';
import { brokenNotice, storageNotice } from './notices.js';
import { getUi, setUi } from '../uiState.js';
import { openSheet, bindMulti, chip } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { makeSortable } from '../ui/sortable.js';
import { sortTags, filterByTag, reorderSubset, addTagToItems, removeTagFromItems, findTagByName, nextOrder } from '../logic/packing.js';
import { openPackingItemForm } from './packingForm.js';
import { MUST_LABEL } from '../labels.js';

// 選択モードの状態（画面を描き直しても残す。ほかの画面に移ったら終わる）
let selecting = false;
const selected = new Set();

// まとめてタグを付ける・外す：タグを複数選んで「決定」で一度に反映する。付けるときは新しいタグも作れる（決定したときに作る）
function chooseTags(mode, ids, done) {
  const tags = sortTags(store.data.tags);
  const adding = mode === 'add';
  const pending = []; // このシートで足した新しいタグ { id, name }
  openSheet({
    title: adding ? 'タグを付ける' : 'タグを外す',
    saveLabel: '決定',
    body: `
      <p class="hint hint-sheet">${ids.length}件の持ち物。タグを選んで「決定」</p>
      <div class="chips" data-group="pick">${tags.map((t) => chip(t.id, esc(t.name), false)).join('')}</div>
      ${tags.length || adding ? '' : '<p class="hint hint-sheet">タグはまだありません</p>'}
      ${adding ? `
        <div class="new-tag">
          <input class="input" name="newTag" autocomplete="off" placeholder="新しいタグの名前">
          <button type="button" class="btn btn-secondary btn-small" data-act-new>Add</button>
        </div>` : ''}
      <p class="form-error" role="alert" hidden></p>`,
    onMount(root) {
      root._pick = bindMulti(root, 'pick');
      root.querySelector('[data-act-new]')?.addEventListener('click', () => {
        const input = root.querySelector('[name="newTag"]');
        const name = input.value.trim();
        if (!name) return input.focus();
        const box = root.querySelector('[data-group="pick"]');
        const found = findTagByName([...store.data.tags, ...pending], name);
        if (found) box.querySelector(`.chip[data-value="${CSS.escape(found.id)}"]`)?.setAttribute('aria-pressed', 'true');
        else {
          const t = { id: newId(), name };
          pending.push(t);
          box.insertAdjacentHTML('beforeend', chip(t.id, esc(t.name), true));
        }
        input.value = '';
        return undefined;
      });
    },
    onSave(root) {
      const chosen = root._pick.get();
      if (!chosen.length) {
        const err = root.querySelector('.form-error');
        err.textContent = 'タグを選んでください';
        err.hidden = false;
        return false;
      }
      // 変わった持ち物の数（同じ持ち物は1回）
      const before = new Map(store.data.packingItems.filter((p) => ids.includes(p.id)).map((p) => [p.id, JSON.stringify(p.tagIds || [])]));
      store.update((d) => {
        for (const t of pending) if (chosen.includes(t.id)) d.tags.push({ id: t.id, name: t.name, order: nextOrder(d.tags) });
        for (const tagId of chosen) {
          if (adding) addTagToItems(d.packingItems, ids, tagId);
          else removeTagFromItems(d.packingItems, ids, tagId);
        }
      });
      const n = store.data.packingItems.filter((p) => before.has(p.id) && before.get(p.id) !== JSON.stringify(p.tagIds || [])).length;
      toast(adding ? `${n}件にタグを付けました` : `${n}件からタグを外しました`);
      done();
      return true;
    },
  });
}

// ほかの画面に移ったら、選択モードを終える（app.js から呼ぶ）
export function leave() {
  selecting = false;
  selected.clear();
  document.body.classList.remove('is-selecting');
}

export function render(el) {
  const ok = store.status === 'ok';
  const d = store.data;
  const tags = ok ? sortTags(d.tags) : [];
  let filter = getUi('packingFilter');
  if (!tags.some((t) => t.id === filter)) filter = null;
  const items = ok ? filterByTag(d.packingItems, filter) : [];
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  for (const id of [...selected]) if (!d.packingItems.some((p) => p.id === id)) selected.delete(id);

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
        ${selecting
          ? `<span class="row-sub"><span class="num">${selected.size}</span>件を選択中</span>
             <span class="list-head-actions">
               <button type="button" class="btn btn-small btn-secondary" data-act="all">すべて選択</button>
               <button type="button" class="btn btn-small btn-secondary" data-act="none">選択を解除</button>
             </span>`
          : `<span class="row-sub"><span class="num">${items.length}</span>件</span>
             <span class="list-head-actions">
               ${items.length ? '<button type="button" class="btn btn-small btn-secondary" data-act="select">選択</button>' : ''}
               <button type="button" class="btn btn-small btn-primary" data-act="add">＋ Add</button>
             </span>`}
      </div>
      ${items.length ? `
        <ul class="list card packing-master ${selecting ? 'is-selecting' : ''}">
          ${items.map((p) => `
            <li class="pm-row" data-id="${esc(p.id)}">
              ${selecting
                ? `<label class="pm-select"><input type="checkbox" data-act="pick" ${selected.has(p.id) ? 'checked' : ''} aria-label="${esc(p.name || '（名前なし）')}を選ぶ"></label>`
                : `<span class="drag" aria-label="並べ替え" role="img">${icon('grip')}</span>`}
              <button type="button" class="row-link row-btn" data-act="${selecting ? 'toggle' : 'edit'}">
                <span class="row-main">
                  <span class="row-title">${p.mustHave ? `<span class="star" aria-label="${MUST_LABEL}">★</span>` : ''}${esc(p.name || '（名前なし）')}</span>
                  ${(p.tagIds || []).length ? `<span class="tag-chips">${p.tagIds.filter((t) => tagName.has(t)).map((t) => `<span class="status-chip chip-plain">${esc(tagName.get(t))}</span>`).join('')}</span>` : ''}
                  ${p.note ? `<span class="row-sub note-clamp">${esc(p.note)}</span>` : ''}
                </span>
              </button>
            </li>`).join('')}
        </ul>` : '<p class="empty-line">まだ持ち物がありません</p>'}
      ${selecting ? `
        <div class="select-bar">
          <button type="button" class="btn btn-secondary" data-act="tag-add" ${selected.size ? '' : 'disabled'}>タグを付ける</button>
          <button type="button" class="btn btn-secondary" data-act="tag-remove" ${selected.size ? '' : 'disabled'}>タグを外す</button>
          <button type="button" class="btn btn-primary" data-act="done">完了</button>
        </div>` : ''}` : ''}`;

  document.body.classList.toggle('is-selecting', selecting);
  const rerender = () => render(el);

  el.onclick = (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { setUi('packingFilter', f.dataset.filter || null); return rerender(); }
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.dataset.act === 'pick') return;
    const id = btn.closest('[data-id]')?.dataset.id;
    switch (btn.dataset.act) {
      case 'select': selecting = true; return rerender();
      case 'done': selecting = false; selected.clear(); return rerender();
      case 'all': items.forEach((p) => selected.add(p.id)); return rerender();
      case 'none': selected.clear(); return rerender();
      case 'toggle': if (selected.has(id)) selected.delete(id); else selected.add(id); return rerender();
      case 'tag-add': return chooseTags('add', [...selected], rerender);
      case 'tag-remove': return chooseTags('remove', [...selected], rerender);
      case 'add': return openPackingItemForm(null, { defaultTagId: filter, onSaved: rerender });
      case 'edit': {
        const p = store.data.packingItems.find((x) => x.id === id);
        return p && openPackingItemForm(p, { onSaved: rerender });
      }
      default:
    }
  };
  el.onchange = (e) => {
    const box = e.target.closest('[data-act="pick"]');
    if (!box) return;
    const id = box.closest('[data-id]').dataset.id;
    if (box.checked) selected.add(id); else selected.delete(id);
    rerender();
  };

  // 並べ替え（選択モードでないとき）
  const ul = el.querySelector('.packing-master');
  if (ul && !selecting && ul.children.length > 1) {
    makeSortable(ul, {
      onEnd: () => {
        const ids = [...ul.querySelectorAll('[data-id]')].map((li) => li.dataset.id);
        store.update((dd) => reorderSubset(dd.packingItems, ids));
      },
    });
  }
}
