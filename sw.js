// Service worker: keeps the game's files so it opens fast (and offline) and the sprites are never downloaded twice.
//  - the page itself: network first, falling back to the saved copy
//  - scripts, styles, data and sprites (their URLs carry a version, so a saved copy is always the right one): saved copy first
const CACHE = 'poke82';
const CORE = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try {
      const html = await (await fetch('/', { cache: 'no-store' })).text();
      const urls = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)[^"]*)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u) && !u.startsWith('/_vercel'));
      await c.addAll(CORE.concat(urls.map(u => '/' + u.replace(/^\//, ''))));
      const atlas = await (await fetch(urls.find(u => u.includes('atlas.js')) ? '/' + urls.find(u => u.includes('atlas.js')).replace(/^\//, '') : '/data/atlas.js')).text();
      await c.addAll([...new Set([...atlas.matchAll(/sprites\/atlas\/sheet-\d+\.webp/g)].map(m => '/' + m[0]))]);
    } catch (err) { /* offline install: the page works online and caches what it loads */ }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/_vercel')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/', copy)); prune(); return r; }).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; })));
});

// drop saved scripts and styles from older versions once the page lists newer ones
async function prune() {
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text(), keep = new Set([...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)[^"]*)"/g)].map(m => new URL('/' + m[1].replace(/^\//, ''), location.origin).href));
    const c = await caches.open(CACHE);
    for (const r of await c.keys()) { const u = new URL(r.url); if (/\.(js|css)$/.test(u.pathname) && !keep.has(r.url)) await c.delete(r); }
  } catch (e) { /* ignore */ }
}
