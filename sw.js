// オフラインで起動できるように、アプリの中身をキャッシュする
// VERSION は js/version.js とそろえる。変えると新しいキャッシュを作り、古いものを消す
const VERSION = '0.8.1';
const CACHE = `tripnote-v${VERSION}`;
const FONT_CACHE = 'tripnote-fonts';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/appStore.js',
  'js/backupActions.js',
  'js/images.js',
  'js/labels.js',
  'js/logic/backup.js',
  'js/logic/dates.js',
  'js/logic/images.js',
  'js/logic/money.js',
  'js/logic/packing.js',
  'js/logic/places.js',
  'js/logic/plan.js',
  'js/logic/trips.js',
  'js/logic/viewport.js',
  'js/store.js',
  'js/ui/dom.js',
  'js/ui/icons.js',
  'js/ui/imageViewer.js',
  'js/ui/ime.js',
  'js/ui/kind.js',
  'js/ui/modal.js',
  'js/ui/sheet.js',
  'js/ui/sortable.js',
  'js/ui/thumbs.js',
  'js/ui/toast.js',
  'js/ui/viewport.js',
  'js/uiState.js',
  'js/version.js',
  'js/views/common.js',
  'js/views/expenseForm.js',
  'js/views/home.js',
  'js/views/itemForm.js',
  'js/views/moneyAll.js',
  'js/views/notices.js',
  'js/views/packingForm.js',
  'js/views/packingMaster.js',
  'js/views/placeholder.js',
  'js/views/places.js',
  'js/views/settings.js',
  'js/views/tags.js',
  'js/views/trip.js',
  'js/views/tripBookings.js',
  'js/views/tripForm.js',
  'js/views/tripMoney.js',
  'js/views/tripPacking.js',
  'js/views/tripPlan.js',
  'vendor/Sortable.min.js',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('tripnote-v') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts：手元にあればすぐ使い、裏で新しくする
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  // それ以外の外部（AI の Worker など）はキャッシュしない
  if (url.origin !== self.location.origin) return;

  // ページを開くとき：キャッシュの index.html を使う
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then((hit) => hit || fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req))
  );
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const update = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || update;
}
