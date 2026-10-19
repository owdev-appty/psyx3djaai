// Spots の「AIで整理」：同じお店が、名前の書き方や種類を変えて何回も登録されているものを、1つにまとめる
//   送るもの：その場所の Spot の名前・種類・状態・エリア・メモ（メモは伏せ字にしてから。SP1… の記号）
//   → 確認画面で、変更前（消えます）と変更後（名前・Kind・状態・Note を直せる）を並べて1件ずつ採用・却下 →「Save」
//   まとめるときは、いちばん上の Spot を残し、ほかの Spot につながっていた予定とふりかえりの答えも付け替える
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { callAI } from '../aiClient.js';
import { spotsTidyInput, canTidySpots, spotsTidyDrafts, aiErrorMessage } from '../logic/ai.js';
import { mergeSpots } from '../logic/places.js';
import { SPOT_KINDS, SPOT_KIND_LABELS, SPOT_STATUSES, SPOT_STATUS_LABELS } from '../labels.js';
import { costLine, updateCost, refreshCost, offlineBlocked } from './aiCommon.js';

const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');

function confirmHtml(d) {
  if (!d.merges.length) {
    return `
      <p class="ai-empty">まとめる Spot は見つかりませんでした</p>
      ${d.message ? `<p class="hint hint-sheet">AI より：${esc(d.message)}</p>` : ''}
      <p class="form-error" role="alert" hidden></p>`;
  }
  return `
    <p class="hint hint-sheet">同じお店と考えた Spot をまとめる案です。採用するものにチェックを付けて「Save」を押してください。チェックを外したものは変わりません。まだ何も変えていません。</p>
    ${d.message ? `<p class="hint hint-sheet">AI より：${esc(d.message)}</p>` : ''}
    ${d.merges.map((m, i) => `
      <fieldset class="ai-card">
        <legend class="sr-only">まとめる案 ${i + 1}</legend>
        <label class="check check-tight ai-include"><input type="checkbox" name="mg${i}_inc" ${m.include ? 'checked' : ''}><span>採用（${m.olds.length}件 → 1件）</span></label>
        <div class="ai-fields">
          <p class="ai-label">変更前（採用すると、この${m.olds.length}件は1件になります。いちばん上の Spot が残り、ほかは消えます）</p>
          <ul class="ai-before">${m.olds.map((x, j) => `
            <li${j === 0 ? ' class="ai-kept"' : ''}>${j === 0 ? '<span class="ai-keep">残ります</span>' : '<span class="ai-gone">消えます</span>'}
              <span class="ai-old-text">${esc(x.name || '（名前なし）')} · ${esc(SPOT_KIND_LABELS[x.kind] || 'Other')} · ${esc(SPOT_STATUS_LABELS[x.status] || '')}${x.note ? `\n${esc(x.note)}` : ''}</span></li>`).join('')}
          </ul>
          <p class="ai-label">変更後</p>
          <label class="field"><span class="field-label">Name</span><input class="input" name="mg${i}_name" value="${esc(m.name)}" autocomplete="off"></label>
          <div class="field-row">
            <label class="field"><span class="field-label">Kind</span><select class="input" name="mg${i}_kind">${opt(SPOT_KINDS.map((k) => [k, SPOT_KIND_LABELS[k]]), m.kind)}</select></label>
            <label class="field"><span class="field-label">状態</span><select class="input" name="mg${i}_status">${opt(SPOT_STATUSES.map((s) => [s, SPOT_STATUS_LABELS[s]]), m.status)}</select></label>
          </div>
          <label class="field"><span class="field-label">Note</span><textarea class="input" name="mg${i}_note" rows="3">${esc(m.note)}</textarea></label>
          ${m.reason ? `<p class="hint hint-sheet">${esc(m.reason)}</p>` : ''}
        </div>
      </fieldset>`).join('')}
    <p class="form-error" role="alert" hidden></p>`;
}

function readDrafts(root, d) {
  const v = (n) => root.querySelector(`[name="${n}"]`)?.value ?? '';
  return d.merges.map((m, i) => ({
    ...m,
    include: !!root.querySelector(`[name="mg${i}_inc"]`)?.checked,
    name: v(`mg${i}_name`).trim(),
    kind: v(`mg${i}_kind`),
    status: v(`mg${i}_status`),
    note: v(`mg${i}_note`),
  }));
}

export function openSpotsTidy(placeId, onSaved) {
  if (offlineBlocked()) return;
  const place = () => store.data.places.find((p) => p.id === placeId);
  let drafts = null;
  let busy = false;

  const startHtml = () => {
    const { input } = spotsTidyInput(place());
    const ok = canTidySpots(input);
    return `
      <p class="hint hint-sheet">同じお店が、名前の書き方（日本語・現地の言葉・英語など）や種類を変えて何回も登録されていないかを見て、1つにまとめる案を出します。結果は確認してから保存します。</p>
      <p class="hint hint-sheet">AI に送るもの：この場所の Spot ${input.spots.length}件の名前・種類・状態・エリア・メモ（メモのメールアドレス・電話番号・予約番号などは伏せ字にしてから）、場所の名前。</p>
      ${costLine()}
      <p class="ai-status" role="status" aria-live="polite" hidden></p>
      <p class="form-error" role="alert" ${ok ? 'hidden' : ''}>${ok ? '' : 'Spot が2件以上あるときに使えます'}</p>`;
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
    const built = spotsTidyInput(place());
    if (!canTidySpots(built.input)) return showError('Spot が2件以上あるときに使えます');
    busy = true;
    saveBtn.disabled = true;
    const status = body.querySelector('.ai-status');
    status.hidden = false;
    status.textContent = '整理中…（30秒ほどかかることがあります）';
    body.querySelector('.form-error').hidden = true;
    try {
      const result = await callAI('spots', built.input);
      if (!root.isConnected) return undefined;
      drafts = spotsTidyDrafts(result, built.map, place());
      body.innerHTML = confirmHtml(drafts);
      saveBtn.textContent = 'Save';
      saveBtn.hidden = !drafts.merges.length;
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
    if (!list.some((m) => m.include)) { showError('採用するものにチェックを付けてください'); return false; }
    if (list.some((m) => m.include && !m.name)) { showError('まとめた後の Name が空です'); return false; }
    let merged = 0;
    store.update((d) => {
      for (const m of list) if (m.include) merged += mergeSpots(d, placeId, m).merged;
    });
    toast(merged ? `${merged}件にまとめました` : '変わったものはありません（ほかで変わっていました）');
    onSaved?.();
    return true;
  }
}
