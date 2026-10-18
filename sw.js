/* Plan 21K · service worker
 * - Shell (HTML, CSS, JS, iconos): caché primero, con nombre versionado.
 * - plan.json y nutricion.json (y cualquier .json): red primero con 3 s de
 *   margen y, si no hay red, la última copia guardada.
 * - Borra las cachés antiguas (incluida "plan21k-prueba-1"), skipWaiting y clients.claim.
 * Al publicar una versión nueva, sube VERSION (y APP_VERSION en logic.js).
 */
const VERSION = '1.1.0';
const CACHE_SHELL = `plan21k-shell-${VERSION}`;
const CACHE_DATOS = 'plan21k-datos-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './logic.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
const DATOS = ['./plan.json', './nutricion.json'];
const ESPERA_RED_MS = 3000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(CACHE_SHELL);
    await shell.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    const datos = await caches.open(CACHE_DATOS);
    await Promise.all(DATOS.map(async u => {
      try {
        const r = await fetch(new Request(u, { cache: 'reload' }));
        if (r.ok) await datos.put(u, r);
      } catch (e) { /* sin red: ya se guardará en el siguiente arranque */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k !== CACHE_SHELL && k !== CACHE_DATOS).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.endsWith('.json')) {
    event.respondWith(redPrimero(event, req));
    return;
  }
  if (req.mode === 'navigate' && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'))) {
    event.respondWith(portada(req));
    return;
  }
  event.respondWith(cachePrimero(req));
});

function respuestaSinRed() {
  return new Response('{"error":"sin conexión"}', {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function redPrimero(event, req) {
  const red = fetch(req).then(async r => {
    if (r.ok) {
      const cache = await caches.open(CACHE_DATOS);
      await cache.put(req, r.clone());
    }
    return r;
  });
  // Que la copia se guarde aunque respondamos antes con la caché.
  try { event.waitUntil(red.then(() => undefined, () => undefined)); } catch (e) { /* nada */ }
  return (async () => {
    const guardada = await caches.match(req, { ignoreSearch: true });
    if (!guardada) {
      try { return await red; } catch (e) { return respuestaSinRed(); }
    }
    // Fuera de casa la IP del PC puede tardar en fallar: no esperamos más de 3 s.
    const espera = new Promise(resolve => setTimeout(() => resolve(null), ESPERA_RED_MS));
    try {
      const r = await Promise.race([red, espera]);
      if (r && r.ok) return r;
    } catch (e) { /* sin red: usamos la copia */ }
    return guardada;
  })();
}

async function portada(req) {
  const guardada = await caches.match(new URL('./index.html', self.location).href);
  if (guardada) return guardada;
  try {
    return await fetch(req);
  } catch (e) {
    return new Response('Sin conexión y sin copia de la app.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cachePrimero(req) {
  const guardada = await caches.match(req, { ignoreSearch: true });
  if (guardada) return guardada;
  try {
    const r = await fetch(req);
    if (r.ok) {
      const cache = await caches.open(CACHE_SHELL);
      await cache.put(req, r.clone());
    }
    return r;
  } catch (e) {
    return new Response('', { status: 504 });
  }
}
