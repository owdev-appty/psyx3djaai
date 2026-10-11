import { icon } from './icons.js';
import { imageUrl } from '../images.js';

// 画像を画面いっぱいに表示する。タップか Close で閉じる
export async function openImageViewer(id) {
  const wrap = document.createElement('div');
  wrap.className = 'viewer';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', '画像');
  wrap.innerHTML = `
    <button type="button" class="viewer-close" aria-label="Close">${icon('close')}</button>
    <img class="viewer-img" alt="">`;
  const before = document.activeElement;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    wrap.remove();
    before?.focus?.({ preventScroll: true });
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  wrap.querySelector('.viewer-close').focus();
  const url = await imageUrl(id, 'full');
  if (url) wrap.querySelector('.viewer-img').src = url;
}
