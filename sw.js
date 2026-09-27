// Service Worker para Project Manager
// Versión: auméntala cada vez que cambies archivos para forzar actualización
const CACHE_VERSION = 'project-manager-v6';
const CACHE_NAME = CACHE_VERSION;

// Archivos que se precargan (deben existir SIEMPRE)
const ASSETS = [
  './',
  './index.html?v=6',
  './manifest.json?v=6',
  './icono.png?v=6',
  './logo-blanco.png',
  './logo-negro.png'
];

// ────────────────────────────────────────────────────────────
// INSTALL: precachea los assets base
// ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW] No se pudo cachear:', url, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ────────────────────────────────────────────────────────────
// ACTIVATE: limpia cachés viejas
// ────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log('[SW] Eliminando caché vieja:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ────────────────────────────────────────────────────────────
// FETCH: estrategia híbrida
// ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // 1) Supabase: nunca cachear
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in')) {
    return;
  }

  // 2) CDNs externos: network-first con fallback a caché
  if (
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3) Navegación / HTML propio: NETWORK-FIRST
  // Así siempre se intenta traer la versión más nueva del código antes
  // de usar cualquier copia guardada. Esto evita quedarse pegado en una
  // versión vieja después de subir cambios al repositorio.
  const isNavigation = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (url.origin === self.location.origin && isNavigation) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html?v=6')))
    );
    return;
  }

  // 4) Resto de archivos propios (imágenes, íconos, manifest): cache-first con fallback a red
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const resClone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
            }
            return res;
          })
          .catch(() => new Response('', { status: 504, statusText: 'Offline' }));
      })
    );
    return;
  }
});

// ────────────────────────────────────────────────────────────
// MESSAGE: permite forzar skipWaiting desde el cliente
// ────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});