/* Baller's Book service worker: precache everything, serve cache-first, fully offline.
   Bump VERSION (tools/bump.py does it, and keeps shared/version.js in sync) for every deploy:
   the new worker installs in the background and takes over via the home screen's Update
   button, or on the next launch after the app is fully closed. */
const VERSION = '1.0.0';
const CACHE = 'playbook-v' + VERSION;

// App shell. Play pages (and any per-play "assets") come from plays.json, so adding a play
// never means editing this list.
const SHELL = [
  './',
  'index.html',
  'plays.json',
  'manifest.webmanifest',
  'shared/shell.css',
  'shared/shell.js',
  'shared/version.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const plays = await (await fetch('plays.json', { cache: 'no-store' })).json();
    const urls = [...SHELL, ...plays.flatMap(p => [p.file, ...(p.assets || [])])];
    const cache = await caches.open(CACHE);
    // addAll is all-or-nothing: one failed request fails the install and the previous
    // version keeps serving, so the app is never left half-cached. 'reload' skips the
    // HTTP cache so a deploy can't precache stale files.
    await cache.addAll(urls.map(u => new Request(u, { cache: 'reload' })));
  })().catch(async err => {
    await caches.delete(CACHE);
    throw err;
  }));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('playbook-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  else if (event.data === 'version' && event.source) event.source.postMessage({ version: VERSION });
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') {
        const home = await cache.match('index.html');
        if (home) return home;
      }
      throw err;
    }
  })());
});
