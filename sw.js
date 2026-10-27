// アプリ本体を端末に保存して、2回目から速く（電波が弱くても）開けるようにする
// 判定用AI（別の保存場所）はここでは消さない
const SHELL = 'check-shell-v1';
const FILES = [
  './', './index.html', './config.js', './css/check.css', './js/check.js', './workers/ai-worker.js',
  './vendor/ort/ort.wasm.min.js', './vendor/ort/ort-wasm-simd-threaded.mjs', './vendor/ort/ort-wasm-simd-threaded.wasm',
  './assets/apple.mp3', './assets/icon-512.png', './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('check-shell-') && k !== SHELL).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // 外部（GAS・AI）はそのまま通す
  // config.js は設定を変えたらすぐ反映させたいので、ネットを先に見る
  if (url.pathname.endsWith('/config.js')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
