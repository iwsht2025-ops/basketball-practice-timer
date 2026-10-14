const SCOPE = self.registration.scope;
const PREFIX = 'court-clock:' + new URL(SCOPE).pathname + ':';
const CACHE = PREFIX + "0427fcd47d13098c";
const INDEX = new URL('index.html', SCOPE).href;
const FILES = ["assets/index-BDlhfzl0.js","assets/index-DjB12EEj.css","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","index.html","manifest.webmanifest"].map(file => new URL(file, SCOPE).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(FILES.map(url => new Request(url, {cache:'reload'})));
    } catch(error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== new URL(SCOPE).origin || !url.href.startsWith(SCOPE)) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        // Keep the installed index immutable. A newly fetched HTML page may
        // reference bundles that are not available until a complete update installs.
        return response;
      } catch {
        return (await cache.match(INDEX, {ignoreVary:true})) ?? new Response('Offline', {status:503});
      }
    })());
  } else if (FILES.includes(url.href) || url.pathname.startsWith(new URL('assets/',SCOPE).pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      // Our same-origin, static build files do not vary with request headers.
      // Module loads carry Origin; precache fetches may not, even on the same origin.
      const cached = await cache.match(request, {ignoreVary:true});
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
