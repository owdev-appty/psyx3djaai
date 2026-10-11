import { topbar } from './common.js';
import { formatDay, toISODate } from '../logic/dates.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { brokenNotice, storageNotice } from './notices.js';

// マイルストーン4で、次の旅・いまやること・計画中・過去の旅の画面に置き換える。
// 今は、復元したデータが入ったことを確かめられるように旅の名前と日程だけ並べる
export function render(el) {
  const today = formatDay(toISODate(new Date()));
  const trips = store.status === 'ok' ? store.data.trips : [];
  const range = (t) => {
    const a = formatDay(t.startDate), b = formatDay(t.endDate);
    return a && b && a !== b ? `${a} – ${b}` : a || '日程未定';
  };
  el.innerHTML = `
    ${topbar('Trips', { sub: `<time class="mono">${today}</time>` })}
    ${brokenNotice()}
    ${storageNotice()}
    ${trips.length ? `
      <ul class="simple-list">
        ${trips.map((t) => `<li><span class="display-title">${esc(t.title || '（名前なし）')}</span><span class="mono sub">${esc(range(t))}</span></li>`).join('')}
      </ul>` : `
      <section class="empty">
        <img class="app-icon md" src="icons/icon.svg" alt="" width="64" height="64">
        <p>まだ旅がありません</p>
      </section>`}`;
}
