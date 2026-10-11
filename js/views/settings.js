import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { VERSION } from '../version.js';
import { store, persistent } from '../appStore.js';
import { summaryText } from '../store.js';
import { lastBackupText, isBackupStale, formatBytes } from '../logic/backup.js';
import { exportBackup, restoreFromFile, undoRestore, pickBackupFile } from '../backupActions.js';
import { brokenNotice, storageNotice } from './notices.js';

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
  el.querySelector('[data-act="undo"]')?.addEventListener('click', () => undoRestore());
}
