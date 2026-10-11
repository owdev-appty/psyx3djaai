import { topbar } from './common.js';

// まだ作っていない画面（各マイルストーンで置き換える）
export function placeholder(title) {
  return (el) => {
    el.innerHTML = `
      ${topbar(title)}
      <section class="empty"><p>準備中です</p></section>`;
  };
}
