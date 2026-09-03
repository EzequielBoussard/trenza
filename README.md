# Trenza

Visor sólo-lectura para archivos `.pkt` / `.pka` de Cisco Packet Tracer y capturas `.pcap` / `.pcapng`. Todo procesa en navegador: archivo nunca sale a servidor.

## Qué muestra

Packet Tracer: topología lógica con posiciones originales, inventario de equipos, interfaces con direcciones, y `running-config` de cada dispositivo que tenga.

Captura: lista de paquetes con tiempo relativo, direcciones y protocolo, desglose por capas, volcado hexadecimal.

## Formato de los archivos de Packet Tracer

`.pkt` no es contenedor estándar. Desde 6.2, tubería en orden inverso al que aplica Packet Tracer:

1. **Ofuscación exterior.** Archivo leído al revés, cada byte enmascarado con valor derivado de posición y largo total.
2. **Descifrado.** Twofish modo EAX, clave y nonce fijos e iguales para todas las instalaciones (dieciséis bytes `0x89` y dieciséis bytes `0x10`).
3. **Ofuscación interior.** Otra máscara dependiente de posición sobre texto plano.
4. **Descompresión.** zlib, tamaño descomprimido en primeros cuatro bytes.

Resultado: XML interno de Packet Tracer. Archivos previos a 6.2 sólo tienen pasos 3 y 4; visor prueba variante moderna primero, cae en heredada si falla.

Tubería documentada por ingeniería inversa pública, sobre todo [`pka2xml`](https://github.com/mircodz/pka2xml) y [`ptexplorer`](https://github.com/axcheron/ptexplorer). Proyecto no distribuye software, iconografía ni contenido de Cisco, y no reimplementa simulador: sólo lee.

## Idiomas

Interfaz en inglés y español. Selector en cabecera, elección guardada en navegador. Cambiar idioma redibuja lo abierto, incluidos nombres de campo de paquetes, sin perder selección.

Textos en `src/i18n.js`, un diccionario por idioma. Agregar uno = copiar bloque y traducir claves.

## De dónde salen las posiciones

Del archivo. Cada dispositivo trae su X y su Y en `WORKSPACE/LOGICAL`, y son las que Packet Tracer guardó cuando alguien lo arrastró ahí. El visor no reordena nada: sólo lleva ese rectángulo al que tenga a mano, con un estiramiento acotado cuando las proporciones no coinciden.

Eso fija el techo de todo lo demás. Separar dos equipos que el archivo puso juntos es agrandar el dibujo entero, y agrandar el dibujo entero es achicar la letra respecto del marco. Son la misma perilla, no dos.

## Exportar el diagrama

Botón **Exportar diagrama** dibuja red entera en lienzo aparte, encuadre calculado desde límites reales de topología. No captura pantalla: zoom y desplazamiento actuales no afectan resultado, no recorta nada.

Formatos: PNG, JPG, SVG y PDF de una página. PNG y SVG admiten fondo transparente. Nombre propuesto = archivo abierto sin extensión, editable antes de exportar.

Diagrama tiene tamaño natural: aquel donde ninguna etiqueta pisa otra. SVG sale siempre de ese tamaño, y por vectorial se agranda después sin perder nitidez. Resoluciones en píxeles —1280×720, 1920×1080, 2560×1440, 3840×2160— toman el mismo dibujo y lo reparten en la medida pedida.

Con medida fija, lo único que se elige es en cuántas unidades de diseño se reparte el dibujo, y de eso depende el tamaño de todo: el diagrama se dibuja en esas unidades y después se multiplica por la escala. Arrancan en 2200 y son las mismas venga la salida de 1080 o de 4K, así que subir la resolución agranda nombres, direcciones e iconos en vez de sumar píxeles al mismo dibujo diminuto. El número sale del visor, que reparte la red en 1600 unidades con nombres de 13 px: con los de 15 de la exportación, esas proporciones caen cerca de 1850.

Si con ese ancho alguna etiqueta se queda sin lugar, el diseño se ensancha hasta que entren todas, con tope en el ancho natural. Cuesta cuerpo de letra —en el archivo del showcase, de 2200 a 2800 unidades, que en 4K son 26 px de etiqueta en vez de 21— pero una dirección a medias no sirve para nada. Ese mismo ensanche deja 1920×1080 fuera de la lista para redes grandes, porque ahí el texto caería por debajo del piso legible.

Y como el marco casi nunca tiene la proporción de la red, esta se estira hasta 1,75 veces en un eje antes que dejar franjas vacías: es un esquema, no un plano. Vale igual en el visor, que sin eso usaba 394 de sus 850 unidades de alto y apretaba las etiquetas contra el medio. En un 4K los cuatro márgenes quedan en unos 100 px sobre 3840.

Nombre y dirección son una sola pieza. Se dibujan juntos y, si el lugar está ocupado, bajan juntos al renglón siguiente: separarlos dejaba la dirección flotando lejos de su nombre, sin que se supiera de quién era. Lo que no encuentra ningún renglón libre se dibuja igual, rozando a otra etiqueta, porque una que aparece y desaparece al acercarse molesta más que dos que se tocan.

Pero un bloque corrido rompe la alineación, y en una fila de equipos iguales con uno más abajo eso canta. Así que el ancho no se busca hasta que entren, sino hasta que **todos queden en el mismo renglón**: la medida de lo prolijo cuenta los que se rozan y los que bajaron, y el diseño crece hasta llevarla a cero. Más ancho no siempre es más prolijo —al estirarse cambia también la separación vertical—, así que se prueban varios y gana el primero que llega a cero.

De ahí sale el cuerpo de la dirección, 10 contra 15 del nombre: con trece caracteres en monoespaciada es lo que decide cuánto separar los equipos. A cuerpo 12 hacían falta 3200 unidades para alinear las setenta y una; a cuerpo 10, 2709. En un 4K eso es un nombre de 21 px en vez de 18, y la dirección queda en 14.

El disco reservado mide lo mismo que el dibujado, 26, y se mide como el círculo que es: una caja que sólo alcanza la esquina de su cuadrado no lo toca de verdad, y descartarla por eso cuesta once píxeles en diagonal. Con 22 reservados sobre 26 dibujados, una dirección podía apoyarse en el anillo de afuera y quedar tapada por él.

Marco —título, leyenda, dirección— no sigue esa cuenta: son cinco cadenas cortas que no compiten con nada, así que crecen con la imagen y no con el dibujo. La letra se calibra contra una salida de 1100 px de ancho y el aire que la rodea contra una de 1600, porque cada unidad de margen se la saca al dibujo, que es lo apretado. La banda del título mide sus dos renglones más un respiro fijo, por el mismo motivo. En un 4K eso deja el título en 84 px, la leyenda en 45 y la dirección del visor en 42, junto a nombres de equipo de 21 y direcciones de 16.

De ahí el criterio: medida donde el texto de los equipos quedaría bajo 11 px no se ofrece, y no se ofrece a secas, sin explicación al lado. Con 2000 unidades eso deja afuera 1280×720 y deja entrar todo lo demás. Cada formato pide lo suyo: píxeles para PNG y JPG, hoja —A4, Carta, A3 o ajustar al diagrama— para PDF, nada para SVG, que sale siempre al tamaño natural. El PDF se rasteriza a 300 puntos por pulgada, definición de imprenta, que aguanta ampliar al 300 % en pantalla antes de que se note el píxel; hoja donde el texto impreso quedaría bajo 4,5 pt tampoco se ofrece.

Toda exportación lleva dirección del visor abajo a la derecha.

Sobre la vista previa hay una lupa que sigue al puntero y dibuja ese pedazo a la escala real del archivo, no un aumento de la miniatura: es la única forma de saber antes de bajar si los nombres y las direcciones se van a leer. Sale barata porque reaprovecha el reparto ya calculado y sólo vuelve a pintar, con lo que quede fuera del recuadro descartado por el propio lienzo: alrededor de milisegundo y medio por movimiento. Va apaisada y no redonda, que lo que se mira son dos renglones de texto. No aparece con pantalla táctil, donde no hay puntero al que seguir, ni cuando taparía media vista previa.

El diálogo muestra la salida al costado y se lleva el ancho que sobre, hasta 88 rem; por debajo de 50 rem la vista pasa abajo de los campos y por debajo de 34 rem el diálogo se angosta a lo de un teléfono. Los botones quedan pegados al pie, que si no en una pantalla corta el de exportar se va debajo del borde. La vista se dibuja con el mismo plan en un lienzo chico: mismo reparto, mismas etiquetas, mismo encuadre, sólo que con menos píxeles debajo. Cuesta unos quince milisegundos, así que se rehace con cada cambio. Dos resoluciones del mismo formato dan la misma imagen —el reparto no depende de los píxeles, sólo la definición—, y por eso el pie dice la medida real y cuántas etiquetas quedaron afuera, que es lo que sí cambia. Con fondo transparente va sobre un damero, para que se vea por lo que es.

El diálogo también pregunta idioma y tema, y viene con los que el usuario tiene puestos. Sirve para sacar un diagrama claro en inglés desde un visor oscuro en español sin tocar nada de la pantalla: se toma prestado el idioma mientras se dibuja y se lee la paleta del otro tema poniéndole el atributo al elemento raíz un instante, entre medio no hay repintado. El aviso del estado sigue en el idioma del visor, que es de quien mira, no del archivo.

Idioma alcanza también al CSV, que lleva encabezados traducidos. Al pcap no, que es sólo bytes; al tema tampoco, que no dibuja nada.

Tamaño natural sale del contenido, no de medida elegida de antemano: se mide cada etiqueta con tipografía real, se busca escala mínima donde ningún par de dispositivos se pisa —dos vecinos alcanza con separarse en un eje— y sobre esa área se suman márgenes de título, leyenda y etiquetas. Si aun así quedara superposición, dirección IP no se dibuja: dos textos encimados no se leen ninguno. Cada etiqueta lleva además contorno del color del fondo por debajo del relleno, el mismo de la pantalla, para que un cable que le pase por detrás no la borre.

Leyenda se arma en columnas de ancho uniforme, alineadas entre sí, y pasa a varias filas si no entran a lo ancho.

PDF se escribe a mano: una página con diagrama como imagen RGB comprimida con `FlateDecode`, sin pérdida. Documento tan chico no justifica sumar biblioteca de PDF entera.

## Tema claro y oscuro

Colores en variables CSS y tema claro reescribe los mismos nombres, así diagrama en pantalla y exportaciones lo siguen sin enterarse. Cambiar tema lanza barrido de 880 ms: franja inclinada con líneas de barrido entra desde un costado frenando, queda quieta un instante tapando pantalla entera —ahí cambian colores, sin que se vea el corte— y sale por el otro acelerando. Cada tramo lleva su curva; una sola para todo haría notar frenado y arranque como tirón. Sobrante lateral se mide en `vmax` porque el sesgo corre los bordes tanto como la mitad del alto de la franja, y con porcentaje del ancho una pantalla alta y angosta dejaría vértices al descubierto.

Icono del botón espera a que la franja lo destape antes de transformarse: cambia justo cuando barrido tapa cabecera; sin esa espera, sol y luna se transformaban debajo. Icono se dibuja desde esas mismas variables —radio del disco, posición del mordisco, presencia de rayos—, así pasa de luna a sol animándose por el mismo camino que los colores, sin una sola regla que sepa qué tema está puesto. Oscuro por defecto; el botón de la cabecera fija el otro y lo recuerda. Un guion en la cabecera aplica tema e idioma guardados antes del primer pintado, así la página no arranca con lo predeterminado y salta al rato. Va con hash en la política de seguridad, no con `unsafe-inline`. Hilos del código T568B se oscurecen sobre fondo claro: naranja pálido que funciona contra grafito desaparecería contra papel.

## Dispositivos apartados

Packet Tracer deja arrastrar equipo a cualquier rincón del espacio de trabajo, y ahí queda guardado. Uno solo a 3900 unidades del resto multiplica por diez los límites del dibujo y aplasta red entera contra el centro. Por eso dispositivos sin ningún enlace que además caen fuera del rectángulo donde vive la red se dibujan aparte, en bandeja al pie del diagrama. Aparecen igual, sin deformar lo demás, y con motivo a la vista.

## El diagrama en pantalla

El visor reparte la red en un lienzo propio: el más chico donde todas las etiquetas tienen lugar limpio, entre 900 y 5200 unidades. Después el SVG lo lleva al tamaño del panel y el zoom se mueve por dentro de un dibujo ya resuelto, así que acercarse sólo agranda: no aparece ni desaparece nada, ni se corre de sitio. Una red de veinte equipos entra en 900 unidades y se lee entera de entrada; una de setenta pide 2436 y hay que acercarse, pero las setenta etiquetas están dibujadas desde el primer cuadro.

Es el mismo dibujo que la exportación, a menos píxeles: mismo reparto, mismos renglones, misma prueba de choque. Lo único que no se puede igualar es el presupuesto, un panel de 600 px contra una imagen de 3840.

Rueda acerca dejando quieto el punto bajo el cursor, no la esquina, así no hay que perseguir el diagrama arrastrando tras cada giro. El paso sale de cuánto giró la rueda y no de un salto fijo: un trackpad, que manda muchos avisos chicos, avanza de a poco, y un ratón de muescas da su paso entero. Nada de eso se anima: detrás hay un gesto continuo que ya marca el ritmo, y cualquier suavizado encima es la vista yendo atrás del dedo. Sólo se animan los botones de más y menos, que no tienen gesto detrás. Los avisos de rueda se juntan y se aplican una sola vez por cuadro: atenderlos de a uno dibuja varias veces por cuadro y, peor, obliga a recalcular la posición del SVG en cada uno. Con la matriz cacheada por cuadro, seis muescas seguidas cuestan 1,6 ms en total y se resuelven en un solo movimiento.

El pellizco entra por dos puertas: rueda con Control apretado, que es como lo mandan los trackpads, y los eventos de gesto propios de Safari, que además hay que atender para que el navegador no acerque la página entera en vez del diagrama. Factor de conversión entre píxeles de pantalla y unidades del dibujo sale de la matriz del SVG, no de su ancho: cuando proporciones no coinciden, dibujo queda apaisado dentro del elemento y ancho miente.

Las dos entradas de la leyenda son botones: tocar una deja encendidos sólo los cables de ese tipo y apaga el resto, y tocarla otra vez vuelve atrás. Es el lugar donde ya se está mirando cuando surge la pregunta. Elegir un dispositivo apaga el filtro y al revés, porque los dos resaltados dirían cosas distintas a la vez.

Clic en vacío del diagrama, o tecla `Escape`, deselecciona lo que haya, dispositivo o tipo de cable. Arrastrar para desplazarse no cuenta como clic: umbral de cinco píxeles.

Al elegir dispositivo, diagrama queda en tres niveles: elegido con aro y halo naranjas, nombre en negrita y subrayado en color de acento; los que cuelgan de él con halo punteado; resto apagado. Sin nivel del medio, el tocado se confunde con vecinos.

Cada etiqueta lleva contorno del color del fondo pintado debajo del relleno —`paint-order:
stroke`—, así se lee aunque le pase por encima un cable o el aro del nodo elegido. Nombre del elegido no va en color de acento justamente porque competiría con esos aros.

## La cabecera

Botón de cerrar y de exportar aparecen con archivo abierto. Lo decide la hoja de estilos desde un atributo en el cuerpo, no un puñado de llamadas repartidas por el código. Ese mismo atributo resalta en el acento cuál de los dos formatos, `.pkt` o `.pcap`, está abierto.

## Exportar una captura

De un `.pkt` sale diagrama; de captura, datos. Formatos: **CSV**, que abre en cualquier planilla con una fila por paquete, y **PCAP** clásico, que lleva bytes originales y lo lee toda herramienta, Wireshark incluido.

No hay exportación a imagen porque tabla de miles de filas no se lee en PNG. Tampoco a pcapng: añadiría bloques y descripciones de interfaz sin aportar nada, ya que visor trabaja con un tipo de enlace por paquete y pcap clásico lo expresa entero. Si captura mezclara tipos de enlace, sólo se escriben los que coinciden con el primero, y estado dice cuántos paquetes salieron.

CSV lleva marca de orden de bytes: sin ella Excel abre archivo en codificación del sistema y rompe acentos.

Al filtrar, tramos de texto que hicieron coincidir cada fila quedan resaltados en columnas por las que busca el filtro: origen, destino, protocolo y descripción.

En la tabla se eligen filas como en planilla: clic elige una, `Mayúsculas` toma tramo desde la última, `Control` o `Comando` suma o quita una. Con varias elegidas, panel muestra resumen del tramo —cuántos paquetes, cuántos bytes, qué duración, qué protocolos— y diálogo ofrece exportar sólo esa selección o captura entera.

## Descargar el original

Panel de resumen ofrece archivo tal cual se abrió. Sirve para el que abriste vos y para el que llegó por `?src=`, porque en ambos casos visor tiene los bytes.

## Abrir un archivo publicado

`?src=<dirección>` hace que visor descargue archivo de esa dirección y lo abra. Servidor de origen tiene que permitir CORS: `raw.githubusercontent.com` sí, descarga directa de Google Drive no. Sólo se aceptan direcciones `https`, salvo en el mismo origen que el visor.

Forma de publicar una red: dejás el `.pkt` en dirección accesible y compartís enlace con el parámetro. Quien lo abra ve topología y puede bajar archivo original.

Visor no empaqueta archivos dentro del enlace. Un `.pkt` ya viene comprimido por dentro, así codificado ocupa más de lo que aceptan navegadores y mensajería, y resultado sería enlace roto según por dónde se pegue. Para pasar el archivo a alguien, se le pasa el archivo.

## Marca e iconos

`logo.svg` es el original: trenza sobre fondo oscuro, 512×512, dibujo dentro de zona segura. De ahí salió el juego de iconos en la raíz —`favicon.ico`, `favicon.svg`, `favicon-96x96.png`, `apple-touch-icon.png` y los dos del manifiesto—, generado con [realfavicongenerator.net](https://realfavicongenerator.net). Para rehacerlo, subí de nuevo `logo.svg` y reemplazá los archivos.

Colores medidos: texto a 4.5:1 o más y trazos a 3:1 o más contra el fondo más desfavorable de cada tema.

## Navegadores

El piso lo ponen `DecompressionStream` y `CompressionStream`, que son lo que descomprime el `.pkt` y comprime la imagen del PDF sin sumar una biblioteca: **Safari 16.4, iOS 16.4, Chrome 80, Firefox 113**. Todo lo demás que usa el visor entra por debajo de ese piso —`dialog.showModal` y `:has()` piden Safari 15.4, `color-mix()` 16.2, `replaceChildren` 14—, así que no hay nada aparte que verificar.

En Apple hay dos cosas que no son estándar y sí hacen falta: los eventos de gesto de Safari para el pellizco, que además hay que atender para que el navegador no acerque la página entera en vez del diagrama, y evitar recortar con `border-radius` dentro de un elemento transformado, que ahí es terreno resbaladizo. El diagrama lleva `touch-action: none` para que arrastrar y pellizcar sean del dibujo y no de la página.

## Desarrollo

```bash
npm test
```

Sin dependencias ni paso de compilación. Para probar local, alcanza con servir la carpeta con cualquier servidor estático; navegador necesita módulos por HTTP, no funciona abriendo `index.html` desde disco.

Descompresión usa `DecompressionStream`, disponible en Chrome 80, Firefox 113 y Safari 16.4 en adelante.

## Despliegue en Cloudflare Pages

Sin comando de compilación, raíz del repositorio como directorio de salida. `_headers` define política de seguridad de contenido: permite fuentes de Google, bloquea todo lo demás.

## Estado

Validado contra archivos reales de Packet Tracer 7.3, archivos de formato heredado, y capturas pcap y pcapng generadas para pruebas, incluidos casos de archivo dañado, vacío, sin topología, de un solo dispositivo y con dispositivos superpuestos.

Sin verificar todavía: archivos de serie 8.x, pcapng con varias interfaces y enlaces distintos de Ethernet.