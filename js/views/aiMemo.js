// B. メモ貼り付け
//   メモを貼る →「振り分ける」で AI へ（メールアドレス・電話番号・予約番号などは伏せ字にしてから送る）
//   → 確認画面で1件ずつ「保存する」と行き先（予定・予約・持ち物・To do・Memo・Unsorted）を選ぶ →「保存」
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { callAI } from '../aiClient.js';
import { formatDay, toISODate } from '../logic/dates.js';
import { tripDates } from '../logic/trips.js';
import { SLOT_LABELS } from '../logic/plan.js';
import {
  UNSCHEDULED, MEMO_DESTS, MEMO_DEST_LABELS, memoDrafts, applyMemoDrafts, savedSummary, maskForAI, aiContext, aiErrorMessage,
} from '../logic/ai.js';
import { KINDS, KIND_LABELS } from '../labels.js';
import { itemsOf } from './itemForm.js';
import { usageLine } from './aiScreenshot.js';

const MAX_CHARS = 8000; // 長いと AI の答えが上限を超えて失敗しやすいので、分けて貼ってもらう
const TIMED = ['plan', 'booking']; // 日・時刻・種類を選べる行き先

function draftHtml(d, i, days) {
  const n = (k) => `m${i}_${k}`;
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const slots = [['', '決めない'], ...['morning', 'afternoon', 'evening', 'night'].map((s) => [s, SLOT_LABELS[s]])];
  return `
    <fieldset class="ai-card" data-draft="${i}">
      <legend class="sr-only">${i + 1}件目</legend>
      <label class="check check-tight ai-include"><input type="checkbox" name="${n('include')}" ${d.include ? 'checked' : ''}><span>保存する</span></label>
      <div class="ai-fields">
        ${d.text && d.text !== d.title ? `<p class="ai-src">${esc(d.text)}</p>` : ''}
        <label class="field"><span class="field-label">行き先</span><select class="input" name="${n('dest')}" data-dest>${opt(MEMO_DESTS.map((x) => [x, MEMO_DEST_LABELS[x]]), d.dest)}</select></label>
        <label class="field"><span class="field-label">Title</span><input class="input" name="${n('title')}" value="${esc(d.title)}" autocomplete="off"></label>
        <div data-timed ${TIMED.includes(d.dest) ? '' : 'hidden'}>
          <label class="field"><span class="field-label">Day</span><select class="input" name="${n('day')}">${opt(days, d.day)}</select></label>
          <div class="field-row">
            <label class="field"><span class="field-label">Time</span><input class="input mono" type="time" name="${n('time')}" value="${esc(d.time)}"></label>
            <label class="field"><span class="field-label">いつ？</span><select class="input" name="${n('slot')}">${opt(slots, d.slot)}</select></label>
          </div>
          <label class="field"><span class="field-label">Kind</span><select class="input" name="${n('kind')}">${opt(KINDS.map((k) => [k, KIND_LABELS[k]]), d.kind || 'other')}</select></label>
          <label class="field"><span class="field-label">Note</span><textarea class="input" name="${n('note')}" rows="2">${esc(d.note)}</textarea></label>
        </div>
      </div>
    </fieldset>`;
}

function readDrafts(root, drafts) {
  return drafts.map((d, i) => {
    const v = (k) => root.querySelector(`[name="m${i}_${k}"]`)?.value ?? '';
    return {
      ...d,
      include: !!root.querySelector(`[name="m${i}_include"]`)?.checked,
      dest: v('dest'),
      title: v('title').trim(),
      day: v('day'),
      time: v('time'),
      slot: v('slot'),
      kind: v('kind'),
      note: v('note'),
    };
  });
}

export function openMemoImport(tripId, onSaved) {
  let drafts = null;
  let busy = false;
  let pasted = '';
  const trip = () => store.data.trips.find((t) => t.id === tripId);

  const pasteHtml = () => `
    <label class="field">
      <span class="field-label">メモ</span>
      <textarea class="input" name="memoPaste" rows="10" placeholder="iPhone のメモをここに貼り付け">${esc(pasted)}</textarea>
    </label>
    <p class="hint hint-sheet">予定・予約・持ち物・To do・Memo に振り分けます。メールアドレス・電話番号・カード番号・予約番号などは伏せ字にしてから AI に送ります。${MAX_CHARS.toLocaleString('ja-JP')}文字まで。</p>
    ${usageLine()}
    <p class="ai-status" role="status" aria-live="polite" hidden></p>
    <p class="form-error" role="alert" hidden></p>`;

  const confirmHtml = () => {
    const days = [...tripDates(trip()).map((d, i) => [d, `Day ${i + 1} · ${formatDay(d)}`]), [UNSCHEDULED, '日程未定']];
    if (!drafts.length) return '<p class="ai-empty">振り分けられるものがありませんでした</p><p class="form-error" role="alert" hidden></p>';
    return `
      <p class="hint hint-sheet">振り分けた案です。保存するものと行き先を選んで「保存」を押してください。まだ何も保存していません。</p>
      <div class="ai-bulk"><button type="button" class="btn btn-secondary btn-small" data-act-all="1">すべて選ぶ</button><button type="button" class="btn btn-secondary btn-small" data-act-all="0">すべて外す</button></div>
      ${drafts.map((d, i) => draftHtml(d, i, days)).join('')}
      ${usageLine()}
      <p class="form-error" role="alert" hidden></p>`;
  };

  const { root } = openSheet({
    title: 'メモを貼り付け',
    saveLabel: '振り分ける',
    body: '<div data-ai-body></div>',
    onMount(sheet, close, focusWhenOpen) {
      sheet.querySelector('[data-ai-body]').innerHTML = pasteHtml();
      focusWhenOpen(sheet.querySelector('[name="memoPaste"]'));
    },
    onSave(sheet) {
      if (busy) return false;
      if (!drafts) { sort(); return false; }
      return save(sheet);
    },
  });
  const body = root.querySelector('[data-ai-body]');
  const saveBtn = root.querySelector('[data-act="save"]');
  const showError = (msg) => {
    const err = body.querySelector('.form-error');
    err.textContent = msg;
    err.hidden = false;
  };

  // 行き先で、日・時刻などの欄を出し入れ。すべて選ぶ / 外す
  body.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-dest]');
    if (sel) sel.closest('.ai-card').querySelector('[data-timed]').hidden = !TIMED.includes(sel.value);
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act-all]');
    if (b) body.querySelectorAll('.ai-include input').forEach((x) => { x.checked = b.dataset.actAll === '1'; });
  });

  async function sort() {
    const box = body.querySelector('[name="memoPaste"]');
    pasted = box.value;
    if (!pasted.trim()) return showError('メモを貼り付けてください');
    if (pasted.length > MAX_CHARS) return showError(`長いメモは分けて貼ってください（1回 ${MAX_CHARS.toLocaleString('ja-JP')}文字まで。今 ${pasted.length.toLocaleString('ja-JP')}文字）`);
    busy = true;
    saveBtn.disabled = true;
    const status = body.querySelector('.ai-status');
    status.hidden = false;
    status.textContent = '振り分け中…（30秒ほどかかることがあります）';
    body.querySelector('.form-error').hidden = true;
    try {
      const t = trip();
      const result = await callAI('memo', { text: maskForAI(pasted), context: aiContext(t, store.data.places, toISODate(new Date())) });
      if (!root.isConnected) return undefined;
      drafts = memoDrafts(result, t);
      body.innerHTML = confirmHtml();
      saveBtn.textContent = '保存';
      saveBtn.hidden = !drafts.length;
      root.querySelector('.sheet-body').scrollTop = 0;
    } catch (ex) {
      // うまくいかなかったら、貼った文はそのまま残す
      if (!root.isConnected) return undefined;
      status.hidden = true;
      showError(aiErrorMessage(ex.code, { status: ex.status, limit: ex.limit }));
      const u = body.querySelector('.ai-usage');
      if (u) u.outerHTML = usageLine();
    } finally {
      busy = false;
      saveBtn.disabled = false;
    }
    return undefined;
  }

  function save(sheet) {
    const list = readDrafts(sheet, drafts);
    if (!list.some((d) => d.include)) { showError('保存するものを選んでください'); return false; }
    let counts = null;
    store.update((d) => {
      const t = d.trips.find((x) => x.id === tripId);
      if (t) counts = applyMemoDrafts(t, list, newId, itemsOf);
    });
    toast(savedSummary(counts || {}));
    onSaved?.();
    return true;
  }
}
