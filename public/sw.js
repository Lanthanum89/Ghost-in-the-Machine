// Caches the app shell so the page opens offline. It only handles same-origin GET requests,
// so calls to Ollama (a different origin) always go straight to the network.
//
// Cache storage is shared by every site on this origin (for example other projects on the same
// GitHub Pages account), so only caches with this prefix are ever touched.
const PREFIX = 'ghost-in-the-house-';
const CACHE = `${PREFIX}v2`;

/** Caches the page and everything it links to (the hashed JS and CSS, manifest and icons). */
async function precache() {
  const scope = self.registration.scope;
  const scopePath = new URL(scope).pathname;
  const html = await (await fetch(scope, { cache: 'reload' })).text();

  const urls = new Set([scope]);
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const url = new URL(ref, scope);
    if (url.origin === self.location.origin && url.pathname.startsWith(scopePath)) urls.add(url.href);
  }
  await (await caches.open(CACHE)).addAll([...urls]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Stale while revalidate: answer from cache if we can, and refresh it in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const navigating = request.mode === 'navigate';
      // ignoreVary: the dev and preview servers send "Vary: Origin", and a precached file would not
      // match the Origin header that module script requests carry.
      const cached = await cache.match(request, { ignoreSearch: navigating, ignoreVary: true });

      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            // Keep the worker alive until the write lands, but never delay or fail the response.
            event.waitUntil(cache.put(request, response.clone()).catch(() => undefined));
          }
          return response;
        })
        .catch(() => undefined);
      event.waitUntil(refresh);

      if (cached) return cached;
      const fresh = await refresh;
      if (fresh) return fresh;
      // Offline and not cached: only a page navigation can fall back to the app shell.
      return (navigating && (await cache.match(self.registration.scope, { ignoreVary: true }))) || Response.error();
    })(),
  );
});
