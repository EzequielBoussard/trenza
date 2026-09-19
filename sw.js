// El visor no le pide nada a ningún servidor salvo sus propios archivos: todo lo que hace
// —descifrar, repartir, exportar— pasa en la máquina de quien lo abre. Con esto, una vez
// visitado anda sin conexión, que es lo que cabe esperar de algo que se puede instalar.
//
// La estrategia es red primero y caché de respaldo, no al revés. Los archivos no llevan
// huella en el nombre y el sitio los sirve con `no-cache`, así que servir de la caché de
// entrada dejaría a la gente con una versión vieja hasta vaya a saber cuándo. Así, con
// conexión siempre se ve lo último; sin conexión, lo último que se vio.
const CACHE = 'trenza';

// Lo que hace falta para abrir sin haber estado nunca sin conexión antes. Va la red del
// showcase también: es el enlace corto que se comparte, y abrirlo y que no haya nada sería
// peor que no abrir. Si un módulo deja de importarse desde `app.js`, sacarlo de acá.
const SHELL = [
  '/',
  '/styles.css',
  '/site.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/showcase/red-supermercado-2023.pkt',
  // Sólo las caras latinas: las extendidas se guardan solas si alguna vez hacen falta, y
  // sin ellas el visor sin conexión igual se ve con su letra.
  '/fonts/sans-latin.woff2',
  '/fonts/condensed-500-latin.woff2',
  '/fonts/condensed-600-latin.woff2',
  '/fonts/condensed-700-latin.woff2',
  '/fonts/mono-400-latin.woff2',
  '/fonts/mono-500-latin.woff2',
  '/src/app.js',
  '/src/i18n.js',
  '/src/theme.js',
  '/src/download.js',
  '/src/share.js',
  '/src/pkt/decode.js',
  '/src/pkt/model.js',
  '/src/pkt/config.js',
  '/src/pkt/twofish.js',
  '/src/pkt/eax.js',
  '/src/pcap/decode.js',
  '/src/pcap/dissect.js',
  '/src/pcap/encode.js',
  '/src/view/topology.js',
  '/src/view/graph.js',
  '/src/view/inspector.js',
  '/src/view/packets.js',
  '/src/view/export.js',
  '/src/view/export-dialog.js',
  '/src/view/export-preview.js',
  '/src/view/svg-context.js',
];

// Sólo se guarda lo propio. Lo de afuera es el `.pkt` que alguien abre con `?src=`: es un
// archivo ajeno, que no tiene por qué quedarse en la máquina de quien lo miró una vez, y que
// sin conexión no se puede volver a mirar de todos modos. Además llegaría opaco, o sea que
// un error de red se guardaría igual que un archivo bueno.
function isOwn(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => caches.open(CACHE))
      // El nombre de la caché no lleva versión, así que nada la vacía sola: lo que se guardó
      // alguna vez sigue ahí para siempre. Quien abrió el visor cuando la tipografía venía de
      // Google arrastra siete archivos de otro dominio que ya nadie pide. Se van acá.
      .then((cache) => cache.keys().then((saved) => Promise.all(
        saved.filter((request) => !isOwn(request)).map((request) => cache.delete(request)),
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
        // Se guarda la respuesta entera y buena, nada más: una página de error pisaría el
        // archivo bueno que ya estaba, y con una parcial `put` tira una excepción.
        if (response.status === 200) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => {
        if (hit) return hit;
        // Una dirección que no está guardada —`/demo`, por ejemplo— igual abre el visor: es
        // lo mismo que hace el servidor, que devuelve el index para toda ruta que no existe.
        if (request.mode === 'navigate') return caches.match('/');
        return Response.error();
      })),
  );
});
