# Trenza

Visor de sólo lectura para archivos `.pkt` / `.pka` de Cisco Packet Tracer y para capturas
`.pcap` / `.pcapng`. Todo el procesamiento ocurre en el navegador: el archivo nunca se envía
a un servidor.

## Qué muestra

Para un archivo de Packet Tracer: la topología lógica con las posiciones originales, el
inventario de equipos, las interfaces con sus direcciones y la `running-config` de cada
dispositivo que tenga una.

Para una captura: la lista de paquetes con tiempo relativo, direcciones y protocolo, el
desglose por capas de cada paquete y su volcado hexadecimal.

## Formato de los archivos de Packet Tracer

Un `.pkt` no es un contenedor estándar. Desde la versión 6.2 la tubería es, en orden inverso
al que la aplica Packet Tracer:

1. **Ofuscación exterior.** El archivo se lee al revés y cada byte se enmascara con un valor
   derivado de su posición y del largo total.
2. **Descifrado.** Twofish en modo EAX, con clave y nonce fijos e iguales para todas las
   instalaciones (dieciséis bytes `0x89` y dieciséis bytes `0x10`).
3. **Ofuscación interior.** Otra máscara dependiente de la posición sobre el texto plano.
4. **Descompresión.** zlib, con el tamaño descomprimido en los cuatro primeros bytes.

El resultado es el XML que Packet Tracer usa internamente. Los archivos anteriores a la 6.2
sólo tienen los pasos 3 y 4; el visor prueba primero la variante moderna y cae en la heredada
si falla.

La descripción de la tubería proviene de trabajos públicos de ingeniería inversa, sobre todo
[`pka2xml`](https://github.com/mircodz/pka2xml) y
[`ptexplorer`](https://github.com/axcheron/ptexplorer). Este proyecto no distribuye software,
iconografía ni contenido de Cisco, y no reimplementa el simulador: sólo lee.

## Idiomas

La interfaz viene en inglés y en español. El selector está en la cabecera y la elección
queda guardada en el navegador. Cambiar de idioma vuelve a dibujar lo que haya abierto,
incluidos los nombres de campo de los paquetes, sin perder la selección.

Los textos viven en `src/i18n.js`, un diccionario por idioma. Agregar uno es copiar el bloque
y traducir las claves.

## Exportar el diagrama

El botón **Exportar diagrama** dibuja la red entera en un lienzo aparte, con el encuadre
calculado a partir de los límites reales de la topología. No captura la pantalla: el zoom y el
desplazamiento que tengas puestos no afectan el resultado, y no se recorta nada.

Formatos: PNG (admite fondo transparente), JPG y PDF de una página. El nombre propuesto es el
del archivo abierto sin su extensión, y se puede cambiar antes de exportar.

La resolución se elige en píxeles —1280×720, 1920×1080, 2560×1440 o 3840×2160— y el archivo
sale exactamente de esa medida, con el diagrama ajustado adentro. La quinta opción, *ajustar al
diagrama*, deja que el lienzo crezca hasta que quepa todo. Cuanto más chica la resolución, menos
etiquetas entran; si alguna queda afuera, la barra de estado dice cuántas, para saber si conviene
subir un escalón. El PDF entra siempre en una hoja A4 apaisada: más píxeles suben la definición,
no el tamaño de la página.

Una resolución que dejaría etiquetas afuera no se ofrece: al abrir el diálogo se calcula, para
ese archivo, cuáles alcanzan, y las que no quedan bloqueadas con el motivo escrito al lado. La
preferida es 1920×1080 y, si no alcanza, se elige sola la menor que sí. Toda exportación lleva
la dirección del visor abajo a la derecha.

El lienzo se calcula a partir de lo que ocupa el contenido, no al revés. Se mide cada etiqueta
con la tipografía real, se busca la escala mínima a la que ningún par de dispositivos se pisa
—a dos vecinos les alcanza con separarse en un eje— y sobre esa área se suman los márgenes del
título, la leyenda y las etiquetas. Como la escala es única, la proporción de la red se
conserva. Si aun así quedara alguna superposición, la dirección IP no se dibuja: dos textos
encimados no se leen ninguno de los dos.

La leyenda se arma en columnas de ancho uniforme, alineadas entre sí, y pasa a varias filas si
no entran a lo ancho.

El PDF se escribe a mano: una página con el diagrama como imagen RGB comprimida con
`FlateDecode`, sin pérdida. Un documento tan chico no justifica sumar una biblioteca de PDF
entera al proyecto.

## Dispositivos apartados

Packet Tracer deja arrastrar un equipo a cualquier rincón del espacio de trabajo, y ahí queda
guardado. Uno solo a 3900 unidades del resto multiplica por diez los límites del dibujo y
aplasta la red entera contra el centro. Por eso los dispositivos sin ningún enlace que además
caen fuera del rectángulo donde vive la red se dibujan aparte, en una bandeja al pie del
diagrama. Aparecen igual, sin deformar lo demás, y con el motivo a la vista.

## El diagrama en pantalla

Las etiquetas van en un grupo que compensa el zoom, así que conservan su tamaño en pantalla:
acercarse separa los textos de verdad en vez de agrandar todo por igual. Cada vez que cambia el
zoom se recalcula qué etiquetas caben, y las que no entran aparecen al acercarse. El
dispositivo seleccionado muestra siempre la suya.

## Descargar el original

El panel de resumen ofrece el archivo tal cual se abrió. Sirve tanto para el que abriste vos
como para el que llegó por `?src=`, porque en los dos casos el visor tiene los bytes. No sirve
para un enlace que sólo lleva el modelo: ese enlace no contiene el archivo.

## Abrir un archivo publicado

`?src=<dirección>` hace que el visor descargue el archivo de esa dirección y lo abra. El
servidor de origen tiene que permitir CORS: `raw.githubusercontent.com` sí, la descarga directa
de Google Drive no. Sólo se aceptan direcciones `https`, salvo en el mismo origen que el visor.

Es la forma de publicar una red: dejás el `.pkt` en una dirección accesible y compartís el
enlace con el parámetro. Quien lo abra ve la topología y puede bajarse el archivo original.

El visor no empaqueta archivos dentro del enlace. Un `.pkt` ya viene comprimido por dentro, así
que codificado ocupa más de lo que aceptan los navegadores y la mensajería, y el resultado sería
un enlace roto según por dónde se pegue. Para pasarle el archivo a alguien, se le pasa el
archivo.

## Desarrollo

```bash
npm test
```

No hay dependencias ni paso de compilación. Para probarlo localmente alcanza con servir la
carpeta con cualquier servidor estático; el navegador necesita servir los módulos por HTTP,
no funciona abriendo `index.html` desde el disco.

La descompresión usa `DecompressionStream`, disponible en Chrome 80, Firefox 113 y Safari 16.4
en adelante.

## Despliegue en Cloudflare Pages

Sin comando de compilación y con la raíz del repositorio como directorio de salida. El archivo
`_headers` define la política de seguridad de contenido, que permite las fuentes de Google y
bloquea todo lo demás.

## Estado

Validado contra archivos reales de Packet Tracer 7.3 y contra capturas pcap generadas para las
pruebas. Sin verificar todavía: archivos de la serie 8.x, capturas pcapng con varias interfaces
y enlaces distintos de Ethernet.
