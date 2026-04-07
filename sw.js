/**
 * ============================================================
 * PLANIT — sw.js
 * Service Worker · PWA offline-first
 * ============================================================
 *
 * Estrategia de caché:
 *   - Shell de la app (HTML, CSS, JS, fuentes): Cache First
 *     → sirve desde caché, actualiza en background
 *   - Peticiones a Google Fonts: Stale While Revalidate
 *   - Todo lo demás: Network Only (no cachear datos de usuario)
 *
 * Versiones del caché:
 *   Incrementar CACHE_VERSION en cada deploy para invalidar
 *   el caché anterior y forzar la descarga de los nuevos assets.
 *
 * Flujo:
 *   install  → precachear el shell de la app
 *   activate → eliminar cachés de versiones anteriores
 *   fetch    → interceptar peticiones y aplicar estrategia
 * ============================================================
 */

const CACHE_VERSION   = 'planit-v1';
const CACHE_FONTS     = 'planit-fonts-v1';

/**
 * Shell de la app: archivos mínimos para que PLANIT
 * funcione sin conexión. Se descargan en el install.
 */
const SHELL = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/main.js',
  '/assets/js/modules/db.js',
  '/assets/js/modules/scheduler.js',
  '/assets/js/modules/ui.js',
  '/assets/js/modules/notifications.js',
  '/assets/js/views/agenda.js',
  '/assets/js/views/semana.js',
  '/assets/js/views/mes.js',
  '/assets/js/views/horario-u.js',
  '/assets/js/views/tareas.js',
  '/assets/js/views/proyectos.js',
  '/manifest.json',
  '/assets/img/icons/favicon.ico',
  '/assets/img/icons/icon-192.png',
  '/assets/img/icons/icon-512.png',
];

// ─── Install: precaché del shell ──────────────────────────────

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando versión:', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[SW] Precacheando shell de la app...');
      // addAll falla si UN solo recurso no se puede descargar.
      // En desarrollo algunos archivos pueden no existir aún —
      // por eso usamos Promise.allSettled para no bloquear.
      return Promise.allSettled(
        SHELL.map((url) =>
          cache.add(url).catch((err) =>
            console.warn(`[SW] No se pudo cachear ${url}:`, err)
          )
        )
      );
    })
    // skipWaiting: activar el SW inmediatamente sin esperar
    // que las pestañas existentes se cierren
    .then(() => self.skipWaiting())
  );
});

// ─── Activate: limpiar cachés viejos ─────────────────────────

self.addEventListener('activate', (event) => {
  console.log('[SW] Activando versión:', CACHE_VERSION);

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION && key !== CACHE_FONTS)
          .map((key) => {
            console.log('[SW] Eliminando caché obsoleto:', key);
            return caches.delete(key);
          })
      )
    )
    // clients.claim: tomar control de las pestañas abiertas
    // sin necesidad de recargar
    .then(() => self.clients.claim())
  );
});

// ─── Fetch: interceptar peticiones ───────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptar peticiones GET
  if (request.method !== 'GET') return;

  // Peticiones a Google Fonts → Stale While Revalidate
  // (servir desde caché mientras se actualiza en background)
  if (url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, CACHE_FONTS));
    return;
  }

  // Peticiones al propio dominio (shell de la app) → Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Todo lo demás → Network Only (no interferir con CDNs, APIs, etc.)
});

// ─── Estrategias de caché ─────────────────────────────────────

/**
 * Cache First:
 * 1. Buscar en caché → si existe, devolver inmediatamente
 * 2. Si no está en caché, ir a la red y guardar la respuesta
 *
 * Ideal para el shell de la app: archivos que no cambian
 * entre versiones (el CACHE_VERSION gestiona la invalidación).
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Solo cachear respuestas válidas (no errores 4xx/5xx)
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Sin red y sin caché: devolver página de offline si existe
    const offlinePage = await caches.match('/index.html');
    return offlinePage || new Response('Sin conexión', { status: 503 });
  }
}

/**
 * Stale While Revalidate:
 * 1. Devolver desde caché inmediatamente (si existe)
 * 2. En paralelo, actualizar el caché con la versión de red
 *
 * Ideal para fuentes: siempre rápido, siempre actualizado.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Lanzar actualización en background (no esperamos el resultado)
  const networkPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  // Devolver caché si existe, si no esperar la red
  return cached || networkPromise;
}

// ─── Notificaciones push desde background ────────────────────

/**
 * Manejar clicks en notificaciones nativas.
 * Cuando el usuario toca la notificación del sistema,
 * abre PLANIT y navega a la vista correspondiente.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const datos = event.notification.data || {};
  const ruta  = datos.ruta || '/agenda';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si PLANIT ya está abierto, enfocar esa pestaña
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.postMessage({ tipo: 'NAVEGAR', ruta });
            return;
          }
        }
        // Si no está abierto, abrir una ventana nueva
        return clients.openWindow(`/#${ruta}`);
      })
  );
});