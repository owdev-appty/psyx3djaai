// シートの中の画像の欄（Add plan / Edit と Memo で同じものを使う）
//   画像そのものは IndexedDB。保存するまでは、追加した物・消した物を覚えておく
//     保存したら removed を消す。保存せずに閉じたら added を消す
import { esc } from './dom.js';
import { confirmDelete } from './modal.js';
import { addImageFile, deleteImages, hydrateThumbs } from '../images.js';
import { openImageViewer } from './imageViewer.js';

function html(atts, max) {
  const left = Math.max(0, max - atts.length);
  return `
    <span class="field-label">画像</span>
    ${atts.length ? `<div class="att-grid">
      ${atts.map((a, i) => `
        <div class="att" data-thumb-box>
          <button type="button" class="att-view" data-view="${esc(a.id)}" aria-label="画像を大きく表示（${i + 1}）"><img data-thumb="${esc(a.id)}" alt=""></button>
          <button type="button" class="att-del" data-del="${esc(a.id)}" aria-label="画像を削除（${i + 1}）">×</button>
        </div>`).join('')}
    </div>` : ''}
    ${left ? '<button type="button" class="btn btn-secondary btn-small" data-act-addimg>＋ 画像を追加</button>' : ''}
    <p class="hint hint-sheet">${max}枚まで。AI には送りません</p>`;
}

export function mountImagesField(box, { initial = [], max, errEl }) {
  let atts = [...initial];
  const added = [];   // このシートで追加した（保存しなければ消す）
  const removed = []; // 前からあって、このシートで消した（保存したら消す）
  const draw = () => {
    box.innerHTML = html(atts, max);
    hydrateThumbs(box);
  };
  draw();
  box.addEventListener('click', async (e) => {
    const view = e.target.closest('[data-view]');
    if (view) return openImageViewer(view.dataset.view);
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!(await confirmDelete('画像'))) return undefined;
      const id = del.dataset.del;
      atts = atts.filter((a) => a.id !== id);
      if (added.includes(id)) { deleteImages([id]); added.splice(added.indexOf(id), 1); } else removed.push(id);
      return draw();
    }
    if (e.target.closest('[data-act-addimg]')) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.addEventListener('change', async () => {
        const files = [...(input.files || [])].slice(0, Math.max(0, max - atts.length));
        if (!files.length) return;
        box.querySelector('[data-act-addimg]')?.setAttribute('disabled', '');
        if (errEl) errEl.hidden = true;
        for (const f of files) {
          try {
            const a = await addImageFile(f);
            atts.push(a);
            added.push(a.id);
          } catch (ex) {
            if (errEl) {
              errEl.textContent = ex && ex.name === 'QuotaExceededError' ? '保存できませんでした（容量がいっぱいです）' : '画像を読み込めませんでした';
              errEl.hidden = false;
            }
          }
          draw();
        }
      }, { once: true });
      input.click();
    }
    return undefined;
  });
  return {
    get atts() { return atts; },
    added,
    removed,
  };
}
