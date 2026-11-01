// A. Add from screenshot（スクショ取り込み）
//   画像を選ぶ（3枚まで）→「読み取る」で AI へ（縮小して送る。画像は保存しない）
//   → 確認画面で1件ずつ直す・保存するか選ぶ →「Save」で予定（予約済み・検討中）か候補に入れる
//   お店・観光地のおすすめの画面なら、お店ごとに日程未定の予定に（Title・Kind・Note。Spot にも入れる は最初からオン）
//   予約番号などの個人情報は、AI の結果に入っていても入力欄に入れない（logic/ai.js）
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { NO_AUTOCORRECT } from '../ui/ime.js';
import { shrinkForAI } from '../images.js';
import { callAI, AiError } from '../aiClient.js';
import { costLine, updateCost, refreshCost, offlineBlocked } from './aiCommon.js';
import { formatDay, toISODate } from '../logic/dates.js';
import { tripDates } from '../logic/trips.js';
import { parseAmount } from '../logic/money.js';
import {
  MAX_SCREENSHOTS, UNSCHEDULED, SAVE_MODES, SAVE_MODE_LABELS, screenshotDrafts, applyScreenshotDrafts,
  screenshotSpotDrafts, applyScreenshotSpotDrafts,
  aiContext, aiErrorMessage, currencyOptions, stripPersonal,
} from '../logic/ai.js';
import { urlForSave, URL_ERROR } from '../logic/url.js';
import { KIND_LABELS, currencyLabel } from '../labels.js';
import { PLAN_TO_SPOT_KINDS } from '../logic/places.js';
import { clearSpotFilters } from '../uiState.js';
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
  if (offlineBlocked()) return;
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

// お店・観光地の下書き（日程未定の予定になる）
function spotDraftHtml(d, i, places) {
  const n = (k) => `s${i}_${k}`;
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `
    <fieldset class="ai-card" data-spot-draft="${i}">
      <legend class="sr-only">お店 ${i + 1}件目</legend>
      <label class="check check-tight ai-include"><input type="checkbox" name="${n('include')}" ${d.include ? 'checked' : ''}><span>保存する</span></label>
      ${d.dup ? '<p class="hint hint-sheet">もう予定にあります</p>' : ''}
      <div class="ai-fields">
        <label class="field"><span class="field-label">Title</span><input class="input" name="${n('title')}" value="${esc(d.title)}" autocomplete="off"></label>
        <label class="field"><span class="field-label">Kind</span><select class="input" name="${n('kind')}">${opt(PLAN_TO_SPOT_KINDS.map((k) => [k, KIND_LABELS[k]]), d.kind)}</select></label>
        <label class="field"><span class="field-label">Note</span><textarea class="input" name="${n('note')}" rows="4">${esc(d.note)}</textarea></label>
        <label class="field"><span class="field-label">Link</span><input class="input" type="url" inputmode="url" ${NO_AUTOCORRECT} name="${n('url')}" value="${esc(d.url)}"></label>
        ${places.length ? `
          <label class="check check-tight"><input type="checkbox" name="${n('toPlace')}" ${d.toPlace ? 'checked' : ''}><span>Spot にも入れる${places.length === 1 ? `（${esc(places[0].name || '名前なし')}）` : ''}</span></label>
          ${places.length > 1 ? `<select class="input" name="${n('placeId')}" aria-label="Place">${opt(places.map((p) => [p.id, p.name || '（名前なし）']), d.placeId)}</select>`
            : `<input type="hidden" name="${n('placeId')}" value="${esc(places[0].id)}">`}` : ''}
      </div>
    </fieldset>`;
}

function readSpotDrafts(root, drafts) {
  return drafts.map((d, i) => {
    const v = (k) => root.querySelector(`[name="s${i}_${k}"]`)?.value ?? '';
    return {
      ...d,
      include: !!root.querySelector(`[name="s${i}_include"]`)?.checked,
      title: v('title').trim(),
      kind: v('kind'),
      note: v('note'),
      url: v('url').trim(),
      toPlace: !!root.querySelector(`[name="s${i}_toPlace"]`)?.checked,
      placeId: v('placeId'),
    };
  });
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
  let spotDrafts = []; // お店・観光地の下書き
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
      <p class="hint hint-sheet">予約画面や、お店・観光地のおすすめの画面のスクショを${MAX_SCREENSHOTS}枚まで。お店は、日程未定の予定に入ります。画像は小さくしてから AI に送ります（保存はしません）。予約番号・会員番号などは、読み取った結果に入れません。</p>
      ${costLine()}
      <p class="ai-status" role="status" aria-live="polite" hidden></p>
      <p class="form-error" role="alert" ${tooMany ? '' : 'hidden'}>${tooMany ? esc(aiErrorMessage('too_many_images')) : ''}</p>`;
  };

  const confirmHtml = (message) => {
    const t = trip();
    const days = [...tripDates(t).map((d, i) => [d, `Day ${i + 1} · ${formatDay(d)}`]), [UNSCHEDULED, '日程未定']];
    const places = (t?.placeIds || []).map((id) => store.data.places.find((p) => p.id === id)).filter(Boolean);
    if (!drafts.length && !spotDrafts.length) {
      return `
        <p class="ai-empty">予約やお店の内容を読み取れませんでした</p>
        ${message ? `<p class="hint hint-sheet">${esc(message)}</p>` : ''}
        <button type="button" class="btn btn-secondary btn-small" data-act-repick>画像を選び直す</button>
        <p class="form-error" role="alert" hidden></p>`;
    }
    return `
      <p class="hint hint-sheet">読み取った内容です。確かめて、直してから「Save」を押してください。まだ何も保存していません。</p>
      ${message ? `<p class="hint hint-sheet">AI より：${esc(message)}</p>` : ''}
      ${drafts.length ? `
        ${spotDrafts.length ? '<h3 class="section-title">予約</h3>' : ''}
        <p class="hint hint-sheet">予約番号・会員番号などは入れていません。必要なら、保存した後に Bookings の Edit で入れてください。</p>
        ${drafts.map((d, i) => draftHtml(d, i, days)).join('')}` : ''}
      ${spotDrafts.length ? `
        ${drafts.length ? '<h3 class="section-title">お店・観光地</h3>' : ''}
        <p class="hint hint-sheet">お店・観光地は、日程未定の予定に入ります。${places.length ? '「Spot にも入れる」にチェックがあれば、場所ノートの Spots にも入ります（Note もコピー）。' : ''}</p>
        ${spotDrafts.map((d, i) => spotDraftHtml(d, i, places)).join('')}` : ''}
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
      spotDrafts = [];
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
      spotDrafts = screenshotSpotDrafts(result, t, store.data.places);
      body.innerHTML = confirmHtml(stripPersonal(result.message || ''));
      saveBtn.textContent = 'Save';
      saveBtn.hidden = !drafts.length && !spotDrafts.length;
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
    const spots = readSpotDrafts(sheet, spotDrafts);
    if (!list.some((d) => d.include) && !spots.some((d) => d.include)) { showError('保存するものを選んでください'); return false; }
    const noTitle = list.findIndex((d) => d.include && !d.title);
    if (noTitle >= 0) { showError(`${noTitle + 1}件目のタイトルを入れてください`); return false; }
    const badUrl = list.findIndex((d) => d.include && urlForSave(d.url) === null);
    if (badUrl >= 0) { showError(`${badUrl + 1}件目：${URL_ERROR}`); return false; }
    const noName = spots.findIndex((d) => d.include && !d.title);
    if (noName >= 0) { showError(`お店 ${noName + 1}件目の Title を入れてください`); return false; }
    const badSpotUrl = spots.findIndex((d) => d.include && urlForSave(d.url) === null);
    if (badSpotUrl >= 0) { showError(`お店 ${badSpotUrl + 1}件目：${URL_ERROR}`); return false; }
    let added = 0;
    let spotRes = { added: 0, spots: 0, placeIds: [] };
    store.update((d) => {
      const t = d.trips.find((x) => x.id === tripId);
      if (t) added = applyScreenshotDrafts(t, list, d.settings, newId, itemsOf);
      spotRes = applyScreenshotSpotDrafts(d, tripId, spots.map((x) => ({ ...x, url: urlForSave(x.url) || '' })), newId, itemsOf);
    });
    // 入れた Spot が、場所の Spots で前の絞り込みに隠れないように
    spotRes.placeIds.forEach(clearSpotFilters);
    urls.forEach(URL.revokeObjectURL);
    toast(`${added + spotRes.added}件を追加しました${spotRes.spots ? `（Spots にも${spotRes.spots}件）` : ''}`);
    onSaved?.();
    return true;
  }

  return close;
}
