// E. 場所ノートの整理（場所の画面の Notes to self・移動のコツの「AIで整理」）
//   送るもの：その場所の Notes to self と移動のコツの全件（伏せ字にしてから）
//   → 確認画面で、まとめる・古い・上に置くの案を、変更前と変更後を並べて1件ずつ採用・却下 →「保存」
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { callAI } from '../aiClient.js';
import { tidyInput, canTidy, tidyDrafts, applyTidyDrafts, aiErrorMessage } from '../logic/ai.js';
import { costLine, updateCost, refreshCost } from './aiCommon.js';

const LIST_LABELS = { notesToSelf: 'Notes to self', transportTips: '移動のコツ' };
const include = (name, on, label) => `<label class="check check-tight ai-include"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
const itemText = (x) => [x.title, x.text].filter(Boolean).join('\n');

function confirmHtml(d) {
  if (!d.merges.length && !d.stale.length && !d.top.length) {
    return `
      <p class="ai-empty">整理の案はありませんでした</p>
      ${d.message ? `<p class="hint hint-sheet">AI より：${esc(d.message)}</p>` : ''}
      <p class="form-error" role="alert" hidden></p>`;
  }
  return `
    <p class="hint hint-sheet">整理の案です。採用するものにチェックを付けて「保存」を押してください。チェックを外したものは変わりません。まだ何も変えていません。</p>
    ${d.message ? `<p class="hint hint-sheet">AI より：${esc(d.message)}</p>` : ''}
    ${d.merges.length ? `
      <section class="section" aria-labelledby="ai-td-mg">
        <h3 class="section-title" id="ai-td-mg">まとめる</h3>
        ${d.merges.map((m, i) => `
          <fieldset class="ai-card">
            <legend class="sr-only">まとめる案 ${i + 1}</legend>
            ${include(`mg${i}_inc`, m.include, `採用（${m.olds.length}件 → 1件）`)}
            <div class="ai-fields">
              <p class="ai-label">${LIST_LABELS[m.list]}・変更前（採用すると、この${m.olds.length}件は消えて下の1件になります）</p>
              <ul class="ai-before">${m.olds.map((x) => `<li><span class="ai-gone">消えます</span><span class="ai-old-text">${esc(itemText(x))}</span></li>`).join('')}</ul>
              <p class="ai-label">変更後</p>
              ${m.list === 'transportTips' ? `<label class="field"><span class="field-label">Title</span><input class="input" name="mg${i}_title" value="${esc(m.title)}" autocomplete="off"></label>` : ''}
              <label class="field"><span class="field-label">Text</span><textarea class="input" name="mg${i}_text" rows="4">${esc(m.text)}</textarea></label>
              ${m.reason ? `<p class="hint hint-sheet">${esc(m.reason)}</p>` : ''}
            </div>
          </fieldset>`).join('')}
      </section>` : ''}
    ${d.stale.length ? `
      <section class="section" aria-labelledby="ai-td-st">
        <h3 class="section-title" id="ai-td-st">古くなっていそう</h3>
        ${d.stale.map((x, i) => `
          <fieldset class="ai-card">
            <legend class="sr-only">古くなっていそうな案 ${i + 1}</legend>
            ${include(`st${i}_inc`, x.include, '採用（消す）')}
            <div class="ai-fields">
              <p class="ai-label">${LIST_LABELS[x.list]}・変更前</p>
              <ul class="ai-before"><li><span class="ai-gone">消えます</span><span class="ai-old-text">${esc(itemText(x.old))}</span></li></ul>
              ${x.reason ? `<p class="hint hint-sheet">${esc(x.reason)}</p>` : ''}
            </div>
          </fieldset>`).join('')}
      </section>` : ''}
    ${d.top.length ? `
      <section class="section" aria-labelledby="ai-td-tp">
        <h3 class="section-title" id="ai-td-tp">上に置く</h3>
        ${d.top.map((x, i) => `
          <fieldset class="ai-card">
            <legend class="sr-only">上に置く案 ${i + 1}</legend>
            ${include(`tp${i}_inc`, x.include, '採用（一覧のいちばん上へ）')}
            <div class="ai-fields">
              <p class="ai-label">${LIST_LABELS[x.list]}</p>
              <p class="ai-old-text">${esc(itemText(x.old))}</p>
              ${x.reason ? `<p class="hint hint-sheet">${esc(x.reason)}</p>` : ''}
            </div>
          </fieldset>`).join('')}
      </section>` : ''}
    <p class="form-error" role="alert" hidden></p>`;
}

function readDrafts(root, d) {
  const v = (n) => root.querySelector(`[name="${n}"]`)?.value ?? '';
  const on = (n) => !!root.querySelector(`[name="${n}"]`)?.checked;
  return {
    merges: d.merges.map((m, i) => ({ ...m, include: on(`mg${i}_inc`), title: m.list === 'transportTips' ? v(`mg${i}_title`).trim() : '', text: v(`mg${i}_text`).trim() })),
    stale: d.stale.map((x, i) => ({ ...x, include: on(`st${i}_inc`) })),
    top: d.top.map((x, i) => ({ ...x, include: on(`tp${i}_inc`) })),
  };
}

export function openPlaceTidy(placeId, onSaved) {
  const place = () => store.data.places.find((p) => p.id === placeId);
  let drafts = null;
  let busy = false;

  const startHtml = () => {
    const { input } = tidyInput(place());
    const ok = canTidy(input);
    return `
      <p class="hint hint-sheet">Notes to self と移動のコツの、重なっている内容をまとめる案・古くなっていそうな内容・上に置くとよい内容を出します。結果は確認してから保存します。</p>
      <p class="hint hint-sheet">AI に送るもの：この場所の Notes to self ${input.notes.length}件と移動のコツ ${input.tips.length}件（メールアドレス・電話番号・予約番号などは伏せ字にしてから）、場所の名前。</p>
      ${costLine()}
      <p class="ai-status" role="status" aria-live="polite" hidden></p>
      <p class="form-error" role="alert" ${ok ? 'hidden' : ''}>${ok ? '' : 'Notes to self と移動のコツが合わせて2件以上あるときに使えます'}</p>`;
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
    const built = tidyInput(place());
    if (!canTidy(built.input)) return showError('Notes to self と移動のコツが合わせて2件以上あるときに使えます');
    busy = true;
    saveBtn.disabled = true;
    const status = body.querySelector('.ai-status');
    status.hidden = false;
    status.textContent = '整理中…（30秒ほどかかることがあります）';
    body.querySelector('.form-error').hidden = true;
    try {
      const result = await callAI('tidy', built.input);
      if (!root.isConnected) return undefined;
      drafts = tidyDrafts(result, built.map, place());
      body.innerHTML = confirmHtml(drafts);
      saveBtn.textContent = '保存';
      saveBtn.hidden = !(drafts.merges.length + drafts.stale.length + drafts.top.length);
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
    if (![...list.merges, ...list.stale, ...list.top].some((x) => x.include)) { showError('採用するものにチェックを付けてください'); return false; }
    if (list.merges.some((m) => m.include && !m.text)) { showError('まとめた後の Text が空です'); return false; }
    let counts = null;
    store.update((d) => {
      const p = d.places.find((x) => x.id === placeId);
      if (p) counts = applyTidyDrafts(p, list, newId);
    });
    const c = counts || { merged: 0, removed: 0, moved: 0 };
    const parts = [c.merged && `まとめた${c.merged}件`, c.removed && `消した${c.removed}件`, c.moved && `上に移した${c.moved}件`].filter(Boolean);
    toast(parts.length ? `${parts.join('・')}` : '変わったものはありません（ほかで変わっていました）');
    onSaved?.();
    return true;
  }
}
