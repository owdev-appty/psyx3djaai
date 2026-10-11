import { fillIcons } from './ui/icons.js';
import { toast } from './ui/toast.js';
import { store } from './appStore.js';
import * as home from './views/home.js';
import * as settings from './views/settings.js';
import { placeholder } from './views/placeholder.js';

// ハッシュのルート → { 画面, 下のタブ }
const routes = {
  trips: { render: home.render, tab: 'trips' },
  places: { render: placeholder('Places'), tab: 'places' },
  add: { render: placeholder('Add from screenshot'), tab: 'add' },
  packing: { render: placeholder('持ち物マスター'), tab: 'packing' },
  money: { render: placeholder('Money'), tab: 'money' },
  settings: { render: settings.render, tab: null },
};

const view = document.getElementById('view');

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0];
  return routes[name] ? name : 'trips';
}

function show({ keepScroll = false } = {}) {
  const route = routes[currentRoute()];
  route.render(view);
  document.querySelectorAll('.tabbar .tab').forEach((a) => {
    if (a.dataset.tab === route.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (!keepScroll) window.scrollTo(0, 0);
}

// 保存のたびに容量を確かめ、上限に近づいたら知らせる（同じ段階では1回だけ）
let lastLevel = store.usage().level;
store.subscribe((reason) => {
  if (reason === 'save-failed' && store.saveState === 'full') {
    toast('保存できませんでした（容量がいっぱいです）', { ms: 5000 });
  }
  if (reason === 'saved') {
    const level = store.usage().level;
    if (level !== 'ok' && level !== lastLevel) {
      toast('保存容量が残り少なくなっています。バックアップを書き出してください', { ms: 5000 });
    }
    lastLevel = level;
  }
  // 復元・取り消しのあとは、今の画面を描き直す
  if (reason === 'replaced' || (reason === 'saved' && currentRoute() === 'settings')) {
    show({ keepScroll: true });
  }
});

// アプリを閉じる・切り替えるときは、待たずに保存する
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush();
});
window.addEventListener('pagehide', () => store.flush());

fillIcons();
window.addEventListener('hashchange', () => show());
show();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
