// 讓遊戲可以「加到主畫面」並在離線時照樣打電腦、擂台與三分大賽。
// 頁面本身一律先走網路（上線後馬上拿到新版，才不會和伺服器的規則版本對不上），離線或網路太慢才用上次存的那份。
const CACHE = 'duanhuai-v1';
const LIBS = ['/three.min.js', '/qrcode.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-180.png', '/icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', ...LIBS])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // 帶房號的網址（/?r=XXXX）也是同一頁，快取都存在 '/' 這一筆
    const fresh = fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/', copy)); } return r; });
    const slow = new Promise(done => setTimeout(done, 4000));
    e.respondWith(Promise.race([fresh, slow]).then(r => r || caches.match('/').then(hit => hit || fresh)).catch(() => caches.match('/').then(hit => hit || Response.error())));
    return;
  }
  // 函式庫與圖示不會變：有快取就直接用
  if (LIBS.includes(url.pathname)) {
    e.respondWith(caches.match(url.pathname).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(url.pathname, copy)); } return r; })));
  }
});
