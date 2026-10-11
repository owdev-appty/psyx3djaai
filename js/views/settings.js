import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { VERSION } from '../version.js';
import { store, persistent, storage } from '../appStore.js';
import { summaryText, getSecret, setSecret } from '../store.js';
import { fetchUsage, knownUsage } from '../aiClient.js';
import { aiErrorMessage } from '../logic/ai.js';
import { toast } from '../ui/toast.js';
import { lastBackupText, isBackupStale, formatBytes } from '../logic/backup.js';
import { exportBackup, restoreFromFile, undoRestore, pickBackupFile } from '../backupActions.js';
import { imageStats } from '../images.js';
import { attachmentIds, formatSize } from '../logic/images.js';
import { brokenNotice, storageNotice } from './notices.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDelete } from '../ui/modal.js';
import { parseAmount } from '../logic/money.js';
import { CURRENCIES, currencyLabel } from '../labels.js';
import { NO_AUTOCORRECT } from '../ui/ime.js';

// 通貨レートの追加・編集（code が null なら追加）。通貨は一覧（7つ）から選ぶ
function openRateForm(code, onSaved) {
  const isNew = !code;
  const rate = isNew ? '' : store.data.settings.fxRates[code];
  const free = CURRENCIES.filter((c) => store.data.settings.fxRates[c] == null);
  openSheet({
    title: isNew ? 'Add currency' : currencyLabel(code),
    body: `
      ${isNew ? `
        <label class="field">
          <span class="field-label">Currency</span>
          <select class="input" name="code">
            ${free.map((c) => `<option value="${c}">${esc(currencyLabel(c))}</option>`).join('')}
          </select>
        </label>` : ''}
      <div class="field">
        <span class="field-label">Rate</span>
        <div class="rate-row">
          <span class="mono">1円 =</span>
          <input class="input mono rate-input" name="rate" inputmode="decimal" ${NO_AUTOCORRECT} value="${esc(rate)}">
          <span class="mono" data-code>${esc(code || free[0] || '')}</span>
        </div>
        <p class="hint hint-sheet">1円あたりの外貨（例：1円 = 170 VND）</p>
      </div>
      ${isNew ? '' : '<button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>'}
      <p class="form-error" role="alert" hidden></p>`,
    onMount(root, close, focusWhenOpen) {
      const codeSelect = root.querySelector('[name="code"]');
      codeSelect?.addEventListener('change', () => {
        root.querySelector('[data-code]').textContent = codeSelect.value;
      });
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDelete(currencyLabel(code)))) return;
        store.update((d) => { delete d.settings.fxRates[code]; });
        close();
        onSaved();
      });
      if (!isNew) focusWhenOpen(root.querySelector('[name="rate"]'));
    },
    onSave(root) {
      const err = root.querySelector('.form-error');
      const fail = (m) => { err.textContent = m; err.hidden = false; return false; };
      const c = isNew ? root.querySelector('[name="code"]').value : code;
      if (isNew && !CURRENCIES.includes(c)) return fail('通貨を選んでください');
      if (isNew && store.data.settings.fxRates[c] != null) return fail('この通貨はもうあります');
      const r = parseAmount(root.querySelector('[name="rate"]').value);
      if (!r) return fail('レートを入れてください');
      store.update((d) => { d.settings.fxRates[c] = r; });
      onSaved();
      return true;
    },
  });
}

export function render(el) {
  const d = store.data;
  const broken = store.status === 'broken';
  const last = d.settings.lastBackupAt;
  const stale = !broken && isBackupStale(last);
  const u = store.usage();

  el.innerHTML = `
    <header class="topbar topbar-back">
      <a class="icon-btn icon-btn-lead" href="#/trips" aria-label="Back">${icon('back')}</a>
      <h1 class="page-title">Settings</h1>
    </header>

    ${brokenNotice()}
    ${storageNotice()}

    <section class="section" aria-labelledby="sec-backup">
      <h2 class="section-title" id="sec-backup">Backup</h2>
      <div class="card">
        ${broken ? '' : `<p class="row-text ${stale ? 'is-stale' : ''}">${esc(lastBackupText(last))}</p>
          <p class="row-text row-sub" data-img-last hidden>${esc(lastBackupText(d.settings.lastBackupWithImagesAt, new Date(), 'Last backup with images'))}</p>
          <label class="check check-tight" data-img-opt hidden>
            <input type="checkbox" name="withImages">
            <span>画像も含める</span>
          </label>
          <p class="hint hint-tight" data-img-hint hidden></p>`}
        <div class="stack">
          <button type="button" class="btn btn-primary" data-act="export">Export backup</button>
          <button type="button" class="btn btn-secondary" data-act="restore">Restore from backup</button>
          ${store.hasUndo() ? '<button type="button" class="btn btn-secondary" data-act="undo">Undo restore</button>' : ''}
        </div>
        <p class="hint">iPhone では共有メニューから「ファイル」に保存できます（iCloud Drive がおすすめ）。</p>
      </div>
    </section>

    ${broken ? '' : `
      <section class="section" aria-labelledby="sec-fx">
        <h2 class="section-title" id="sec-fx">Currency rates</h2>
        <div class="card">
          ${Object.keys(d.settings.fxRates).length ? `
            <ul class="list list-flush">
              ${Object.entries(d.settings.fxRates).sort(([a], [b]) => a.localeCompare(b)).map(([c, r]) => `
                <li><button type="button" class="row-link row-btn" data-rate="${esc(c)}">
                  <span class="row-main">
                    <span class="row-title">${esc(currencyLabel(c))}</span>
                    <span class="row-sub mono">1円 = ${esc(r)} ${esc(c)}</span>
                  </span>
                  <span class="row-amount">Edit</span>
                </button></li>`).join('')}
            </ul>` : ''}
          ${CURRENCIES.some((c) => d.settings.fxRates[c] == null) ? '<button type="button" class="btn btn-secondary btn-block" data-act="add-rate">＋ Add currency</button>' : ''}
          <p class="hint">旅の Money で、旅ごとにレートを変えることもできます</p>
        </div>
      </section>`}

    ${broken ? '' : aiSection(d)}

    <section class="section" aria-labelledby="sec-data">
      <h2 class="section-title" id="sec-data">Data</h2>
      <div class="card">
        ${broken ? '' : `<p class="row-text">${esc(summaryText(d))}</p>`}
        <dl class="kv">
          <div data-img-row hidden><dt>画像</dt><dd class="mono" data-img-stat></dd></div>
          <div><dt>Storage</dt><dd class="mono">${formatBytes(u.bytes)} / ${formatBytes(u.limit)}</dd></div>
        </dl>
        ${persistent ? '' : '<p class="hint is-stale">この環境では保存できません。閉じるとデータが消えます。</p>'}
      </div>
    </section>

    <footer class="about">
      <img class="app-icon sm" src="icons/icon.svg" alt="" width="32" height="32">
      <span>TripNote <span class="mono">v${VERSION}</span></span>
    </footer>`;

  el.querySelector('[data-act="export"]').addEventListener('click', () => {
    exportBackup({ withImages: !!el.querySelector('[name="withImages"]')?.checked });
  });

  // 画像の枚数と大きさ（IndexedDB から読む）。画像があるときだけ「画像も含める」を出す
  if (!broken && window.indexedDB) {
    imageStats(attachmentIds(d)).then(({ count, bytes }) => {
      if (!count && !d.settings.lastBackupWithImagesAt) return;
      el.querySelector('[data-img-last]').hidden = false;
      el.querySelector('[data-img-opt]').hidden = false;
      const hint = el.querySelector('[data-img-hint]');
      hint.hidden = false;
      hint.textContent = `画像${count}枚（${formatSize(bytes)}）。含めるとファイルが大きくなります`;
      el.querySelector('[data-img-row]').hidden = false;
      el.querySelector('[data-img-stat]').textContent = `${count}枚 · ${formatSize(bytes)}`;
    }).catch(() => {});
  }
  el.querySelector('[data-act="restore"]').addEventListener('click', async () => {
    const file = await pickBackupFile();
    if (file) await restoreFromFile(file);
  });
  const rerender = () => render(el);
  el.querySelector('[data-act="add-rate"]')?.addEventListener('click', () => openRateForm(null, rerender));
  el.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => openRateForm(b.dataset.rate, rerender)));
  el.querySelector('[data-act="undo"]')?.addEventListener('click', () => undoRestore());
  if (!broken) bindAi(el);
}

// ---------- AI ----------
const usageText = (u) => (u ? `今日の残り ${u.remaining}回（1日${u.limit}回まで）` : '今日の残り —');

function aiSection(d) {
  const on = d.settings.ai?.enabled !== false;
  return `
    <section class="section" aria-labelledby="sec-ai">
      <h2 class="section-title" id="sec-ai">AI</h2>
      <div class="card">
        <label class="check check-tight"><input type="checkbox" name="aiEnabled" ${on ? 'checked' : ''}><span>AI を使う</span></label>
        <label class="field">
          <span class="field-label">合言葉</span>
          <span class="secret-row">
            <input class="input mono" type="password" name="aiSecret" value="${esc(getSecret(storage))}" autocomplete="off" ${NO_AUTOCORRECT}>
            <button type="button" class="btn btn-secondary btn-small" data-act="secret-show" aria-pressed="false">表示</button>
          </span>
        </label>
        <p class="hint hint-tight">合言葉はこの端末だけに保存します（バックアップには入りません）</p>
        <div class="ai-usage-row">
          <p class="row-text mono" data-ai-usage>${esc(usageText(knownUsage()))}</p>
          <button type="button" class="btn btn-secondary btn-small" data-act="usage">更新</button>
        </div>
        <p class="hint hint-tight" data-ai-usage-error hidden></p>
        <p class="hint">AI に送るもの：スクショ取り込みは選んだ画像（小さくして送り、保存はしません）。メモ貼り付けは貼った文（メールアドレス・電話番号・カード番号・予約番号などは伏せ字にしてから）。旅の名前と日程も送ります。予約番号の欄と、予定に添付した画像は送りません。</p>
      </div>
    </section>`;
}

function bindAi(el) {
  const box = el.querySelector('[name="aiSecret"]');
  const usage = el.querySelector('[data-ai-usage]');
  const usageErr = el.querySelector('[data-ai-usage-error]');
  const refresh = () => {
    usageErr.hidden = true;
    fetchUsage()
      .then((u) => { usage.textContent = usageText(u); })
      .catch((ex) => {
        usage.textContent = usageText(knownUsage());
        if (ex.code === 'no_token' || ex.code === 'disabled') return;
        usageErr.textContent = aiErrorMessage(ex.code, { status: ex.status, limit: ex.limit });
        usageErr.hidden = false;
      });
  };
  el.querySelector('[name="aiEnabled"]').addEventListener('change', (e) => {
    const on = e.target.checked;
    store.update((d) => { d.settings.ai = { ...(d.settings.ai || {}), enabled: on }; });
    if (on) refresh();
  });
  box.addEventListener('change', () => {
    setSecret(storage, box.value.trim());
    toast(box.value.trim() ? '合言葉を保存しました' : '合言葉を消しました');
    if (box.value.trim()) refresh();
  });
  el.querySelector('[data-act="secret-show"]').addEventListener('click', (e) => {
    const show = box.type === 'password';
    box.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? '隠す' : '表示';
    e.currentTarget.setAttribute('aria-pressed', String(show));
  });
  el.querySelector('[data-act="usage"]').addEventListener('click', refresh);
  if (store.data.settings.ai?.enabled !== false && getSecret(storage) && navigator.onLine !== false) refresh();
}
