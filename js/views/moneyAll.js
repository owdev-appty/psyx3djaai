// 下のタブの Money：すべての旅のお金のまとめ（By year・By place）
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { topbar } from './common.js';
import { toISODate } from '../logic/dates.js';
import { brokenNotice, storageNotice } from './notices.js';
import { totalsByYear, perNightByPlace, formatYen, formatMiles } from '../logic/money.js';

export function render(el) {
  const ok = store.status === 'ok';
  const d = store.data;
  const years = ok ? totalsByYear(d.trips, d.settings) : [];
  const places = ok ? perNightByPlace(d.trips, d.places, d.settings, toISODate(new Date())) : [];

  el.innerHTML = `
    ${topbar('Money')}
    ${brokenNotice()}
    ${storageNotice()}
    ${years.length ? `
      <section class="section" aria-labelledby="sec-year">
        <h2 class="section-title" id="sec-year">By year</h2>
        <ul class="list card">
          ${years.map((y) => `
            <li class="row-static">
              <span class="row-main">
                <span class="row-title mono">${esc(y.year)}</span>
                <span class="row-sub">旅${y.trips}件</span>
              </span>
              <span class="row-amount-lg num">${formatYen(y.yen)}${y.miles ? `<span class="row-sub"> + ${formatMiles(y.miles)}</span>` : ''}</span>
            </li>`).join('')}
        </ul>
      </section>` : ''}
    ${places.length ? `
      <section class="section" aria-labelledby="sec-place">
        <h2 class="section-title" id="sec-place">By place</h2>
        <ul class="list card">
          ${places.map((p) => `
            <li class="row-static">
              <span class="row-main">
                <span class="row-title display-title">${esc(p.place.name || '（名前なし）')}</span>
                <span class="row-sub">${p.trips}回 · ${p.nights}泊 · 合計 <span class="num">${formatYen(p.yen)}</span></span>
              </span>
              <span class="row-amount-lg num">${formatYen(p.perNight)}<span class="row-sub"> / 泊</span></span>
            </li>`).join('')}
        </ul>
        <p class="hint">1泊あたり＝その場所の終わった旅の合計 ÷ 泊数の合計（日帰りと行かなかった旅は除く）</p>
      </section>` : ''}
    ${ok && !years.length ? '<section class="empty"><p>まだ支出がありません</p></section>' : ''}`;
}
