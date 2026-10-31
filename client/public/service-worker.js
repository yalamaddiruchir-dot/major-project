/* eslint-disable no-restricted-globals */
const CACHE_VERSION = 'v4';
const SHELL_CACHE = `rural-learning-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `rural-learning-assets-${CACHE_VERSION}`;
const CORE_SHELL_URLS = ['/', '/index.html', '/manifest.json', '/favicon.svg'];

const precacheBuildManifestAssets = async (cache) => {
  try {
    const response = await fetch('/asset-manifest.json', { cache: 'no-cache' });
    if (!response.ok) return;
    const manifest = await response.json();
    const filesObj = manifest && manifest.files ? manifest.files : {};
    const urls = Object.values(filesObj).filter(
      (u) => typeof u === 'string' && u.startsWith('/') && !u.endsWith('.map')
    );
    if (urls.length > 0) {
      await Promise.allSettled(urls.map((u) => cache.add(u)));
    }
  } catch (_err) {
    // asset-manifest may not exist in dev server
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(async (cache) => {
        await Promise.allSettled(CORE_SHELL_URLS.map((u) => cache.add(u)));
        await precacheBuildManifestAssets(cache);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE && name !== ASSET_CACHE)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'CLEAR_PRIVATE_CACHES') {
    // Only public static shell assets are kept in CacheStorage; user learning data lives in user-scoped IndexedDB.
    // Still purge any dynamic runtime cache if requested on logout.
    event.waitUntil(caches.delete(ASSET_CACHE));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'rural-learning-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_OFFLINE_SYNC' });
        });
      })
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Security: NEVER cache private API responses or protected uploaded files in shared CacheStorage
  if (url.pathname.startsWith('/api/') || (url.pathname.startsWith('/uploads/') && !url.pathname.startsWith('/uploads/thumbnails/'))) {
    return;
  }

  // SPA navigation requests: network-first with offline fallback to cached app shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(async () => {
          const shellCache = await caches.open(SHELL_CACHE);
          return (await shellCache.match('/index.html')) || (await shellCache.match('/'));
        })
    );
    return;
  }

  // Static build bundles, fonts, icons, manifest, and public thumbnails: cache-first + background revalidate
  if (
    url.pathname.startsWith('/static/')
    || url.pathname.startsWith('/uploads/thumbnails/')
    || /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?|json)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              const targetCache = url.pathname.startsWith('/static/') ? SHELL_CACHE : ASSET_CACHE;
              caches.open(targetCache).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
