/* Appreciart dashboard PWA service worker.
   Shell-only caching: never caches API data (live availability/sessions
   must always come from the network — stale data risks double-booking). */

const CACHE_NAME = 'appreciart-shell-v1';

const SHELL_ASSETS = [
  '/dashboard.html',
  '/login.html',
  '/manifest.json',
  '/css/main.css',
  '/css/dashboard.css',
  '/css/login.css',
  '/js/utils.js',
  '/js/toast.js',
  '/js/header.js',
  '/js/footer.js',
  '/js/main.js',
  '/js/dashboard.js',
  '/js/login.js',
  '/images/favicon/android-chrome-192x192.png',
  '/images/favicon/android-chrome-512x512.png',
  '/images/favicon/apple-touch-icon.png',
  '/images/favicon/favicon.ico',
  '/fonts/poppins-300.woff2',
  '/fonts/poppins-400.woff2',
  '/fonts/poppins-700.woff2',
  '/fonts/poppins-900.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cross-origin (Railway API, Stripe, Cloudinary, analytics): network only,
  // never intercepted with a cache.
  if (url.origin !== self.location.origin) return;

  // Same-origin non-GET (form posts etc.): network only.
  if (event.request.method !== 'GET') return;

  // Same-origin shell assets: network-first, cache fallback for offline opens.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && SHELL_ASSETS.includes(url.pathname)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      // Offline: serve the cached copy; for a navigation to a page that was
      // never cached (forgot/reset-password), fall back to the app shell rather
      // than letting respondWith resolve undefined and show the browser error.
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then((hit) => hit || (event.request.mode === 'navigate'
          ? caches.match('/dashboard.html')
          : undefined)))
  );
});
