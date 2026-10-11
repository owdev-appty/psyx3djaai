import { fillIcons } from './ui/icons.js';
import { toast } from './ui/toast.js';
import { watchPageFields } from './ui/viewport.js';
import { KEYS } from './store.js';
import { attachmentIds } from './logic/images.js';
import { removeOrphans } from './images.js';
import { store, storage } from './appStore.js';
import * as home from './views/home.js';
import * as settings from './views/settings.js';
import * as trip from './views/trip.js';
import * as moneyAll from './views/moneyAll.js';
import * as packingMaster from './views/packingMaster.js';
import * as tags from './views/tags.js';
import * as places from './views/places.js';
import { placeholder } from './views/placeholder.js';

// ハッシュのルート → { 画面, 下のタブ }
const routes = {
  trips: { render: home.render, tab: 'trips' },
  places: { render: places.render, tab: 'places' },
  add: { render: placeholder('Add from screenshot'), tab: 'add' },
  packing: { render: packingMaster.render, tab: 'packing' },
  tags: { render: tags.render, tab: 'packing' },
  money: { render: moneyAll.render, tab: 'money' },
  settings: { render: settings.render, tab: null },
  trip: { render: trip.render, tab: 'trips' },
};

const view = document.getElementById('view');

// "#/trip/abc/plan" → { name: 'trip', params: ['abc', 'plan'] }
function parseHash() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return routes[name] ? { name, params } : { name: 'trips', params: [] };
}
const currentRoute = () => parseHash().name;

let lastRoute = null;
function show({ keepScroll = false } = {}) {
  const { name, params } = parseHash();
  const route = routes[name];
  if (lastRoute === 'packing' && name !== 'packing') packingMaster.leave();
  lastRoute = name;
  route.render(view, params);
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
watchPageFields();
window.addEventListener('hashchange', () => show());
show();

// どこからも使われていない画像を片付ける。復元を取り消せるように、復元前のデータ（prev）の画像も残す
function cleanImages() {
  if (store.status !== 'ok' || !window.indexedDB) return;
  const used = attachmentIds(store.data);
  try {
    const prev = JSON.parse(storage.getItem(KEYS.prev) || 'null');
    for (const id of attachmentIds(prev)) used.add(id);
  } catch { /* prev が読めなければ今のデータだけ */ }
  removeOrphans(used).catch(() => {});
}
setTimeout(cleanImages, 1500);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
