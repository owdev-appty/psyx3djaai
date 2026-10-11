// タグの管理：追加・名前の変更・削除・ドラッグで並べ替え（並べた順番が、持ち物の画面のボタンの順番）
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { openSheet } from '../ui/sheet.js';
import { confirmModal } from '../ui/modal.js';
import { makeSortable } from '../ui/sortable.js';
import { sortTags, tagUsage, nextOrder, removeTag, reorderByIds, findTagByName } from '../logic/packing.js';

function openTagForm(tag, onSaved) {
  const isNew = !tag;
  openSheet({
    title: isNew ? 'Add' : 'Edit',
    body: `
      <label class="field">
        <span class="field-label">Name</span>
        <input class="input" name="name" value="${esc(tag?.name || '')}" autocomplete="off">
      </label>
      ${isNew ? '' : '<button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>'}
      <p class="form-error" role="alert" hidden></p>`,
    onMount(root, close, focusWhenOpen) {
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        const ok = await confirmModal({
          title: `Delete "${tag.name}"?`,
          body: ['持ち物からこのタグが外れます（持ち物は消えません）', "This can't be undone."],
          okLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        store.update((d) => removeTag(d, tag.id));
        close(true);
        onSaved();
      });
      focusWhenOpen(root.querySelector('[name="name"]'));
    },
    onSave(root) {
      const err = root.querySelector('.form-error');
      const name = root.querySelector('[name="name"]').value.trim();
      const fail = (m) => { err.textContent = m; err.hidden = false; return false; };
      if (!name) return fail('名前を入れてください');
      const same = findTagByName(store.data.tags, name);
      if (same && same.id !== tag?.id) return fail('同じ名前のタグがあります');
      store.update((d) => {
        if (isNew) d.tags.push({ id: newId(), name, order: nextOrder(d.tags) });
        else {
          const t = d.tags.find((x) => x.id === tag.id);
          if (t) t.name = name;
        }
      });
      onSaved();
      return true;
    },
  });
}

export function render(el) {
  const tags = sortTags(store.data.tags);
  el.innerHTML = `
    <header class="topbar topbar-back">
      <a class="icon-btn icon-btn-lead" href="#/packing" aria-label="Back">${icon('back')}</a>
      <h1 class="page-title">タグ</h1>
    </header>
    <div class="list-head">
      <span class="row-sub">並べた順番が、持ち物の画面のボタンの順番になります</span>
      <button type="button" class="btn btn-small btn-primary" data-act="add">＋ Add</button>
    </div>
    ${tags.length ? `
      <ul class="list card tag-list">
        ${tags.map((t) => `
          <li data-id="${esc(t.id)}" class="tag-row">
            <span class="drag" aria-label="並べ替え" role="img">${icon('grip')}</span>
            <button type="button" class="row-link row-btn" data-edit>
              <span class="row-main"><span class="row-title">${esc(t.name)}</span></span>
              <span class="row-sub">持ち物<span class="num">${tagUsage(t.id, store.data.packingItems)}</span>件</span>
              <span class="row-amount">Edit</span>
            </button>
          </li>`).join('')}
      </ul>` : '<p class="empty-line">タグはまだありません</p>'}`;

  const rerender = () => render(el);
  el.querySelector('[data-act="add"]').addEventListener('click', () => openTagForm(null, rerender));
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const t = store.data.tags.find((x) => x.id === b.closest('li').dataset.id);
    if (t) openTagForm(t, rerender);
  }));
  const ul = el.querySelector('.tag-list');
  if (ul && ul.children.length > 1) {
    makeSortable(ul, {
      onEnd: () => {
        const ids = [...ul.querySelectorAll('li')].map((li) => li.dataset.id);
        store.update((d) => reorderByIds(d.tags, ids));
      },
    });
  }
}
