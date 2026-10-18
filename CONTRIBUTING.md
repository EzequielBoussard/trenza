# Contribuir

## Reportar un problema

Si un archivo no abre o se ve mal, abrí un issue con la versión de Packet Tracer con la que se guardó, el navegador que usás y qué esperabas ver. Si podés, adjuntá el archivo. Un `.pkt` lleva la configuración de cada equipo y una captura lleva el contenido de los paquetes: antes de subirlos, revisá que no tengan contraseñas ni datos que no quieras publicar.

Las vulnerabilidades no van en un issue: ver [SECURITY.md](SECURITY.md).

## Proponer cambios

- Todo corre en el navegador, sin dependencias ni paso de compilación: los módulos de `src/` se sirven tal cual. Si algo pide una biblioteca, se escribe a mano o no entra.
- `npm test` tiene que pasar (Node 22 o más nuevo). Las pruebas que necesitan una página usan el Chrome o el Edge instalado; sin ninguno se saltan. Para mirar un cambio alcanza con servir la carpeta con cualquier servidor estático, por ejemplo `python -m http.server`.
- Un servidor estático común no manda las cabeceras de `_headers`, así que lo que dependa de la política de seguridad se ve recién en Cloudflare Pages. Si tocás el guion en línea de `index.html`, recalculá su `sha256` en `_headers`.
- Cada texto de la interfaz va en inglés y en español en `src/i18n.js`. Una prueba revisa que los dos idiomas tengan las mismas claves.
- Los comentarios explican por qué algo es como es; lo que hace ya lo dice el código.
