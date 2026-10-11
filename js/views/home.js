import { topbar } from './common.js';
import { formatDay, toISODate } from '../logic/dates.js';

export function render(el) {
  const today = formatDay(toISODate(new Date()));
  el.innerHTML = `
    ${topbar('Trips', { sub: `<time class="mono">${today}</time>` })}
    <section class="empty">
      <img class="app-icon md" src="icons/icon.svg" alt="" width="64" height="64">
      <p>まだ旅がありません</p>
    </section>`;
}
