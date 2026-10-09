// Service worker de Paladin Survival RPG (PWA liviana).
// Precachea los archivos estáticos para que el juego cargue rápido y funcione sin conexión.
// Para publicar cambios: subir CACHE_VERSION → el SW nuevo descarga todo de nuevo y borra la caché vieja.
const CACHE_VERSION = 'v3';
// Cache Storage es de todo el origen (elulises15.github.io): el nombre incluye el scope para no pisar
// cachés de otros proyectos/subpaths del mismo origen.
const CACHE_PREFIX = `paladin-mobile:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

// Rutas relativas al scope (funciona bajo un subpath de GitHub Pages).
const PRECACHE = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'src/main.js',
  'src/config.js',
  'src/input.js',
  'src/touch.js',
  'src/audio.js',
  'src/render/arena.js',
  'src/render/palettes.js',
  'src/render/renderer.js',
  'src/render/sprites.js',
  'src/sim/combat.js',
  'src/sim/effects.js',
  'src/sim/enemies.js',
  'src/sim/game.js',
  'src/sim/math.js',
  'src/sim/player.js',
  'src/sim/rng.js',
  'src/sim/score.js',
  'src/sim/waves.js',
  'src/storage/leaderboard.js',
  'src/ui/format.js',
  'src/ui/hud.js',
  'src/ui/layout.js',
  'src/ui/mobile.js',
  'src/ui/screens.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: 'reload' saltea la caché HTTP para no guardar copias viejas en la versión nueva.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
    // Sin skipWaiting automático: la primera instalación toma control enseguida (no había versión previa);
    // una actualización espera a que la página la active ya cargada (mensaje SKIP_WAITING desde main.js).
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: la página guardada de ESTA versión (HTML y módulos siempre de la misma versión);
  // si todavía no está en caché, red. Las actualizaciones llegan al subir CACHE_VERSION.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME)
        .then((cache) => cache.match(req, { ignoreSearch: true }).then((hit) => hit || cache.match('./')))
        .then((hit) => hit || fetch(req)),
    );
    return;
  }

  // Estáticos: caché primero (versión fija por CACHE_VERSION), red como respaldo.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => cache.match(req, { ignoreSearch: true })).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })),
  );
});
