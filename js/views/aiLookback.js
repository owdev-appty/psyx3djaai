// D. ふりかえり整理（ふりかえりの画面の「AIで整理」）
//   送るもの：ふりかえりの文（伏せ字にしてから）・ふりかえりの答え・旅の場所の名前・予定に入っていた店の名前と今の状態
//   → 確認画面で、店の状態・店のメモ・Notes to self の案を1件ずつ採用（チェック）・却下（外す）・修正 →「Save」
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { callAI } from '../aiClient.js';
import { toISODate, parseISODate } from '../logic/dates.js';
import { lookbackInput, canLookback, lookbackDrafts, applyLookbackDrafts, aiErrorMessage } from '../logic/ai.js';
import { SPOT_STATUSES, SPOT_STATUS_LABELS } from '../labels.js';
import { costLine, updateCost, refreshCost, offlineBlocked } from './aiCommon.js';

const statusLabel = (s) => SPOT_STATUS_LABELS[s] || 'なし';
const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
const include = (name, on, label = '採用') => `<label class="check check-tight ai-include"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span>${label}</span></label>`;

function confirmHtml(d, places) {
  const placeName = (id) => places.find((p) => p.id === id)?.name || '';
  const empty = !d.status.length && !d.notes.length && !d.self.length;
  if (empty) {
    return `
      <p class="ai-empty">整理の案はありませんでした</p>
      ${d.message ? `<p class="hint hint-sheet">AI より：${esc(d.message)}</p>` : ''}
      <p class="form-error" role="alert" hidden></p>`;
  }
  const tripPlaces = places.map((p) => [p.id, p.name || '（名前なし）']);
  return `
    <p class="hint hint-sheet">整理の案です。採用するものにチェックを付け、必要なら直してから「Save」を押してください。チェックを外したものは保存しません。まだ何も保存していません。</p>
    ${d.message ? `<p class="hint hint-sheet">AI より：${esc(d.message)}</p>` : ''}
    ${d.status.length ? `
      <section class="section" aria-labelledby="ai-lb-st">
        <h3 class="section-title" id="ai-lb-st">店の状態</h3>
        ${d.status.map((x, i) => `
          <fieldset class="ai-card">
            <legend class="sr-only">${esc(x.name)}</legend>
            ${include(`st${i}_inc`, x.include)}
            <div class="ai-fields">
              <p class="ai-name">${esc(x.name || '（名前なし）')}</p>
              <label class="field"><span class="field-label">今：${esc(statusLabel(x.from))} → 変更後</span>
                <select class="input" name="st${i}_to">${opt(SPOT_STATUSES.map((s) => [s, SPOT_STATUS_LABELS[s]]), x.to)}</select></label>
              ${x.reason ? `<p class="hint hint-sheet">${esc(x.reason)}</p>` : ''}
            </div>
          </fieldset>`).join('')}
      </section>` : ''}
    ${d.notes.length ? `
      <section class="section" aria-labelledby="ai-lb-nt">
        <h3 class="section-title" id="ai-lb-nt">店のメモに足す</h3>
        ${d.notes.map((x, i) => `
          <fieldset class="ai-card">
            <legend class="sr-only">${esc(x.name)}</legend>
            ${include(`nt${i}_inc`, x.include)}
            <div class="ai-fields">
              <p class="ai-name">${esc(x.name || '（名前なし）')}</p>
              <label class="field"><span class="field-label">足すメモ</span><textarea class="input" name="nt${i}_text" rows="2">${esc(x.text)}</textarea></label>
            </div>
          </fieldset>`).join('')}
      </section>` : ''}
    ${d.self.length ? `
      <section class="section" aria-labelledby="ai-lb-ns">
        <h3 class="section-title" id="ai-lb-ns">Notes to self に足す</h3>
        ${d.self.map((x, i) => `
          <fieldset class="ai-card">
            <legend class="sr-only">${esc(placeName(x.placeId))}</legend>
            ${include(`ns${i}_inc`, x.include)}
            <div class="ai-fields">
              <label class="field"><span class="field-label">Place</span><select class="input" name="ns${i}_place">${opt(tripPlaces, x.placeId)}</select></label>
              <label class="field"><span class="field-label">Text</span><textarea class="input" name="ns${i}_text" rows="3">${esc(x.text)}</textarea></label>
            </div>
          </fieldset>`).join('')}
      </section>` : ''}
    <p class="form-error" role="alert" hidden></p>`;
}

function readDrafts(root, d) {
  const v = (n) => root.querySelector(`[name="${n}"]`)?.value ?? '';
  const on = (n) => !!root.querySelector(`[name="${n}"]`)?.checked;
  return {
    status: d.status.map((x, i) => ({ ...x, include: on(`st${i}_inc`), to: v(`st${i}_to`) })),
    notes: d.notes.map((x, i) => ({ ...x, include: on(`nt${i}_inc`), text: v(`nt${i}_text`).trim() })),
    self: d.self.map((x, i) => ({ ...x, include: on(`ns${i}_inc`), placeId: v(`ns${i}_place`), text: v(`ns${i}_text`).trim() })),
  };
}

export function openLookbackTidy(tripId, onSaved) {
  if (offlineBlocked()) return;
  const trip = () => store.data.trips.find((t) => t.id === tripId);
  const tripPlaces = () => (trip()?.placeIds || []).map((id) => store.data.places.find((p) => p.id === id)).filter(Boolean);
  let drafts = null;
  let busy = false;
  let map = null;

  const startHtml = () => {
    const { input } = lookbackInput(trip(), store.data.places, toISODate(new Date()));
    const ok = canLookback(input);
    return `
      <p class="hint hint-sheet">ふりかえりの文から、店の状態・店のメモ・Notes to self に入れるとよいことを整理します。結果は確認してから保存します。</p>
      <p class="hint hint-sheet">AI に送るもの：ふりかえりの文（${input.lookBack.length.toLocaleString('ja-JP')}文字。メールアドレス・電話番号・予約番号などは伏せ字にしてから）、ふりかえりの答え、店${input.spots.length}件の名前と状態、場所の名前。</p>
      ${costLine()}
      <p class="ai-status" role="status" aria-live="polite" hidden></p>
      <p class="form-error" role="alert" ${ok ? 'hidden' : ''}>${ok ? '' : 'ふりかえりの文を書くか、店に答えてから使ってください'}</p>`;
  };

  const { root } = openSheet({
    title: 'AIで整理',
    saveLabel: '整理する',
    body: '<div data-ai-body></div>',
    onMount(sheet) {
      sheet.querySelector('[data-ai-body]').innerHTML = startHtml();
      refreshCost(sheet);
    },
    onSave(sheet) {
      if (busy) return false;
      if (!drafts) { run(); return false; }
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

  async function run() {
    const built = lookbackInput(trip(), store.data.places, toISODate(new Date()));
    if (!canLookback(built.input)) return showError('ふりかえりの文を書くか、店に答えてから使ってください');
    busy = true;
    saveBtn.disabled = true;
    const status = body.querySelector('.ai-status');
    status.hidden = false;
    status.textContent = '整理中…（30秒ほどかかることがあります）';
    body.querySelector('.form-error').hidden = true;
    try {
      const result = await callAI('lookback', built.input);
      if (!root.isConnected) return undefined;
      map = built.map;
      drafts = lookbackDrafts(result, map, store.data.places);
      body.innerHTML = confirmHtml(drafts, tripPlaces());
      const any = drafts.status.length + drafts.notes.length + drafts.self.length;
      saveBtn.textContent = 'Save';
      saveBtn.hidden = !any;
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
    const chosen = [...list.status, ...list.notes, ...list.self].filter((x) => x.include);
    if (!chosen.length) { showError('採用するものにチェックを付けてください'); return false; }
    if ([...list.notes, ...list.self].some((x) => x.include && !x.text)) { showError('採用するメモが空です'); return false; }
    let counts = null;
    store.update((d) => {
      const t = d.trips.find((x) => x.id === tripId);
      const year = parseISODate(t?.startDate)?.y || new Date().getFullYear();
      counts = applyLookbackDrafts(d, tripId, list, newId, year);
    });
    const parts = [counts.status && `店の状態${counts.status}`, counts.notes && `店のメモ${counts.notes}`, counts.self && `Notes to self${counts.self}`].filter(Boolean);
    toast(parts.length ? `${parts.join('・')}を保存しました` : '保存したものはありません');
    onSaved?.();
    return true;
  }
}
