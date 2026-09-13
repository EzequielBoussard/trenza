# Trenza

Un visor de sólo lectura para archivos `.pkt` y `.pka` de Cisco Packet Tracer y para capturas `.pcap` y `.pcapng`. Todo se procesa en el navegador: el archivo nunca sale hacia un servidor.

## Qué muestra

De Packet Tracer: la topología lógica con las posiciones originales, el inventario de equipos, las interfaces con sus direcciones, las VLAN, las rutas estáticas, los protocolos de enrutamiento, las listas de acceso, y el `running-config` de cada dispositivo que lo tenga.

Todo eso sale de leer la configuración, que es texto de Cisco IOS y vive en `src/pkt/config.js`, aparte del resto: así se prueba sin navegador y `model.js` se queda con una sola tarea, traducir el árbol del archivo. De las rutas sólo están las escritas a mano; las que aprende un protocolo no viven en la configuración.

De los protocolos —RIP, OSPF, EIGRP— se lee qué redes anuncia cada uno y qué interfaces quedaron pasivas. Las redes se muestran tal como están escritas, `10.0.0.0 0.0.0.255 area 0`, en vez de despiezarlas: cada protocolo le da su propia forma a esa línea y volver a armarla no agrega nada que el original no diga. Un bloque vacío igual aparece, porque «este equipo tiene RIP activado y no anuncia nada» es justamente lo que hay que ver; es además lo que escribe Packet Tracer cuando alguien entra a `router rip` y sale sin más, y pasa en tres de los archivos de prueba.

De las listas de acceso se leen las reglas en orden y dónde está aplicada cada una, que son las dos mitades del dato: en una lista de acceso el orden es la regla, porque se evalúa de arriba abajo y la primera que coincide decide; y una lista escrita y no aplicada no filtra nada. Al revés también: una interfaz con `ip access-group` de una lista que no existe deja pasar todo, así que esa lista aparece igual, vacía y con su interfaz al lado. Las numeradas van en una línea cada una y las nombradas abren un bloque; las dos terminan en la misma tabla.

Las VLAN hay que cruzarlas de dos lados del archivo, porque cada lado guarda la mitad. El árbol XML del dispositivo trae la base con el número y el nombre, y es la única fuente cuando el switch se configuró desde la interfaz de Packet Tracer, que no escribe nada de esto en la configuración; la configuración, a su vez, dice qué puerto pertenece a cuál, que el XML no guarda. Un tronco declarado sin lista de permitidas las lleva todas, que es lo que hace Cisco por omisión. Y las que Packet Tracer crea solo en cada switch —la 1 y las 1002 a 1005— no se listan salvo que algún puerto las nombre, porque aparecen siempre y serían una fila de ruido por dispositivo.

Se agrupan por VLAN y no por puerto porque la pregunta es «qué VLAN hay y por dónde pasa», y un switch de veinticuatro bocas contestada al revés son veinticuatro renglones para leer de a uno. Nada de esto aparece cuando no hay: la red del showcase es plana y no muestra ninguna de las dos secciones.

En un router en un palo la VLAN no pasa por un puerto de acceso sino por una subinterfaz con `encapsulation dot1Q`, que es su puerta de enlace. Esas van en su propia columna, y la columna sólo existe cuando hay alguna: en un switch sería una columna de guiones.

De una captura: la lista de paquetes con tiempo relativo, direcciones y protocolo, el desglose por capas y el volcado hexadecimal.

El tipo de enlace no lo dice el paquete sino la captura, y de él depende dónde empieza todo lo demás: leer un «Linux cooked» como si fuera Ethernet corre las direcciones dos bytes y el desglose sale entero pero mal. Se leen Ethernet con sus VLAN apiladas, IP en crudo, el bucle local de BSD y macOS, PPP, Cisco HDLC —que es lo que sale de un enlace serie entre routers— y las dos formas del encabezado que pone Linux al capturar de todas las interfaces a la vez. El del bucle local se resuelve por el nibble de versión del paquete que sigue y no por la familia de direcciones, que vale distinto según el sistema y viene en el orden de bytes del equipo que capturó. El que no se conoce se nombra por su número en vez de quedar en blanco, y el resumen del archivo dice siempre de qué enlace salió.

## El formato de los archivos de Packet Tracer

Un `.pkt` no es un contenedor estándar. Desde la versión 6.2 la tubería es ésta, en el orden inverso al que aplica Packet Tracer:

1. **Ofuscación exterior.** El archivo se lee al revés y cada byte se enmascara con un valor derivado de su posición y del largo total.
2. **Descifrado.** Twofish en modo EAX, con clave y nonce fijos e iguales para todas las instalaciones: dieciséis bytes `0x89` y dieciséis bytes `0x10`.
3. **Ofuscación interior.** Otra máscara dependiente de la posición, esta vez sobre el texto plano.
4. **Descompresión.** zlib, con el tamaño descomprimido en los primeros cuatro bytes.

El resultado es el XML interno de Packet Tracer. Los archivos anteriores a 6.2 sólo tienen los pasos 3 y 4, así que el visor prueba primero la variante moderna y cae en la heredada si falla.

La tubería está documentada por ingeniería inversa pública, sobre todo en [`pka2xml`](https://github.com/mircodz/pka2xml) y [`ptexplorer`](https://github.com/axcheron/ptexplorer). El proyecto no distribuye software, iconografía ni contenido de Cisco, y no reimplementa el simulador: sólo lee.

## Idiomas

La interfaz está en inglés y en español. El selector vive en la cabecera y la elección queda guardada en el navegador. Cambiar de idioma redibuja lo que esté abierto, incluidos los nombres de los campos de los paquetes, sin perder la selección.

Los textos están en `src/i18n.js`, un diccionario por idioma. Agregar uno es copiar el bloque y traducir las claves.

## De dónde salen las posiciones

Del archivo. Cada dispositivo trae su X y su Y en `WORKSPACE/LOGICAL`, que son las que Packet Tracer guardó cuando alguien lo arrastró hasta ahí. El visor no reordena nada: sólo lleva ese rectángulo al que tenga a mano, con un estiramiento acotado para cuando las proporciones no coinciden.

Eso fija el techo de todo lo demás. Separar dos equipos que el archivo puso juntos es agrandar el dibujo entero, y agrandar el dibujo entero es achicar la letra respecto del marco. Son la misma perilla, no dos.

## El tamaño de los nombres y las direcciones

Todo el dibujo se define en unidades de diseño y después se multiplica por una escala hasta llegar al panel o a la imagen. El cuerpo que se ve, entonces, es el cuerpo de diseño por esa escala, y la escala es el ancho de salida dividido por el ancho del lienzo. A menos unidades de lienzo, más grande sale todo.

Y el ancho del lienzo no se elige: es el más chico donde ninguna etiqueta se roza con otra. De modo que la pregunta «¿por qué la letra es de este tamaño?» es en realidad «¿cuánto hay que separar los equipos?».

La respuesta es la dirección IP. En la red del showcase el nombre típico ocupa 49 unidades y la dirección, 68: catorce caracteres son más anchos que un `PC13` por mucho que el cuerpo sea la mitad. Como la caja que se reserva es la más ancha de las dos, la dirección decide el reparto en 60 de los 71 equipos, y de ahí salen tres consecuencias que no son obvias:

- **El cuerpo de la dirección no cambia cómo se la ve.** Subirlo ensancha las cajas, obliga a un lienzo más ancho en la misma proporción, y la escala baja lo mismo que subió el cuerpo. Medido: con cuerpo 10 hacen falta 2743 unidades y con cuerpo 9, 2436; en pantalla la dirección queda en 2,92 px y en 2,96 px. Prácticamente idéntica.
- **El ancho de la dirección sí.** Lo que hay que atacar no es su cuerpo sino cuánto ocupa. Una dirección en monoespaciada de 9 mide 70 unidades; en condensada de 11, 68. Dos puntos más de cuerpo en menos lugar. Alinear dígitos, que es para lo que sirve la monoespaciada, no aporta nada en una etiqueta suelta centrada bajo un icono; en la tabla de paquetes, donde sí hay columnas, se sigue usando.
- **El cuerpo del nombre es gratis.** Como el nombre no fija el reparto, subirlo no obliga a separar nada. Entre 17 y 24 el lienzo no se mueve ni una unidad, y de ahí en más es sólo una cuestión de proporción contra el icono.

Por eso el nombre va en 20 y la dirección en 11, las dos en condensada. No es una decisión tipográfica sino la consecuencia de cuál de los dos textos paga el ancho. Los cuatro valores —los dos cuerpos y las dos líneas de base— viven juntos en `LABEL_TYPE`, en `src/view/graph.js`, junto a las dos familias completas, y los comparten el visor y la exportación: lo que se mide para repartir tiene que ser lo que después se dibuja.

El lienzo toma además la proporción del panel donde va a entrar. Con una proporción fija, un lienzo apaisado dentro de un panel casi cuadrado entraba por el ancho y dejaba 312 px de los 812 en blanco, y el dibujo se achicaba para caber en la parte que sí usaba. Si el panel cambia de forma el reparto se rehace, pero sólo mientras la vista esté sin tocar: rehacerlo debajo de alguien que estaba mirando algo de cerca molesta más que la franja que evita.

El ancho se busca de menos a más, de a cincuenta unidades, y gana el primero que quede prolijo, que por ser el primero es también el más chico. El paso tiene que ser fino porque los huecos donde el reparto queda limpio son angostos y no vienen en orden: con escalones de trescientas unidades, en un panel de 960 × 810 la búsqueda pasaba de 2400 —que ya estaba limpio— a 3664, y eso son 42 % de cuerpo de letra tirado. Sale barato porque cada intento cuesta cuatro décimas de milisegundo: recorrer el rango entero son 33 ms en el peor caso, y un dibujado completo, entre 13 y 22.

Todo junto, sobre un panel de 1272 × 834, el nombre pasó de 5,42 px a 9,27 px y la dirección de 4,17 px a 5,10 px, sin franjas vacías.

Lo que ninguna de las dos arregla es que una red de setenta equipos, vista entera en un panel de ochocientos píxeles, tiene unos 3 px de dirección. Eso es geometría: setenta cajas de 63 unidades no entran en menos lienzo del que entran. Para leer las direcciones hay que acercarse, y por eso todas las etiquetas están dibujadas desde el primer cuadro, para que acercarse sólo agrande y no haga aparecer nada.

## Exportar el diagrama

El botón **Exportar diagrama** dibuja la red entera en un lienzo aparte, con el encuadre calculado desde los límites reales de la topología. No captura la pantalla: el zoom y el desplazamiento actuales no afectan el resultado y no se recorta nada.

Los formatos son PNG, JPG, SVG y PDF de una página. PNG y SVG admiten fondo transparente. El nombre propuesto es el del archivo abierto sin extensión, editable antes de exportar.

El diagrama tiene un tamaño natural: aquel donde ninguna etiqueta pisa a otra. El SVG sale siempre de ese tamaño y, por ser vectorial, se agranda después sin perder nitidez. Las resoluciones en píxeles toman el mismo dibujo y lo reparten en la medida pedida.

Con una medida fija, lo único que se elige es en cuántas unidades de diseño se reparte el dibujo. Arrancan en 2200 y son las mismas venga la salida de 1080 o de 4K, así que subir la resolución agranda nombres, direcciones e iconos en vez de sumar píxeles al mismo dibujo diminuto. Si con ese ancho alguna etiqueta se queda sin lugar, el diseño se ensancha hasta que entren todas, con tope en el ancho natural: una dirección a medias no sirve para nada, y el precio es cuerpo de letra, no información.

En la red del showcase el diseño queda en 2686 unidades, que en 4K son nombres de 29 px y direcciones de 16 px, y en 2560 × 1440, de 19 y de 10.

Y como el marco casi nunca tiene la proporción de la red, ésta se estira hasta 1,75 veces en un eje antes que dejar franjas vacías: es un esquema, no un plano. En un 4K los cuatro márgenes quedan en unos 100 px sobre 3840.

El nombre y la dirección son una sola pieza. Se dibujan juntos y, si el lugar está ocupado, bajan juntos al renglón siguiente: separarlos dejaba la dirección flotando lejos de su nombre, sin que se supiera de quién era. Lo que no encuentra ningún renglón libre se dibuja igual, rozando a otra etiqueta, porque una etiqueta que aparece y desaparece al acercarse molesta más que dos que se tocan. Nunca se deja de dibujar una dirección.

Pero un bloque corrido rompe la alineación, y en una fila de equipos iguales con uno más abajo eso canta. Así que el ancho no se busca hasta que las etiquetas entren, sino hasta que **todas queden en el mismo renglón**: la medida de lo prolijo cuenta las que se rozan y las que bajaron, y el diseño crece hasta llevarla a cero. Más ancho no siempre es más prolijo —al estirarse cambia también la separación vertical—, así que se prueban varios y gana el primero que llega a cero.

El disco reservado mide lo mismo que el dibujado, 26, y se mide como el círculo que es: una caja que sólo alcanza la esquina de su cuadrado no lo toca de verdad, y descartarla por eso cuesta once píxeles en diagonal. Con 22 reservados sobre 26 dibujados, una dirección podía apoyarse en el anillo de afuera y quedar tapada por él.

El marco —título, leyenda y dirección del sitio— no sigue esa cuenta: son cinco cadenas cortas que no compiten con nada, así que crecen con la imagen y no con el dibujo. La letra se calibra contra una salida de 1100 px de ancho y el aire que la rodea contra una de 1600, porque cada unidad de margen se la saca al dibujo, que es lo que de verdad está apretado. La banda del título mide sus dos renglones más un respiro fijo, por el mismo motivo. En un 4K eso deja el título en 84 px, la leyenda en 45 y la dirección del sitio en 42.

De ahí el criterio para el menú de medidas: la que dejaría el texto por debajo del piso legible no se ofrece, y no se ofrece a secas, sin explicación al lado. El piso se mide sobre la dirección, que es el texto más chico del dibujo y el que trae el dato; ponerlo sobre el nombre, que es casi el doble, dejaba pasar salidas con direcciones ilegibles. Son 7 px en pantalla, lo que en la red del showcase deja afuera 1280 × 720, donde la dirección caería a 5,2 px. Cada formato pide lo suyo: píxeles para PNG y JPG, hoja —A4, Carta, A3 o ajustar al diagrama— para PDF, y nada para SVG, que sale siempre al tamaño natural. El PDF se rasteriza a 300 puntos por pulgada, que es definición de imprenta y aguanta ampliar al 300 % en pantalla antes de que se note el píxel; en papel el piso es de 2,5 pt, bastante menor que en pantalla porque esos 300 puntos resuelven trazos que un monitor no.

Toda exportación lleva la dirección del visor abajo a la derecha.

Sobre la vista previa hay una lupa que sigue al puntero y dibuja ese pedazo a la escala real del archivo, no un aumento de la miniatura: es la única forma de saber, antes de bajar nada, si los nombres y las direcciones se van a leer. Sale barata porque reaprovecha el reparto ya calculado y sólo vuelve a pintar, con lo que quede fuera del recuadro descartado por el propio lienzo: alrededor de milisegundo y medio por movimiento. Va apaisada y no redonda, porque lo que se mira son dos renglones de texto. No aparece con pantalla táctil, donde no hay puntero al que seguir, ni cuando taparía media vista previa.

El diálogo muestra la salida al costado y se lleva el ancho que sobre, hasta 88 rem; por debajo de 50 rem la vista pasa abajo de los campos, y por debajo de 34 rem el diálogo se angosta a lo de un teléfono. Los botones quedan pegados al pie, porque si no, en una pantalla corta el de exportar se va debajo del borde. La vista se dibuja con el mismo plan en un lienzo chico: mismo reparto, mismas etiquetas, mismo encuadre, sólo que con menos píxeles debajo. Cuesta unos quince milisegundos, así que se rehace con cada cambio. Dos resoluciones del mismo formato dan la misma imagen —el reparto no depende de los píxeles, sólo la definición—, y por eso el pie dice la medida real, que es lo que sí cambia. Con fondo transparente va sobre un damero, para que se vea por lo que es.

El diálogo también pregunta el idioma y el tema, y viene con los que el usuario tiene puestos. Sirve para sacar un diagrama claro en inglés desde un visor oscuro en español sin tocar nada de la pantalla: se toma prestado el idioma mientras se dibuja, y la paleta del otro tema se lee poniéndole el atributo al elemento raíz un instante, sin que entre medio haya un repintado. El aviso de estado sigue en el idioma del visor, que es el de quien mira, no el del archivo.

El idioma alcanza también al CSV, que lleva los encabezados traducidos. Al pcap no, que es sólo bytes, y al tema tampoco, que no dibuja nada.

El tamaño natural sale del contenido y no de una medida elegida de antemano: se mide cada etiqueta con la tipografía real, se busca la escala mínima donde ningún par de dispositivos se pisa —a dos vecinos les alcanza con separarse en un eje— y sobre esa área se suman los márgenes del título, la leyenda y las etiquetas. Cada etiqueta lleva además un contorno del color del fondo por debajo del relleno, el mismo que en pantalla, para que un cable que le pase por detrás no la borre.

La leyenda se arma en columnas de ancho uniforme, alineadas entre sí, y pasa a varias filas si no entran a lo ancho.

El PDF se escribe a mano: una página con el diagrama como imagen RGB comprimida con `FlateDecode`, sin pérdida. Un documento tan chico no justifica sumar una biblioteca de PDF entera.

El lienzo tiene un techo de dieciséis millones y pico de píxeles, que es lo que entrega Safari en iPhone antes de devolver uno en blanco sin avisar. Un A3 a 300 puntos por pulgada son 17,4 millones, así que baja a 294, que es una diferencia que no se ve. La hoja no cambia de medida: el PDF la calcula desde los píxeles que salieron, no al revés.

## Tema claro y oscuro

Los colores viven en variables CSS y el tema claro reescribe los mismos nombres, así que el diagrama en pantalla y las exportaciones lo siguen sin enterarse. Cambiar de tema lanza un barrido de 880 ms: una franja inclinada con líneas de barrido entra desde un costado frenando, queda quieta un instante tapando la pantalla entera —ahí cambian los colores, sin que se vea el corte— y sale por el otro acelerando. Cada tramo lleva su curva; una sola para todo haría notar el frenado y el arranque como un tirón. El sobrante lateral se mide en `vmax` porque el sesgo corre los bordes tanto como la mitad del alto de la franja, y con un porcentaje del ancho una pantalla alta y angosta dejaría los vértices al descubierto.

El icono del botón espera a que la franja lo destape antes de transformarse: cambia justo cuando el barrido tapa la cabecera, y sin esa espera el sol y la luna se transformaban a la vista. El icono se dibuja desde esas mismas variables —el radio del disco, la posición del mordisco, la presencia de los rayos—, así que pasa de luna a sol animándose por el mismo camino que los colores, sin una sola regla que sepa qué tema está puesto. El oscuro es el de por omisión; el botón de la cabecera fija el otro y lo recuerda. Un guion en la cabecera aplica el tema y el idioma guardados antes del primer pintado, para que la página no arranque con lo predeterminado y salte al rato; va con hash en la política de seguridad, no con `unsafe-inline`. Los hilos del código T568B se oscurecen sobre fondo claro: un naranja pálido que funciona contra grafito desaparecería contra papel.

## Dispositivos apartados

Packet Tracer deja arrastrar un equipo a cualquier rincón del espacio de trabajo, y ahí queda guardado. Uno solo a 3900 unidades del resto multiplica por diez los límites del dibujo y aplasta la red entera contra el centro. Por eso los dispositivos sin ningún enlace que además caen fuera del rectángulo donde vive la red se dibujan aparte, en una bandeja al pie del diagrama. Aparecen igual, sin deformar lo demás, y con el motivo a la vista.

## El diagrama en pantalla

El visor reparte la red en un lienzo propio: el más chico donde todas las etiquetas tienen lugar limpio, entre 900 y 5200 unidades, con la proporción del panel. Después el SVG lo lleva al tamaño del panel y el zoom se mueve por dentro de un dibujo ya resuelto, así que acercarse sólo agranda: no aparece ni desaparece nada, ni se corre de sitio. La red del showcase pide unas 2700 unidades y hay que acercarse para leer las direcciones, pero las setenta y una etiquetas están dibujadas desde el primer cuadro.

Es el mismo dibujo que la exportación, a menos píxeles: mismo reparto, mismos renglones, misma prueba de choque, los mismos cuerpos de letra. Lo único que no se puede igualar es el presupuesto, un panel de 800 px contra una imagen de 3840.

Y los mismos márgenes, que hasta hace poco no. Abajo hay que reservar lo que el bloque de nombre y dirección alcanza cuando le toca el último renglón, y a los costados, la mitad de la etiqueta más ancha, medida y no supuesta. El visor tenía dos números fijos —noventa abajo, ciento veinte al costado— mientras la exportación reservaba lo que hacía falta, y con eso la dirección de los equipos de la fila de abajo se dibujaba fuera del lienzo: el SVG la recortaba, cinco píxeles en un panel de 768 × 349. Ahora los dos reservan lo mismo porque lo sacan del mismo lugar.

La prueba de choque de las etiquetas recorre los equipos de arriba abajo y compara cada uno sólo contra los que tiene cerca en vertical, no contra todos. Dos equipos separados por más de lo que alcanza un bloque más el radio del disco no pueden tocarse pase lo que pase, y ése es el corte. Importa porque la búsqueda del ancho repite esa prueba una vez por candidato, unas treinta veces: en una red de trescientos equipos la pasada bajó de 0,585 ms a 0,207. Lo que cada etiqueta mide, que no depende de dónde caiga, se calcula una sola vez por dispositivo en vez de una vez por candidato.

La rueda acerca dejando quieto el punto que está bajo el cursor, no la esquina, así que no hay que perseguir el diagrama arrastrando después de cada giro. El paso sale de cuánto giró la rueda y no de un salto fijo: un trackpad, que manda muchos avisos chicos, avanza de a poco, y un ratón de muescas da su paso entero. Nada de eso se anima: detrás hay un gesto continuo que ya marca el ritmo, y cualquier suavizado encima es la vista yendo atrás del dedo. Sólo se animan los botones de más y menos, que no tienen gesto detrás. Los avisos de rueda se juntan y se aplican una sola vez por cuadro: atenderlos de a uno dibuja varias veces por cuadro y, peor, obliga a recalcular la posición del SVG en cada uno. Con la matriz calculada una vez por cuadro, seis muescas seguidas cuestan 1,6 ms en total y se resuelven en un solo movimiento.

El pellizco entra por dos puertas: la rueda con Control apretado, que es como lo mandan los trackpads, y los eventos de gesto propios de Safari, que además hay que atender para que el navegador no acerque la página entera en vez del diagrama. El factor de conversión entre píxeles de pantalla y unidades del dibujo sale de la matriz del SVG y no de su ancho: cuando las proporciones no coinciden, el dibujo queda apaisado dentro del elemento y el ancho miente.

Las dos entradas de la leyenda son botones: tocar una deja encendidos sólo los cables de ese tipo y apaga el resto, y tocarla otra vez vuelve atrás. Es el lugar donde ya se está mirando cuando surge la pregunta. Elegir un dispositivo apaga el filtro, y al revés, porque los dos resaltados dirían cosas distintas a la vez.

Un clic en el vacío del diagrama, o la tecla `Escape`, deselecciona lo que haya, sea un dispositivo o un tipo de cable. Arrastrar para desplazarse no cuenta como clic: el umbral es de cinco píxeles.

La leyenda va debajo del diagrama y no flotando sobre el rincón de abajo a la izquierda. Flotando tapaba equipos, y no sólo en un teléfono: el reparto usa el lienzo entero porque nada le dice que un rincón esté ocupado, así que basta una red rala —cinco equipos repartidos hasta los bordes— y un panel ancho y bajo para que uno quede debajo. Medido, pasaba entre 700 y 800 px de ancho y no pasaba ni a 640 ni a 900, que es lo que tiene depender de dónde cayó cada equipo: ningún punto de corte por ancho lo arregla. Reservarle el hueco en el reparto sería lienzo perdido en todas las pantallas; como franja al pie cuesta unos treinta píxeles de alto y no hay ancho en el que tape nada. Sin enlaces no hay leyenda, que una franja vacía no dice nada.

Los símbolos de cada dispositivo son propios y no los de Cisco, que es el juego que la industria da por estándar pero que el proyecto no distribuye. Siguen su convención igual donde ésta dice algo: el router lleva las cuatro flechas de «elige por dónde sale» y el switch, dos opuestas de «cruza tráfico entre bocas». Sin flechas, dos rieles con topes se leen como el control de un ecualizador, que es de lo más común en cualquier interfaz. El resto son símbolos que se entienden fuera de las redes también —el arco del wifi, el monitor, la nube, las unidades apiladas del servidor, el chip, el bastidor—, y ahí gana el que reconoce cualquiera. La seguridad va con un escudo y no con el muro de ladrillos del cortafuegos de Cisco, porque a diez píxeles el muro se vuelve una mancha y el escudo conserva su silueta; ese tamaño es el que manda, porque es el que se ve con la red entera en pantalla.

Al elegir un dispositivo, el diagrama queda en tres niveles: el elegido con aro y halo naranjas y el nombre en negrita y subrayado en el color de acento, los que cuelgan de él con halo punteado, y el resto apagado. Sin el nivel del medio, el que tocaste se confunde con sus vecinos.

El aro crece en su lugar, y eso hubo que pedirlo: en SVG el origen de una transformación se resuelve por omisión contra el lienzo entero y no contra el elemento, así que `transform-origin: center` era el medio del diagrama. El aro de un equipo del borde estaba a ciento veintisiete píxeles de su nodo —invisible, porque hasta que se lo elige va en opacidad cero— y al elegirlo entraba volando desde ahí en vez de crecer donde estaba. Lo mismo el disco al aparecer. `transform-box: fill-box` hace que `center` sea el centro del propio círculo.

Cada etiqueta lleva un contorno del color del fondo pintado debajo del relleno —`paint-order: stroke`—, así se lee aunque le pase por encima un cable o el aro del nodo elegido. El nombre del elegido no va en el color de acento justamente porque competiría con esos aros.

## La cabecera

Los botones de cerrar y de exportar aparecen con un archivo abierto. Lo decide la hoja de estilos desde un atributo en el cuerpo, no un puñado de llamadas repartidas por el código. Ese mismo atributo resalta en el acento cuál de los dos formatos, `.pkt` o `.pcap`, está abierto.

## Exportar una captura

De un `.pkt` sale un diagrama; de una captura, datos. Los formatos son **CSV**, que abre en cualquier planilla con una fila por paquete, y **PCAP** clásico, que lleva los bytes originales y lo lee cualquier herramienta, Wireshark incluido.

No hay exportación a imagen porque una tabla de miles de filas no se lee en un PNG. Tampoco a pcapng: añadiría bloques y descripciones de interfaz sin aportar nada, ya que el visor trabaja con un tipo de enlace por paquete y el pcap clásico lo expresa entero. Si una captura mezclara tipos de enlace, sólo se escriben los que coinciden con el primero, y el estado dice cuántos paquetes salieron.

El CSV lleva marca de orden de bytes: sin ella Excel abre el archivo en la codificación del sistema y rompe los acentos.

Al filtrar, los tramos de texto que hicieron coincidir cada fila quedan resaltados en las columnas por las que busca el filtro: origen, destino, protocolo y descripción. Cada columna se mira por separado y no todas pegadas en una sola cadena: pegadas, buscar `icmp 192` coincidía en la juntura entre el protocolo y el origen y la fila salía sin una sola marca encima, sin que se pudiera ver por qué estaba ahí. Si una fila aparece, algo tiene resaltado.

Cualquier columna ordena, y un clic recorre tres estados: de menor a mayor, al revés, y de vuelta al orden de la captura. El tercero hace falta porque ordenar por cualquier cosa pierde la secuencia, que en una captura es la mitad de la información. Las direcciones se comparan con orden numérico, así que `192.168.1.10` va después de `192.168.1.2` y no antes, que es lo que da compararlas letra a letra. El encabezado es un botón de verdad, no un `th` con un `click` encima: se llega con el tabulador y el lector de pantalla anuncia por dónde está ordenada. Ordenar no pierde la selección; filtrar sí la limpia, porque una selección con filas escondidas adentro haría que el diálogo ofreciera exportar paquetes que no están a la vista.

De cada paquete se lee de entrada lo que la tabla necesita —origen, destino, protocolo, tamaño y una línea de resumen—, pero los campos de cada capa se arman recién cuando alguien los pide, porque sólo se ven los del paquete elegido. Armándolos de entrada, una captura de cien mil paquetes construía 1,17 millones de pares de etiqueta y valor traducidos que nadie iba a leer. Por el mismo motivo las direcciones MAC se formatean sólo cuando hacen de origen y destino, que es cuando no hay capa de red encima: seis bytes a hexadecimal cuestan treinta veces más que leer una IP, y en tráfico IP se descartaban las dos.

Lo que quedaba caro era el resumen, y por tres motivos que se miden aparte. El primero, una traducción por paquete tirada a la basura: el resumen de la capa de red se armaba siempre y en TCP, UDP e ICMP —que son casi todo el tráfico— lo pisaba el de la capa de arriba. El segundo, la interpolación en sí: `t()` pasaba una expresión regular con función de reemplazo sobre el mismo texto cien mil veces, así que ahora cada plantilla se parte una sola vez en literales y nombres y después es una concatenación. El tercero, las asignaciones que no se veían: una `DataView` por paquete para leer seis números de dos bytes que están ahí al lado, y las banderas de TCP filtradas y unidas una vez por paquete cuando hay 256 combinaciones posibles y en una captura se ven cuatro.

Desglosar cien mil paquetes pasó de 201 ms a 81, y abrir el archivo entero, de 291 a 131.

Filtrar también se paga por tecla. Los cuatro campos por los que busca el filtro se pasan a minúscula una sola vez, la primera vez que alguien escribe, y quedan guardados; y cuando el texto nuevo contiene al anterior no puede reaparecer ninguna fila que ya estaba escondida —si una cadena contiene `icmp`, contiene `icm`—, así que se filtra el resultado anterior en vez de la captura entera. Escribir `icmp` en cien mil paquetes pasó de cuatro pulsaciones de 30 a 40 ms a una de 60, que arma el índice, y tres de 8 a 14.

Una captura cortada a la mitad no es un error: los paquetes enteros que trae valen y se muestran. Pero se avisa, porque si el corte llegó antes del primer paquete la pantalla decía «0 paquetes» y parecía que el visor no supo leer el archivo. El estado dice cuántos bytes quedaron sin leer y el resumen lo repite, que es donde alguien va a mirar cuando la cuenta le parezca corta.

En la tabla se eligen filas como en una planilla: un clic elige una, `Mayúsculas` toma el tramo desde la última, y `Control` o `Comando` suma o quita una. Con varias elegidas, el panel muestra el resumen del tramo —cuántos paquetes, cuántos bytes, qué duración, qué protocolos— y el diálogo ofrece exportar sólo esa selección o la captura entera.

## Descargar el original

El panel de resumen ofrece el archivo tal cual se abrió. Sirve para el que abriste vos y para el que llegó por `?src=`, porque en los dos casos el visor tiene los bytes.

## Abrir un archivo publicado

`?src=<dirección>` hace que el visor descargue el archivo de esa dirección y lo abra. El servidor de origen tiene que permitir CORS: `raw.githubusercontent.com` sí, la descarga directa de Google Drive no. Sólo se aceptan direcciones `https`, salvo en el mismo origen que el visor.

Para publicar una red, dejás el `.pkt` en una dirección accesible y compartís el enlace con el parámetro. Quien lo abra ve la topología y puede bajar el archivo original.

El visor no empaqueta archivos dentro del enlace. Un `.pkt` ya viene comprimido por dentro, así que codificado ocupa más de lo que aceptan los navegadores y la mensajería, y el resultado sería un enlace roto según por dónde se pegue. Para pasarle el archivo a alguien, se le pasa el archivo.

## Marca e iconos

`logo.svg` es el original: una trenza sobre fondo oscuro, de 512 × 512, con el dibujo dentro de la zona segura. De ahí salió el juego de iconos de la raíz —`favicon.ico`, `favicon.svg`, `favicon-96x96.png`, `apple-touch-icon.png` y los dos del manifiesto—, generado con [realfavicongenerator.net](https://realfavicongenerator.net). Para rehacerlo, subí de nuevo `logo.svg` y reemplazá los archivos.

`og-image.png` es la tarjeta que se ve al compartir un enlace: 1200 × 630, que es la medida que esperan todas las redes, y con `summary_large_image` para que no la recorten a un cuadradito. Lleva sólo la marca —la trenza con sus dos hilos, el nombre, qué es y la dirección— sobre el fondo del tema oscuro, con los colores leídos de las mismas variables CSS que el resto. Antes apuntaba al icono cuadrado de 512, que en una tarjeta ancha sale recortado o con franjas.

Los colores están medidos: el texto a 4,5:1 o más y los trazos a 3:1 o más contra el fondo más desfavorable de cada tema.

## Navegadores

El piso lo ponen `DecompressionStream` y `CompressionStream`, que son lo que descomprime el `.pkt` y comprime la imagen del PDF sin sumar una biblioteca: **Safari 16.4, iOS 16.4, Chrome 80, Firefox 113**. Todo lo demás que usa el visor entra por debajo de ese piso —`dialog.showModal` y `:has()` piden Safari 15.4, `color-mix()` 16.2, `replaceChildren` 14—, así que no hay nada aparte que verificar.

En Apple hay varias cosas que no son estándar y sí hacen falta. Los eventos de gesto de Safari para el pellizco, que además hay que atender para que el navegador no acerque la página entera en vez del diagrama. Evitar recortar con `border-radius` dentro de un elemento transformado, que ahí es terreno resbaladizo. Los márgenes de resguardo, porque en un iPhone apaisado la muesca se come el costado y el indicador de inicio, el pie; valen cero en cualquier otra pantalla, así que no hace falta condicionarlos. Y el techo del lienzo, que es de Safari en iPhone y es lo que fija a cuánto se rasteriza la hoja más grande.

El diagrama lleva `touch-action: none` para que arrastrar y pellizcar sean del dibujo y no de la página. Con el dedo, todo lo que se toca llega a los cuarenta y cuatro píxeles que pide Apple, y no llegaba: la casilla medía trece y su renglón diecinueve, el renglón de la lista de equipos veintinueve, el campo de búsqueda treinta y uno, y en la tabla de paquetes la fila veintiocho y el título treinta y uno. Eso es apuntar a una línea de texto, y elegir un equipo o un paquete es justamente lo que se hace en el teléfono; errarle a un título además ordena por otra columna. En la tabla se pagan tres filas menos en pantalla. Las entradas de la leyenda crecen sin margen negativo, que superpondría el área de una con la de la vecina. La única excepción son los botones de acercar, que se quedan en cuarenta: son tres apilados sobre un diagrama que en un teléfono mide trescientos ochenta de alto, y la columna taparía un tercio del dibujo.

Lo que no está probado en hardware Apple es nada de esto: el piso, los gestos y el techo del lienzo salen de la documentación y de la cuenta, no de un iPhone.

## Desarrollo

```bash
npm test
```

Sin dependencias ni paso de compilación. Para probarlo en local alcanza con servir la carpeta con cualquier servidor estático: el navegador necesita los módulos por HTTP y no funciona abriendo `index.html` desde el disco.

## Despliegue en Cloudflare Pages

Sin comando de compilación, con la raíz del repositorio como directorio de salida. `_headers` define la política de seguridad de contenido: permite las fuentes de Google y bloquea todo lo demás.

Esa política no lleva `unsafe-inline`, y eso alcanza a los atributos `style`: escribir uno desde el código se descarta en silencio. El retraso de entrada de cada dispositivo se escribe como propiedad, `node.style.setProperty`, que no pasa por esa puerta. El guion de la cabecera va con hash, así que **tocarlo obliga a recalcularlo**: es el `sha256-` del `script-src`.

Un servidor estático cualquiera sirve para desarrollar, pero no manda esas cabeceras, así que lo que dependa de ellas no se ve hasta desplegar. Para probarlo antes hay que servir la carpeta mandando lo que dice `_headers`.

## Estado

Validado contra archivos reales de Packet Tracer **7.3.0, 7.3.1, 8.2.1 y 9.0.1** —catorce redes, de tres a setenta y dos equipos, con VLAN, troncos, rutas estáticas y RIP—, archivos de formato heredado, y capturas pcap y pcapng generadas para pruebas, incluidos los casos de archivo dañado, vacío, sin topología, de un solo dispositivo, con dispositivos superpuestos y de cien mil paquetes.

La responsividad se revisa midiendo, no mirando: para cada ancho —320, 375, 812 apaisado, 768, 1024, 1180, 1440, 1920 y 2560— y para cada estado —pantalla inicial, red abierta, equipo elegido, diálogo de exportación abierto, captura abierta, paquete elegido— se comprueba que la página no se desplace de costado, que ningún elemento sobresalga del cuerpo salvo dentro de un contenedor que se desplaza, que ninguna etiqueta quede recortada contra el borde del lienzo, que la leyenda no tape ningún equipo, y que con el dedo nada que se toque baje de cuarenta píxeles. Ochenta combinaciones, y las tres primeras vueltas encontraron tres defectos: la etiqueta recortada, el aro que crecía desde el medio del diagrama, y los renglones de veintinueve píxeles.

La tubería no cambió en todo ese rango. Comparando la misma red guardada con 8.2.1 y con 9.0.1, la versión nueva suma treinta y seis etiquetas al XML —listas de acceso, PTP, NTP, licencias, medidas de las ventanas— y no saca ninguna: todo lo que el visor lee sigue donde estaba. Las posiciones bailan un píxel, que es cómo redondea cada versión.

Un pcapng puede ser la concatenación de varias capturas, y cada sección abre con su propia cabecera: la numeración de interfaces vuelve a empezar y el orden de bytes puede ser otro. Sin reiniciar la lista en cada cabecera, los paquetes de la segunda sección se leían con el tipo de enlace y la resolución de tiempo de la primera.

Ninguna lista de acceso salió de un archivo real: no hay una sola configurada en los catorce, así que esa parte está probada contra configuraciones armadas a mano y contra un `.pkt` de prueba con OSPF, listas y un router en un palo. Lo que el XML de 9.0.1 guarda en `ACL_IN_ID` y `ACL_OUT_ID` no se lee, y no por olvido: viene vacío en los catorce archivos, el puerto que lo lleva no guarda su nombre, y un número suelto sin interfaz al lado no nombra nada. La configuración sí dice las dos cosas.
