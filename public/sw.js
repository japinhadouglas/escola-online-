/* Service Worker — Escola Online (PWA)
 * Cache-first para arquivos estáticos; API e Socket.io sempre na rede.
 * Em offline, devolve o cache disponível (ou o shell do app).
 */
const CACHE = 'escola-online-v1';
const CORE = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

// Instalar: pré-cacheia o básico do app
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

// Ativar: limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: só intercepta GET da própria origem, fora de API/socket
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;       // API sempre ao vivo
  if (url.pathname.startsWith('/socket.io/')) return; // WebSocket nunca em cache

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Só cacheia respostas de sucesso do próprio site
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        // Sem rede: serve o cache; navegação sem cache recebe o shell
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('/index.html');
          return Response.error();
        })
      )
  );
});
