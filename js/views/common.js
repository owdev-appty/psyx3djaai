import { icon } from '../ui/icons.js';

// 画面上部：見出し・補足・右上の歯車
export function topbar(title, { sub = '', settings = true } = {}) {
  return `
    <header class="topbar">
      <div>
        <h1 class="page-title">${title}</h1>
        ${sub ? `<p class="page-sub">${sub}</p>` : ''}
      </div>
      ${settings ? `<a class="icon-btn" href="#/settings" aria-label="Settings">${icon('settings')}</a>` : ''}
    </header>`;
}
