/* Chico Stays service worker
   - Caches the app shell so the app opens instantly from the Home Screen.
   - The page itself is fetched network-first, so updates you push to
     GitHub show up on the next launch.
   - Supabase API / realtime requests are NEVER cached (always live data).
   Bump CACHE_VERSION when you change files to force a refresh. */
const CACHE_VERSION = 'chico-v1.3.0';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pinned Supabase library: cache-first (the URL contains the version).
  if (req.url.startsWith(CDN_PREFIX)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Only handle our own files; everything else (Supabase API) goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Pages: network-first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      // 'no-cache' revalidates with GitHub instead of using a stale browser copy.
      fetch(req, { cache: 'no-cache' }).then(res => {
        const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static files: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
