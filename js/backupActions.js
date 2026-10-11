// バックアップの書き出し・復元・取り消し（画面の操作）。データの処理は store.js に任せる
import { store } from './appStore.js';
import { backupFileName, validateBackup, summaryText } from './store.js';
import { confirmModal } from './ui/modal.js';
import { toast } from './ui/toast.js';

// 書き出し：iPhone では共有メニュー（「ファイル」に保存できる）、使えなければダウンロード
export async function exportBackup() {
  const now = new Date();
  const broken = store.status === 'broken';
  // 読めなかったデータは、そのままの中身を書き出す
  const text = broken ? store.brokenRaw : store.backupJSON(now);
  const name = backupFileName(now);
  const file = new File([text], name, { type: 'application/json' });

  let done = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      done = true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false; // キャンセルしたら何もしない
      // 共有できなかったときはダウンロードに切り替える
    }
  }
  if (!done) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    done = true;
  }
  if (!broken) store.markBackedUp(now);
  toast('書き出しました');
  return true;
}

// 復元：ファイルを選ぶ → 形式チェック → 要約 → 確認 → 置き換え
export async function restoreFromFile(file) {
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    await confirmModal({ title: 'Restore from backup', body: 'JSON として読めませんでした。', okLabel: 'Done', cancelLabel: null });
    return false;
  }
  const check = validateBackup(raw);
  if (!check.ok) {
    await confirmModal({ title: 'Restore from backup', body: ['このファイルは使えません。', ...check.errors], okLabel: 'Done', cancelLabel: null });
    return false;
  }
  const body = [`ファイルの中身：${summaryText(raw)}`];
  if (store.status === 'broken') {
    body.push('読めなかったデータは、すべて置き換わります。置き換える前のデータは「Undo restore」で戻せます。');
  } else if (store.hasSavedData()) {
    body.push(`今のデータ（${summaryText(store.data)}）は、すべて置き換わります。置き換える前のデータは「Undo restore」で戻せます。`);
  }
  const ok = await confirmModal({
    title: 'Replace all data?',
    body,
    okLabel: 'Replace',
    danger: true,
  });
  if (!ok) return false;
  const r = store.replaceAll(raw);
  if (!r.ok) {
    await confirmModal({ title: 'Restore from backup', body: r.errors, okLabel: 'Done', cancelLabel: null });
    return false;
  }
  toast(r.undo === 'failed' ? '復元しました（容量が足りず、元に戻す用のデータは残せませんでした）' : '復元しました');
  return true;
}

export async function undoRestore() {
  const ok = await confirmModal({
    title: 'Undo restore',
    body: '復元する前のデータに戻します。今のデータは置き換わります。',
    okLabel: 'Undo restore',
    danger: true,
  });
  if (!ok) return false;
  store.undoRestore();
  toast('元に戻しました');
  return true;
}

// ファイル選択（input は毎回作る。同じファイルを続けて選べるように）
export function pickBackupFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null), { once: true });
    input.click();
  });
}
