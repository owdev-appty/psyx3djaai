import { store } from '../appStore.js';

// 保存されたデータを読めなかったとき
export function brokenNotice() {
  if (store.status !== 'broken') return '';
  return `
    <div class="notice notice-alert" role="alert">
      <p class="notice-title">データを読めませんでした</p>
      <p>保存されているデータは消していません。Settings の「Export backup」でそのまま書き出してから、「Restore from backup」で正しいバックアップを読み込んでください。</p>
    </div>`;
}

// 保存容量が少ない・保存できなかったとき
export function storageNotice() {
  if (store.saveState === 'full') {
    return '<div class="notice notice-alert" role="alert"><p>保存できませんでした（容量がいっぱいです）</p></div>';
  }
  const level = store.usage().level;
  if (level === 'ok') return '';
  return '<div class="notice notice-warn" role="status"><p>保存容量が残り少なくなっています。バックアップを書き出してください</p></div>';
}
