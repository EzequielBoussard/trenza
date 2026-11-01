// Red primero, caché de respaldo. Los nombres de archivo no llevan hash y el sitio se sirve
// con no-cache, así que servir primero de la caché dejaría versiones viejas.
const CACHE = 'trenza';

// Tiene que coincidir con el grafo de imports de app.js (y con los modulepreload del index).
const SHELL = [
  '/',
  '/styles.css',
  '/site.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/showcase/red-supermercado.pkt',
  '/showcase/captura-ejemplo.pcap',
  // Sólo el subconjunto latino; latin-ext se guarda si alguna vez se pide.
  '/fonts/sans-latin.woff2',
  '/fonts/condensed-500-latin.woff2',
  '/fonts/condensed-600-latin.woff2',
  '/fonts/condensed-700-latin.woff2',
  '/fonts/mono-400-latin.woff2',
  '/fonts/mono-500-latin.woff2',
  '/src/app.js',
  '/src/i18n.js',
  '/src/theme.js',
  '/src/logo.js',
  '/src/download.js',
  '/src/share.js',
  '/src/pkt/decode.js',
  '/src/pkt/model.js',
  '/src/pkt/config.js',
  '/src/pkt/query.js',
  '/src/pkt/compare.js',
  '/src/pkt/review.js',
  '/src/pkt/twofish.js',
  '/src/pkt/eax.js',
  '/src/pcap/decode.js',
  '/src/pcap/dissect.js',
  '/src/pcap/encode.js',
  '/src/view/topology.js',
  '/src/view/graph.js',
  '/src/view/inspector.js',
  '/src/view/rich-text.js',
  '/src/view/packets.js',
  '/src/view/export.js',
  '/src/view/export-dialog.js',
  '/src/view/export-preview.js',
  '/src/view/svg-context.js',
];

// Sólo se cachea el propio origen. Lo ajeno es el .pkt de ?src=, que no tiene por qué
// quedar guardado en la máquina.
function isOwn(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

// Un módulo o un ejemplo que ya no está en la lista cambió de nombre o se sacó: nadie lo va a pedir.
function isRetired(request) {
  const { pathname } = new URL(request.url);
  return /^\/(src\/.+\.js|showcase\/.+\.(pkt|pcap))$/.test(pathname) && !SHELL.includes(pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => caches.open(CACHE))
      // La caché no tiene versión, así que lo ajeno y lo retirado que hayan quedado se borran acá.
      .then((cache) => cache.keys().then((saved) => Promise.all(
        saved.filter((request) => !isOwn(request) || isRetired(request)).map((request) => cache.delete(request)),
      )))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isOwn(request)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Sólo 200: un error pisaría la copia buena y con un 206 `put` lanza.
        if (response.status === 200) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => {
        if (hit) return hit;
        // Igual que el servidor: cualquier ruta de navegación devuelve el index.
        if (request.mode === 'navigate') return caches.match('/');
        return Response.error();
      })),
  );
});
