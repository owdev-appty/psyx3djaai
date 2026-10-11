// カードに出す小さな画像の列（Plan と Bookings で同じものを使う）
import { esc } from './dom.js';
import { hydrateThumbs } from '../images.js';
import { openImageViewer } from './imageViewer.js';

export function thumbsRow(attachments) {
  const list = (attachments || []).filter((a) => a && a.id);
  if (!list.length) return '';
  return `
    <div class="thumbs" role="group" aria-label="画像">
      ${list.map((a, i) => `
        <button type="button" class="thumb" data-thumb-box data-view="${esc(a.id)}" aria-label="画像を大きく表示（${i + 1}）">
          <img data-thumb="${esc(a.id)}" alt="" loading="lazy">
        </button>`).join('')}
    </div>`;
}

// 画像を入れて、タップで大きく表示できるようにする
export function bindThumbs(root) {
  hydrateThumbs(root);
  root.querySelectorAll('.thumbs [data-view]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    openImageViewer(b.dataset.view);
  }));
}
