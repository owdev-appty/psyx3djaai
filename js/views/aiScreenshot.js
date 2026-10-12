// A. Add from screenshot（スクショ取り込み）
//   画像を選ぶ（3枚まで）→「読み取る」で AI へ（縮小して送る。画像は保存しない）
//   → 確認画面で1件ずつ直す・保存するか選ぶ →「保存」で予定（予約済み・検討中）か候補に入れる
//   予約番号などの個人情報は、AI の結果に入っていても入力欄に入れない（logic/ai.js）
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { NO_AUTOCORRECT } from '../ui/ime.js';
import { shrinkForAI } from '../images.js';
import { callAI, AiError } from '../aiClient.js';
import { costLine, updateCost, refreshCost } from './aiCommon.js';
import { formatDay, toISODate } from '../logic/dates.js';
import { tripDates } from '../logic/trips.js';
import { parseAmount } from '../logic/money.js';
import {
  MAX_SCREENSHOTS, UNSCHEDULED, SAVE_MODES, SAVE_MODE_LABELS, screenshotDrafts, applyScreenshotDrafts,
  aiContext, aiErrorMessage, currencyOptions, stripPersonal,
} from '../logic/ai.js';
import { urlForSave, URL_ERROR } from '../logic/url.js';
import { KIND_LABELS, currencyLabel } from '../labels.js';
import { itemsOf } from './itemForm.js';

const KINDS = ['flight', 'train', 'bus', 'ferry', 'car', 'stay', 'activity', 'other'];

// 画像を選ぶ（タップの中で呼ぶ）
function pickImages(onPicked) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener('change', () => { const files = [...(input.files || [])]; if (files.length) onPicked(files); }, { once: true });
  input.click();
}

export function openScreenshotImport(tripId, onSaved) {
  pickImages((files) => openSheetFor(tripId, files, onSaved));
}

function draftHtml(d, i, days) {
  const n = (k) => `d${i}_${k}`;
  const text = (k, label, v, attrs = 'autocomplete="off"', cls = '') => `<label class="field"><span class="field-label">${label}</span><input class="input ${cls}" name="${n(k)}" value="${esc(v ?? '')}" ${attrs}></label>`;
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `
    <fieldset class="ai-card" data-draft="${i}">
      <legend class="sr-only">${i + 1}件目</legend>
      <label class="check check-tight ai-include"><input type="checkbox" name="${n('include')}" ${d.include ? 'checked' : ''}><span>保存する</span></label>
      <div class="ai-fields">
        <label class="field"><span class="field-label">追加のしかた</span><select class="input" name="${n('mode')}">${opt(SAVE_MODES.map((m) => [m, SAVE_MODE_LABELS[m]]), d.mode)}</select></label>
        <label class="field"><span class="field-label">Kind</span><select class="input" name="${n('kind')}">${opt(KINDS.map((k) => [k, KIND_LABELS[k]]), d.kind)}</select></label>
        ${text('title', 'Title', d.title)}
        <label class="field"><span class="field-label">Day</span><select class="input" name="${n('day')}">${opt(days, d.day)}</select>
          ${d.date && d.day === UNSCHEDULED ? `<p class="hint hint-sheet">読み取った日付 ${esc(d.date)} は旅の日程の外なので、日程未定にしています</p>` : ''}</label>
        <div class="field-row">
          <label class="field"><span class="field-label">Time</span><input class="input mono" type="time" name="${n('time')}" value="${esc(d.time)}"></label>
          <label class="field"><span class="field-label">End</span><input class="input mono" type="time" name="${n('endTime')}" value="${esc(d.endTime)}"></label>
        </div>
        <div class="field-row">${text('from', 'From', d.from)}${text('to', 'To', d.to)}</div>
        ${text('number', 'No.（便名）', d.number, NO_AUTOCORRECT, 'mono')}
        <div class="field-row">
          <label class="field"><span class="field-label">Price</span><input class="input mono" name="${n('price')}" inputmode="decimal" ${NO_AUTOCORRECT} value="${esc(d.price ?? '')}"></label>
          <label class="field"><span class="field-label">Currency</span><select class="input" name="${n('currency')}">${opt(currencyOptions(d.currency).map((c) => [c, currencyLabel(c)]), d.currency)}</select></label>
        </div>
        <label class="field"><span class="field-label">Miles</span><input class="input mono" name="${n('miles')}" inputmode="numeric" ${NO_AUTOCORRECT} value="${esc(d.miles ?? '')}"></label>
        ${text('provider', 'Booked via', d.provider)}
        <label class="field"><span class="field-label">Cancellation</span><textarea class="input" name="${n('cancelPolicy')}" rows="2">${esc(d.cancelPolicy)}</textarea></label>
        ${text('payNote', 'Payment', d.payNote)}
        <label class="field"><span class="field-label">Note</span><textarea class="input" name="${n('note')}" rows="2">${esc(d.note)}</textarea></label>
        ${text('url', 'Link', d.url, `type="url" inputmode="url" ${NO_AUTOCORRECT}`)}
      </div>
    </fieldset>`;
}

function readDrafts(root, drafts) {
  return drafts.map((d, i) => {
    const v = (k) => root.querySelector(`[name="d${i}_${k}"]`)?.value ?? '';
    return {
      ...d,
      include: !!root.querySelector(`[name="d${i}_include"]`)?.checked,
      mode: v('mode'),
      kind: v('kind'),
      title: v('title').trim(),
      day: v('day'),
      time: v('time'),
      endTime: v('endTime'),
      from: v('from').trim(),
      to: v('to').trim(),
      number: v('number').trim(),
      price: parseAmount(v('price')),
      currency: v('currency'),
      miles: parseAmount(v('miles')),
      provider: v('provider').trim(),
      cancelPolicy: v('cancelPolicy'),
      payNote: v('payNote').trim(),
      note: v('note'),
      url: v('url').trim(),
    };
  });
}

function openSheetFor(tripId, initialFiles, onSaved) {
  let files = initialFiles;
  let drafts = null;   // 読み取った後の下書き（null なら、まだ）
  let busy = false;
  const urls = [];
  const trip = () => store.data.trips.find((t) => t.id === tripId);

  const pickHtml = () => {
    urls.forEach(URL.revokeObjectURL);
    urls.length = 0;
    const tooMany = files.length > MAX_SCREENSHOTS;
    return `
      <div class="ai-shots" role="group" aria-label="選んだ画像">
        ${files.map((f, i) => { const u = URL.createObjectURL(f); urls.push(u); return `<img class="ai-shot" src="${u}" alt="${i + 1}枚目">`; }).join('')}
      </div>
      <p class="ai-count">${files.length}枚${tooMany ? `（${MAX_SCREENSHOTS}枚まで）` : ''}</p>
      <button type="button" class="btn btn-secondary btn-small" data-act-repick>画像を選び直す</button>
      <p class="hint hint-sheet">予約画面のスクショを${MAX_SCREENSHOTS}枚まで。画像は小さくしてから AI に送ります（保存はしません）。予約番号・会員番号などは、読み取った結果に入れません。</p>
      ${costLine()}
      <p class="ai-status" role="status" aria-live="polite" hidden></p>
      <p class="form-error" role="alert" ${tooMany ? '' : 'hidden'}>${tooMany ? esc(aiErrorMessage('too_many_images')) : ''}</p>`;
  };

  const confirmHtml = (message) => {
    const t = trip();
    const days = [...tripDates(t).map((d, i) => [d, `Day ${i + 1} · ${formatDay(d)}`]), [UNSCHEDULED, '日程未定']];
    if (!drafts.length) {
      return `
        <p class="ai-empty">予約の内容を読み取れませんでした</p>
        ${message ? `<p class="hint hint-sheet">${esc(message)}</p>` : ''}
        <button type="button" class="btn btn-secondary btn-small" data-act-repick>画像を選び直す</button>
        <p class="form-error" role="alert" hidden></p>`;
    }
    return `
      <p class="hint hint-sheet">読み取った内容です。確かめて、直してから「保存」を押してください。まだ何も保存していません。</p>
      ${message ? `<p class="hint hint-sheet">AI より：${esc(message)}</p>` : ''}
      <p class="hint hint-sheet">予約番号・会員番号などは入れていません。必要なら、保存した後に Bookings の Edit で入れてください。</p>
      ${drafts.map((d, i) => draftHtml(d, i, days)).join('')}
      <p class="form-error" role="alert" hidden></p>`;
  };

  const { root, close } = openSheet({
    title: 'Add from screenshot',
    saveLabel: '読み取る',
    body: '<div data-ai-body></div>',
    onDismiss: () => urls.forEach(URL.revokeObjectURL),
    onMount(sheet) {
      sheet.querySelector('[data-ai-body]').innerHTML = pickHtml();
      refreshCost(sheet);
    },
    onSave(sheet) {
      if (busy) return false;
      if (!drafts) { read(sheet); return false; }
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

  body.addEventListener('click', (e) => {
    if (busy || !e.target.closest('[data-act-repick]')) return;
    pickImages((picked) => {
      files = picked;
      drafts = null;
      saveBtn.textContent = '読み取る';
      saveBtn.hidden = false;
      body.innerHTML = pickHtml();
    });
  });

  async function read() {
    if (files.length > MAX_SCREENSHOTS) return showError(aiErrorMessage('too_many_images'));
    busy = true;
    saveBtn.disabled = true;
    const status = body.querySelector('.ai-status');
    status.hidden = false;
    status.textContent = '読み取り中…（30秒ほどかかることがあります）';
    body.querySelector('.form-error').hidden = true;
    try {
      let images;
      try {
        images = [];
        for (const f of files) images.push(await shrinkForAI(f));
      } catch {
        throw new AiError('image');
      }
      const t = trip();
      const result = await callAI('screenshot', { images, context: aiContext(t, store.data.places, toISODate(new Date())) });
      if (!root.isConnected) return undefined;
      drafts = screenshotDrafts(result, t);
      body.innerHTML = confirmHtml(stripPersonal(result.message || ''));
      saveBtn.textContent = '保存';
      saveBtn.hidden = !drafts.length;
      root.querySelector('.sheet-body').scrollTop = 0;
    } catch (ex) {
      if (!root.isConnected) return undefined;
      status.hidden = true;
      showError(aiErrorMessage(ex.code, { status: ex.status, limit: ex.limit }));
      updateCost(body);
    } finally {
      busy = false;
      saveBtn.disabled = false;
    }
    return undefined;
  }

  function save(sheet) {
    const list = readDrafts(sheet, drafts);
    if (!list.some((d) => d.include)) { showError('保存するものを選んでください'); return false; }
    const noTitle = list.findIndex((d) => d.include && !d.title);
    if (noTitle >= 0) { showError(`${noTitle + 1}件目のタイトルを入れてください`); return false; }
    const badUrl = list.findIndex((d) => d.include && urlForSave(d.url) === null);
    if (badUrl >= 0) { showError(`${badUrl + 1}件目：${URL_ERROR}`); return false; }
    let added = 0;
    store.update((d) => {
      const t = d.trips.find((x) => x.id === tripId);
      if (t) added = applyScreenshotDrafts(t, list, d.settings, newId, itemsOf);
    });
    urls.forEach(URL.revokeObjectURL);
    toast(`${added}件を追加しました`);
    onSaved?.();
    return true;
  }

  return close;
}
