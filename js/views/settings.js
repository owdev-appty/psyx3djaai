import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { VERSION } from '../version.js';
import { store, persistent } from '../appStore.js';
import { summaryText } from '../store.js';
import { lastBackupText, isBackupStale, formatBytes } from '../logic/backup.js';
import { exportBackup, restoreFromFile, undoRestore, pickBackupFile } from '../backupActions.js';
import { brokenNotice, storageNotice } from './notices.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDelete } from '../ui/modal.js';
import { parseAmount, isCurrencyCode } from '../logic/money.js';

// 通貨レートの追加・編集（code が null なら追加）
function openRateForm(code, onSaved) {
  const isNew = !code;
  const rate = isNew ? '' : store.data.settings.fxRates[code];
  openSheet({
    title: isNew ? 'Add currency' : code,
    body: `
      ${isNew ? `
        <label class="field">
          <span class="field-label">Currency</span>
          <input class="input mono" name="code" maxlength="3" autocomplete="off" autocapitalize="characters" placeholder="VND">
        </label>` : ''}
      <div class="field">
        <span class="field-label">Rate</span>
        <div class="rate-row">
          <span class="mono">1円 =</span>
          <input class="input mono rate-input" name="rate" inputmode="decimal" autocomplete="off" value="${esc(rate)}">
          <span class="mono" data-code>${esc(code || '')}</span>
        </div>
        <p class="hint hint-sheet">1円あたりの外貨（例：1円 = 170 VND）</p>
      </div>
      ${isNew ? '' : '<button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>'}
      <p class="form-error" role="alert" hidden></p>`,
    onMount(root, close) {
      const codeInput = root.querySelector('[name="code"]');
      codeInput?.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
        root.querySelector('[data-code]').textContent = codeInput.value;
      });
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDelete(code))) return;
        store.update((d) => { delete d.settings.fxRates[code]; });
        close();
        onSaved();
      });
      (codeInput || root.querySelector('[name="rate"]')).focus();
    },
    onSave(root) {
      const err = root.querySelector('.form-error');
      const fail = (m) => { err.textContent = m; err.hidden = false; return false; };
      const c = isNew ? root.querySelector('[name="code"]').value.trim().toUpperCase() : code;
      if (c === 'JPY') return fail('円はレートなしで使えます');
      if (!isCurrencyCode(c)) return fail('通貨は英字3文字で入れてください（例：VND）');
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
        ${broken ? '' : `<p class="row-text ${stale ? 'is-stale' : ''}">${esc(lastBackupText(last))}</p>`}
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
                  <span class="row-main"><span class="row-title mono">1円 = ${esc(r)} ${esc(c)}</span></span>
                  <span class="row-amount">Edit</span>
                </button></li>`).join('')}
            </ul>` : ''}
          <button type="button" class="btn btn-secondary btn-block" data-act="add-rate">＋ Add currency</button>
          <p class="hint">旅の Money で、旅ごとにレートを変えることもできます</p>
        </div>
      </section>`}

    <section class="section" aria-labelledby="sec-data">
      <h2 class="section-title" id="sec-data">Data</h2>
      <div class="card">
        ${broken ? '' : `<p class="row-text">${esc(summaryText(d))}</p>`}
        <dl class="kv">
          <div><dt>Storage</dt><dd class="mono">${formatBytes(u.bytes)} / ${formatBytes(u.limit)}</dd></div>
        </dl>
        ${persistent ? '' : '<p class="hint is-stale">この環境では保存できません。閉じるとデータが消えます。</p>'}
      </div>
    </section>

    <footer class="about">
      <img class="app-icon sm" src="icons/icon.svg" alt="" width="32" height="32">
      <span>TripNote <span class="mono">v${VERSION}</span></span>
    </footer>`;

  el.querySelector('[data-act="export"]').addEventListener('click', () => exportBackup());
  el.querySelector('[data-act="restore"]').addEventListener('click', async () => {
    const file = await pickBackupFile();
    if (file) await restoreFromFile(file);
  });
  const rerender = () => render(el);
  el.querySelector('[data-act="add-rate"]')?.addEventListener('click', () => openRateForm(null, rerender));
  el.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => openRateForm(b.dataset.rate, rerender)));
  el.querySelector('[data-act="undo"]')?.addEventListener('click', () => undoRestore());
}
