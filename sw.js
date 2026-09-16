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

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Las tipografías vienen de otro dominio y llegan opacas; guardarlas igual es lo que
        // hace que sin conexión el diagrama no cambie de letra. Lo que no responde bien no
        // se guarda: una página de error pisaría el archivo bueno que ya estaba.
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
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
