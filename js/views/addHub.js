// 下のタブの ＋：どの旅に入れるかを選んで、Quick memo（AI なし・オフラインでも使える）か、
// スクショ取り込み（A）・メモ貼り付け（B）へ
import { esc } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../appStore.js';
import { toISODate } from '../logic/dates.js';
import { nextTrip, upcomingTrips, planningTrips } from '../logic/trips.js';
import { topbar } from './common.js';
import { openScreenshotImport } from './aiScreenshot.js';
import { openMemoImport } from './aiMemo.js';
import { newId } from '../store.js';
import { toast } from '../ui/toast.js';
import { onTextInput } from '../ui/ime.js';

// 書きかけの Quick memo（ほかのタブに移っても消えないように。保存はしない）
let draft = '';

// 選べる旅：次の旅 → これからの旅 → 日程未定の旅 → そのほか（新しい順。行かなかった旅は除く）
export function addTargets(trips, today) {
  const first = [nextTrip(trips, today), ...upcomingTrips(trips, today), ...planningTrips(trips, today)].filter(Boolean);
  const rest = (trips || [])
    .filter((t) => !first.includes(t) && t.status !== 'cancelled')
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  return [...first, ...rest];
}

export function render(el) {
  const list = addTargets(store.data.trips, toISODate(new Date()));
  el.innerHTML = `
    ${topbar('Add')}
    ${list.length ? `
      <section class="section section-first">
        <label class="field">
          <span class="field-label">入れる旅</span>
          <select class="input" name="addTrip">
            ${list.map((t) => `<option value="${esc(t.id)}">${esc(t.title || '（名前なし）')}${t.startDate ? ` · ${esc(t.startDate)}` : ''}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Quick memo</span>
          <textarea class="input" name="quickMemo" rows="4" placeholder="思いついたことをそのまま">${esc(draft)}</textarea>
        </label>
        <button type="button" class="btn btn-primary btn-block" data-act="quick-save">Save</button>
        <p class="hint">選んだ旅の Notes の Memo に入ります。オフラインでも使えます</p>
      </section>
      <section class="section" aria-labelledby="sec-add-ai">
        <h2 class="section-title" id="sec-add-ai">AI</h2>
        <div class="stack">
          <button type="button" class="btn btn-secondary btn-block ai-entry" data-act="shot">${icon('image')}Add from screenshot</button>
          <button type="button" class="btn btn-secondary btn-block ai-entry" data-act="memo">${icon('paste')}メモを貼り付け</button>
        </div>
        <p class="hint">読み取った内容は、確認してから保存します</p>
      </section>`
    : '<section class="empty"><p>先に Trips で旅を作ってください</p></section>'}`;

  const tripId = () => el.querySelector('[name="addTrip"]').value;

  // Quick memo：選んだ旅の Memo に足す
  const box = el.querySelector('[name="quickMemo"]');
  if (box) {
    onTextInput(box, () => { draft = box.value; });
    el.querySelector('[data-act="quick-save"]').addEventListener('click', () => {
      const text = box.value.trim();
      if (!text) { box.focus(); return; }
      const id = tripId();
      let title = '';
      store.update((d) => {
        const t = d.trips.find((x) => x.id === id);
        if (!t) return;
        (t.memos ||= []).push({ id: newId(), text, attachments: [] });
        title = t.title || '（名前なし）';
      });
      draft = '';
      box.value = '';
      toast(`「${title}」の Memo に入れました`);
    });
  }
  el.querySelector('[data-act="shot"]')?.addEventListener('click', () => {
    const id = tripId();
    openScreenshotImport(id, () => { location.hash = `#/trip/${id}/bookings`; });
  });
  el.querySelector('[data-act="memo"]')?.addEventListener('click', () => {
    const id = tripId();
    openMemoImport(id, () => { location.hash = `#/trip/${id}/notes`; });
  });
}
