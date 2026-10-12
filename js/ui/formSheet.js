// 欄を並べるだけのシート（場所ノートのメモ・リンク・移動のコツ・店・宿・エリアなどで使う）
//   fields: [{ name, label, type, value, options, required, hint, showIf }]
//     type: 'text' | 'textarea' | 'url' | 'tel' | 'number' | 'select' | 'choice'（チップ1つ）
//     options: [[value, label], ...]（select / choice）
//     showIf: { name, values }（その欄の値が values のどれかのときだけ出す。choice の欄で使う）
//   onSave(values) が文字列を返したら、それをエラーとして出して閉じない
//   onDelete があれば Delete ボタン（確認は deleteName で confirmDelete）
import { esc } from './dom.js';
import { openSheet, bindChoice, chip, iconChip } from './sheet.js';
import { icon } from './icons.js';
import { confirmDelete } from './modal.js';
import { NO_AUTOCORRECT } from './ime.js';
import { urlForSave, URL_ERROR } from '../logic/url.js';

function fieldHtml(f) {
  const v = f.value ?? '';
  const show = f.showIf ? `data-show-if="${esc(f.showIf.name)}" data-show-values="${esc(f.showIf.values.join(' '))}"` : '';
  const label = `<span class="field-label">${esc(f.label)}</span>`;
  const hint = f.hint ? `<p class="hint hint-sheet">${esc(f.hint)}</p>` : '';
  switch (f.type) {
    case 'textarea':
      return `<label class="field" ${show}>${label}<textarea class="input" name="${f.name}" rows="${f.rows || 3}">${esc(v)}</textarea>${hint}</label>`;
    case 'select':
      return `<label class="field" ${show}>${label}<select class="input" name="${f.name}">${f.options.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</label>`;
    case 'choice':
      // icons: true なら、アイコンと名前のチップ
      return `<div class="field" ${show}>${label}<div class="chips" data-group="${f.name}">${f.options.map(([val, l]) => (f.icons ? iconChip(val, icon(val), l, String(val) === String(v)) : chip(val, esc(l), String(val) === String(v)))).join('')}</div>${hint}</div>`;
    default: {
      const attrs = f.type === 'url' ? `type="url" inputmode="url" ${NO_AUTOCORRECT}`
        : f.type === 'tel' ? `type="tel" inputmode="tel" ${NO_AUTOCORRECT}`
        : f.type === 'number' ? `inputmode="numeric" ${NO_AUTOCORRECT}`
        : 'autocomplete="off"';
      return `<label class="field" ${show}>${label}<input class="input ${f.type === 'number' ? 'mono' : ''}" name="${f.name}" value="${esc(v)}" ${attrs}>${hint}</label>`;
    }
  }
}

export function openFormSheet({ title, fields, onSave, onDelete, deleteName, saveLabel }) {
  const body = `${fields.map(fieldHtml).join('')}
    ${onDelete ? '<button type="button" class="btn btn-danger-soft btn-block" data-act-delete>Delete</button>' : ''}
    <p class="form-error" role="alert" hidden></p>`;
  const choices = {};
  return openSheet({
    title,
    body,
    saveLabel,
    onMount(root, close, focusWhenOpen) {
      const syncShow = () => {
        root.querySelectorAll('[data-show-if]').forEach((el) => {
          const cur = choices[el.dataset.showIf]?.get() ?? root.querySelector(`[name="${el.dataset.showIf}"]`)?.value;
          el.hidden = !el.dataset.showValues.split(' ').includes(String(cur));
        });
      };
      for (const f of fields) if (f.type === 'choice') choices[f.name] = bindChoice(root, f.name, { allowNone: !f.required, onChange: syncShow });
      syncShow();
      root.querySelector('[data-act-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDelete(deleteName || '（名前なし）'))) return;
        onDelete();
        close(true);
      });
      const first = root.querySelector('input[name], textarea[name]');
      if (first && !fields[0]?.value) focusWhenOpen(first);
    },
    onSave(root) {
      const values = {};
      for (const f of fields) {
        if (f.type === 'choice') values[f.name] = choices[f.name].get();
        else values[f.name] = root.querySelector(`[name="${f.name}"]`).value;
        if (typeof values[f.name] === 'string' && f.type !== 'textarea') values[f.name] = values[f.name].trim();
      }
      const err = root.querySelector('.form-error');
      // リンクは http / https だけ（https:// がなければ付ける）
      for (const f of fields) {
        if (f.type !== 'url') continue;
        const url = urlForSave(values[f.name]);
        if (url === null) {
          err.textContent = URL_ERROR;
          err.hidden = false;
          return false;
        }
        values[f.name] = url;
      }
      const missing = fields.find((f) => f.required && !values[f.name]);
      if (missing) {
        err.textContent = `${missing.label} を入れてください`;
        err.hidden = false;
        return false;
      }
      const msg = onSave(values);
      if (typeof msg === 'string') {
        err.textContent = msg;
        err.hidden = false;
        return false;
      }
      return true;
    },
  });
}
