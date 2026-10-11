// バックアップの書き出し・復元・取り消し（画面の操作）。データの処理は store.js に任せる
import { store } from './appStore.js';
import { backupFileName, validateBackup, summaryText } from './store.js';
import { confirmModal } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { exportImages, importImages } from './images.js';
import { attachmentIds, formatSize } from './logic/images.js';

// ファイルを共有メニューで渡す（iPhone では「ファイル」に保存できる）。使えなければダウンロード。
// 戻り値：'done' / 'cancel' / 'needs-tap'（準備に時間がかかり、タップからやり直す必要がある）
async function shareOrDownload(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'done';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancel';
      if (e && e.name === 'NotAllowedError') return 'needs-tap';
      // そのほかはダウンロードに切り替える
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'done';
}

// 書き出し。withImages なら、使われている画像も JSON に入れる（案C。初期値はオフ）
export async function exportBackup({ withImages = false } = {}) {
  const now = new Date();
  const broken = store.status === 'broken';
  const name = backupFileName(now);
  let text;
  let imageCount = 0;
  if (broken) {
    text = store.brokenRaw; // 読めなかったデータは、そのままの中身を書き出す
  } else if (withImages) {
    const obj = JSON.parse(store.backupJSON(now));
    obj.images = await exportImages(attachmentIds(store.data));
    imageCount = obj.images.length;
    text = JSON.stringify(obj);
  } else {
    text = store.backupJSON(now);
  }
  const file = new File([text], name, { type: 'application/json' });

  let result = await shareOrDownload(file);
  if (result === 'needs-tap') {
    // 画像を文字に変えるのに時間がかかると、iPhone は共有メニューを開かせてくれない。もう一度タップしてもらう
    const ok = await confirmModal({
      title: '書き出しの準備ができました',
      body: `画像${imageCount}枚（${formatSize(file.size)}）`,
      okLabel: 'Export backup',
    });
    result = ok ? await shareOrDownload(file) : 'cancel';
  }
  if (result !== 'done') return false;
  if (!broken) store.markBackedUp(now, { withImages });
  toast(withImages ? `画像${imageCount}枚も含めて書き出しました` : '書き出しました');
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
  const imgs = Array.isArray(raw.images) ? raw.images.length : 0;
  const body = [`ファイルの中身：${summaryText(raw)}${imgs ? `・画像${imgs}枚` : ''}`];
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
  // 画像が入っているファイルなら、画像も入れる（同じ id は上書き。前の画像は、取り消しのために残す）
  if (imgs) {
    try {
      await importImages(raw.images);
    } catch {
      toast('画像を入れられませんでした（容量がいっぱいです）', { ms: 5000 });
      return true;
    }
  }
  toast(r.undo === 'failed' ? '復元しました（容量が足りず、元に戻す用のデータは残せませんでした）' : imgs ? `画像${imgs}枚も含めて復元しました` : '復元しました');
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
