import { fillIcons } from './ui/icons.js';
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

function show() {
  const name = currentRoute();
  const route = routes[name];
  route.render(view);
  document.querySelectorAll('.tabbar .tab').forEach((a) => {
    if (a.dataset.tab === route.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

fillIcons();
window.addEventListener('hashchange', show);
show();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
