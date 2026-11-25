// Makes Tobar House open instantly and work offline. Network first (so it's always the newest version when
// online), the cache when there's no network. The ideas themselves live in IndexedDB (store.js), not here.
// Prototypes in play/ are cached as they're played, so a game played once plays offline too.
//
// When the Cloudflare Access sign-in has run out, a page load is redirected to the sign-in page; the app is
// served from the cache instead, so it still opens (with "Sign in" at the top). Its "Sign in again" link
// adds ?signin=1, which this lets through to Access.

const CACHE = 'tobar-v1';
const SHELL = [
  './', 'app.css', 'app.js', 'store.js', 'pad.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'play/prototypes.json', 'play/back-to-house.js',
];
const NETWORK_TIMEOUT_MS = 3500;
const scoped = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One missing file mustn't stop the rest
    await Promise.all(SHELL.map(async (path) => {
      try {
        const res = await fetch(scoped(path), { cache: 'no-cache', redirect: 'manual' });
        if (res.ok) await cache.put(scoped(path), res);
      } catch {}
    }));
  })());
});

self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));

async function respond(request) {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  // A page is its path, whatever's after the ? or #
  const key = request.mode === 'navigate' ? url.origin + url.pathname : request.url;
  const cached = () => cache.match(key, { ignoreSearch: request.mode === 'navigate' });
  if (self.navigator.onLine === false) {
    const hit = await cached();
    if (hit) return hit;
  }
  const network = fetch(request).then(async (res) => {
    if (res.ok && res.type === 'basic' && !res.redirected) cache.put(key, res.clone()).catch(() => {});
    // Signed out (or a wifi login page): the app from the cache is better than a sign-in wall
    else if ((res.type === 'opaqueredirect' || res.redirected) && (await cached())) return cached();
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    return (await cached()) ?? (await network);
  } catch (error) {
    const hit = await cached();
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) return;
  if (url.searchParams.has('signin')) return;
  if (request.headers.has('range')) return;
  event.respondWith(respond(request));
});
