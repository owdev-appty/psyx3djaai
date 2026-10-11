// 持ち物の追加・編集のシート（持ち物マスター）
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { esc } from '../ui/dom.js';
import { openSheet, bindMulti, chip } from '../ui/sheet.js';
import { confirmDelete } from '../ui/modal.js';
import { sortTags, nextOrder, findTagByName, removePackingItem } from '../logic/packing.js';
import { MUST_LABEL } from '../labels.js';

// item が null なら追加。defaultTagId は、絞り込み中のタグ（追加のときに最初から付けておく）
export function openPackingItemForm(item, { defaultTagId = null, onSaved } = {}) {
  const isNew = !item;
  const p = item || { name: '', tagIds: defaultTagId ? [defaultTagId] : [], note: '', mustHave: false, atStay: false };
  const tags = sortTags(store.data.tags);
  // このシートで新しく作るタグ（保存したときに作る。Cancel なら作らない）
  const pending = [];

  const body = `
    <label class="field">
      <span class="field-label">Name</span>
      <input class="input" name="name" value="${esc(p.name)}" autocomplete="off">
    </label>
    <div class="field">
      <span class="field-label">タグ</span>
      <div class="chips" data-group="tags">
        ${tags.map((t) => chip(t.id, esc(t.name), (p.tagIds || []).includes(t.id))).join('')}
      </div>
      <div class="new-tag" data-new-tag hidden>
        <input class="input" name="newTag" autocomplete="off" placeholder="新しいタグの名前">
        <button type="button" class="btn btn-secondary btn-small" data-act-tag-add>Add</button>
      </div>
      <button type="button" class="btn btn-secondary btn-small new-tag-btn" data-act-tag-open>＋ 新しいタグ</button>
    </div>
    <label class="field">
      <span class="field-label">Note</span>
      <textarea class="input" name="note" rows="2">${esc(p.note || '')}</textarea>
    </label>
    <label class="check"><input type="checkbox" name="mustHave" ${p.mustHave === true ? 'checked' : ''}><span>${MUST_LABEL}</span></label>
    <label class="check"><input type="checkbox" name="atStay" ${p.atStay === true ? 'checked' : ''}><span>宿にある</span></label>
    <p class="hint hint-sheet hint-under-check">宿にあることが多い物。旅の Packing に目印（ベッドのアイコン）が付きます</p>
    ${isNew ? '' : '<button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>'}
    <p class="form-error" role="alert" hidden></p>`;

  openSheet({
    title: isNew ? 'Add' : 'Edit',
    body,
    onMount(root, close) {
      root._tags = bindMulti(root, 'tags');
      const box = root.querySelector('[data-new-tag]');
      const input = root.querySelector('[name="newTag"]');
      const err = root.querySelector('.form-error');
      root.querySelector('[data-act-tag-open]').addEventListener('click', (e) => {
        box.hidden = false;
        e.currentTarget.hidden = true;
        input.focus();
      });
      // 新しいタグ：名前を読んで、選んだ状態のチップを足す（保存したときに作る）
      const addTag = () => {
        const name = input.value.trim();
        if (!name) return;
        const chips = root.querySelector('[data-group="tags"]');
        const existing = findTagByName([...store.data.tags, ...pending], name);
        if (existing) {
          chips.querySelector(`.chip[data-value="${CSS.escape(existing.id)}"]`)?.setAttribute('aria-pressed', 'true');
        } else {
          const t = { id: newId(), name };
          pending.push(t);
          chips.insertAdjacentHTML('beforeend', chip(t.id, esc(t.name), true));
        }
        input.value = '';
        err.hidden = true;
      };
      root.querySelector('[data-act-tag-add]').addEventListener('click', addTag);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addTag(); }
      });
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDelete(p.name || '（名前なし）'))) return;
        store.update((d) => removePackingItem(d, p.id));
        close(true);
        onSaved?.();
      });
      if (isNew) root.querySelector('[name="name"]').focus();
    },
    onSave(root) {
      const get = (n) => root.querySelector(`[name="${n}"]`);
      const err = root.querySelector('.form-error');
      const name = get('name').value.trim();
      if (!name) {
        err.textContent = '名前を入れてください';
        err.hidden = false;
        get('name').focus();
        return false;
      }
      // 名前を入れたまま Add を押し忘れたタグも作る
      const typed = get('newTag').value.trim();
      const chosen = root._tags.get();
      store.update((d) => {
        for (const t of pending) {
          if (!chosen.includes(t.id)) continue;
          d.tags.push({ id: t.id, name: t.name, order: nextOrder(d.tags) });
        }
        if (typed) {
          const found = findTagByName(d.tags, typed);
          if (found) { if (!chosen.includes(found.id)) chosen.push(found.id); } else {
            const t = { id: newId(), name: typed, order: nextOrder(d.tags) };
            d.tags.push(t);
            chosen.push(t.id);
          }
        }
        const fields = { name, tagIds: chosen.filter((id) => d.tags.some((t) => t.id === id)), note: get('note').value, mustHave: get('mustHave').checked, atStay: get('atStay').checked };
        if (isNew) d.packingItems.push({ id: newId(), order: nextOrder(d.packingItems), ...fields });
        else {
          const i = d.packingItems.findIndex((x) => x.id === p.id);
          if (i >= 0) d.packingItems[i] = { ...d.packingItems[i], ...fields };
        }
      });
      onSaved?.();
      return true;
    },
  });
}
