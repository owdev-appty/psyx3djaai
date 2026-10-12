// アプリの更新（Service Worker）。
//   ・起動したときと、アプリに戻ってきたとき（iPhone は終了せずに戻ることが多い）に、新しい版があるか確かめる
//   ・新しい版の準備ができたら「新しい版があります」と「今すぐ切り替える」を出す。
//     入力中やシートを開いている間は出さず、勝手に読み込み直すこともしない（書きかけを消さないため）
//   ・切り替わった後に1回だけ「v◯ になりました」と出す
import { VERSION } from './version.js';
import { getUi, setUi } from './uiState.js';
import { toast } from './ui/toast.js';

const busy = () => document.body.classList.contains('typing') || !!document.querySelector('.sheet-backdrop, .modal-backdrop');

let ready = false;
let bar = null;

function showBar() {
  if (!ready || bar || busy()) return;
  bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `
    <span class="update-text">新しい版があります</span>
    <button type="button" class="btn btn-small btn-primary" data-act="update-now">今すぐ切り替える</button>`;
  bar.querySelector('[data-act="update-now"]').addEventListener('click', () => location.reload());
  document.body.appendChild(bar);
}

export function watchUpdates() {
  // 前の版から切り替わったときの「v◯ になりました」（初めて開いたときは出さない）
  const last = getUi('lastVersion');
  if (last && last !== VERSION) setTimeout(() => toast(`v${VERSION} になりました`, { ms: 4000 }), 600);
  if (last !== VERSION) setUi('lastVersion', VERSION);

  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller; // 初めてのインストールでは「新しい版」と出さない
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    ready = true;
    showBar();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
  // 入力やシートが終わったら出す
  window.addEventListener('hashchange', showBar);
  document.addEventListener('focusout', () => setTimeout(showBar, 300));
  setInterval(showBar, 3000);
}
