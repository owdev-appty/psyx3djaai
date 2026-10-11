import { icon } from '../ui/icons.js';
import { VERSION } from '../version.js';

export function render(el) {
  el.innerHTML = `
    <header class="topbar topbar-back">
      <a class="icon-btn icon-btn-lead" href="#/trips" aria-label="Back">${icon('back')}</a>
      <h1 class="page-title">Settings</h1>
    </header>
    <section class="empty"><p>準備中です</p></section>
    <footer class="about">
      <img class="app-icon sm" src="icons/icon.svg" alt="" width="32" height="32">
      <span>TripNote <span class="mono">v${VERSION}</span></span>
    </footer>`;
}
