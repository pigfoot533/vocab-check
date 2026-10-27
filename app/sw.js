// アプリ本体（画面・判定用プログラム・発音辞書）を端末に保存する
// 判定用AI（tango-note-model-…）はキットが別の場所に保存するので、ここでは消さない
const SHELL = 'app-shell-v2';
const FILES = ['./', './index.html', './config.js', './manifest.webmanifest', './assets/icon-512.png', './css/app.css', './css/pron-kit.css', './js/api.js', './js/app.js', './js/g2p.js', './js/gop.js', './js/hw.js', './js/kit-shim.js', './js/model-cache.js', './js/pron-worker.js', './js/pron.js', './js/pronjudge.js', './js/recorder.js', './js/voice.js', './vendor/ort/ort.wasm.min.js', './vendor/ort/ort-wasm-simd-threaded.mjs', './vendor/ort/ort-wasm-simd-threaded.wasm', './dict/pron/a.txt', './dict/pron/b.txt', './dict/pron/c.txt', './dict/pron/d.txt', './dict/pron/e.txt', './dict/pron/f.txt', './dict/pron/g.txt', './dict/pron/h.txt', './dict/pron/i.txt', './dict/pron/j.txt', './dict/pron/k.txt', './dict/pron/l.txt', './dict/pron/m.txt', './dict/pron/n.txt', './dict/pron/o.txt', './dict/pron/p.txt', './dict/pron/q.txt', './dict/pron/r.txt', './dict/pron/s.txt', './dict/pron/t.txt', './dict/pron/u.txt', './dict/pron/v.txt', './dict/pron/w.txt', './dict/pron/x.txt', './dict/pron/y.txt', './dict/pron/z.txt'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('app-shell-') && k !== SHELL).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/config.js')) { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return; }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
