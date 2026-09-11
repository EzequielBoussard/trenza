import { countOf, t, withLanguage } from '../i18n.js';
import { download } from '../download.js';
import { SvgContext, haloText, strokeGlyph } from './svg-context.js';
import {
  ADDRESS_FONT,
  CATEGORY_GLYPHS,
  CATEGORY_THREADS,
  LABEL_FONT,
  LABEL_REACH_BELOW,
  LABEL_TYPE,
  LAYOUT_STRETCH,
  LEGEND_ENTRIES,
  frameForNetwork,
  measureBounds,
  partitionDevices,
  planLabels,
  projectIntoRect,
  readPalette,
  selectVisible,
  spreadScaleFor,
  threadFor,
  trayPlan,
  trayPositions,
} from './graph.js';

// El lienzo más grande que se puede pedir. El techo lo pone Safari en iPhone, que no
// entrega lienzos de más de dieciséis millones y pico de píxeles y devuelve uno en blanco
// sin avisar. Un A3 a 300 puntos por pulgada son 17,4 millones, así que sin este tope el
// PDF más grande salía vacío justo en el navegador que menos se puede probar.
const MAX_CANVAS_PIXELS = 16.7e6;

// Un diagrama es texto fino sobre color plano, justo lo que peor le sienta al JPEG. Con
// menos calidad que esta, las letras salen con la basura típica del formato alrededor.
const JPEG_QUALITY = 0.95;

// La banda del título mide lo que ocupan sus dos renglones más un respiro. Sólo la parte
// de los renglones crece con la letra: si creciera el respiro también, agrandar el título
// le sacaría alto al dibujo sin que se vea mejor nada.
const HEADER_TEXT = 52;
const HEADER_GAP = 22;
const LEGEND_ROW_HEIGHT = 22;
// Cuánto sobresale un dispositivo de su centro: arriba el halo, abajo el nombre y la
// dirección, contando el renglón de más que la dirección puede llegar a usar.
const NODE_EXTENT = { top: 32, bottom: LABEL_REACH_BELOW + 6 };
const MARGIN = 40;

// En cuántas unidades se reparte el dibujo cuando la medida de salida está fija. Es lo
// único que decide el tamaño de todo en la imagen: el diagrama se dibuja en estas
// unidades y después se multiplica por la escala, así que a menos unidades, más grandes
// salen los nombres, las direcciones y los iconos. Subir la resolución sube la escala y
// con ella todo el dibujo, en vez de sumar píxeles al mismo diagrama diminuto.
//
// El valor es el punto de partida de la búsqueda, no el resultado: si con ese ancho alguna
// etiqueta se queda sin lugar, el diseño se ensancha hasta que entren todas.
const DESIGN_WIDTH = 2200;

// Cuánto se ensancha el diseño entre un intento y el siguiente, y cuántos intentos como
// mucho. El paso es fijo y no una fracción del rango: dividir el rango lo volvía grueso
// justo en las redes grandes, que son las que más lo necesitan, y ahí cada escalón de más
// es cuerpo de letra perdido. Veinticuatro intentos cubren mil doscientas unidades, de
// sobra en todo lo probado, y acotan lo que puede tardar una vista previa que se rehace
// con cada cambio del diálogo.
const DESIGN_STEP = 50;
const DESIGN_STEPS = 24;

// Límites del área donde se reparten los dispositivos. El mínimo evita diagramas
// diminutos; el máximo, archivos de decenas de megapíxeles.
const MIN_CONTENT_WIDTH = 760;
const MAX_CONTENT_WIDTH = 4200;
const MAX_CONTENT_HEIGHT = 3000;

// Medidas de salida fijas. La quinta opción, ajustar al diagrama, no es una medida:
// se agrega aparte porque significa «el tamaño que el dibujo pida».
const EXPORT_RESOLUTIONS = {
  hd: { width: 1280, height: 720 },
  fullhd: { width: 1920, height: 1080 },
  qhd: { width: 2560, height: 1440 },
  uhd: { width: 3840, height: 2160 },
};

export const DEFAULT_RESOLUTION = 'fullhd';

export const SIZE_LABELS = Object.fromEntries([
  ...Object.entries(EXPORT_RESOLUTIONS).map(([name, size]) => [name, `${size.width} × ${size.height}`]),
  ...Object.entries({ a4: 'A4', letter: 'Carta', a3: 'A3' }),
]);

// Hojas en puntos, apaisadas, y la definición a la que se rasteriza para imprimir.
const PAPER_SIZES = {
  a4: { width: 842, height: 595 },
  letter: { width: 792, height: 612 },
  a3: { width: 1191, height: 842 },
};

export const DEFAULT_PAPER = 'a4';

// El PDF lleva el diagrama como imagen, así que esta es toda la nitidez que va a tener:
// 300 puntos por pulgada es la definición de imprenta y aguanta ampliar al 300 % en
// pantalla antes de que se note el píxel. Con 200 el texto se veía blando al acercarse.
const PRINT_DPI = 300;

// El piso de legibilidad se mide sobre la dirección, que es el texto más chico del dibujo
// y el que trae el dato: el nombre es casi el doble, así que ponerlo sobre el nombre dejaba
// pasar salidas con direcciones ilegibles. En papel se aguanta un cuerpo bastante menor que
// en pantalla porque 300 puntos por pulgada resuelven trazos que un monitor no.
const MIN_ADDRESS_POINTS = 2.5;
const MIN_ADDRESS_SIZE = 7;

// El cuerpo de la dirección es contra el que se mide el piso de legibilidad. Sale del mismo
// lugar que el resto de la tipografía: el visor y la imagen son el mismo dibujo a distinta
// escala, y cualquier diferencia acá hace que la descarga no se parezca a lo que se vio.
const ADDRESS_SIZE = LABEL_TYPE.addressSize;

// Grosor del contorno del color del fondo que va debajo de cada etiqueta, el mismo que
// en pantalla: sin él, un cable que cruza por detrás del texto lo vuelve ilegible.
const LABEL_HALO = 3.5;

// Dirección del visor, estampada en cada exportación para que la imagen diga de dónde salió.
const SITE_URL = 'trenza.pages.dev';

// El marco —título, leyenda, dirección— no depende de cuántos dispositivos haya sino del
// tamaño de la imagen: los cuerpos de abajo son los de una imagen de este ancho, y en una
// más grande crecen con ella. Son cinco cadenas que no compiten con nada, así que pueden
// ocupar lo que necesiten para leerse de un vistazo; el aire que las rodea, no: cada
// unidad de margen se la saca al dibujo, que es lo que de verdad está apretado. Por eso
// la letra crece contra un ancho de referencia menor que el del espaciado.
const CHROME_WIDTH = 1100;
const SPACING_WIDTH = 1600;
const MAX_CHROME_ZOOM = 3.5;

function chromeFor(width) {
  const grow = (reference) => Math.min(MAX_CHROME_ZOOM, Math.max(1, width / reference));
  const zoom = grow(CHROME_WIDTH);

  return {
    zoom,
    margin: MARGIN * grow(SPACING_WIDTH),
    header: HEADER_TEXT * zoom + HEADER_GAP,
    legendRow: LEGEND_ROW_HEIGHT * zoom,
    titleFont: `700 ${24 * zoom}px "IBM Plex Sans Condensed", sans-serif`,
    subtitleFont: `400 ${13 * zoom}px "IBM Plex Sans", sans-serif`,
    legendFont: `400 ${13 * zoom}px "IBM Plex Sans", sans-serif`,
    watermarkFont: `500 ${12 * zoom}px "IBM Plex Mono", monospace`,
  };
}

const EXPORT_FORMATS = {
  png: { extension: 'png', mime: 'image/png' },
  jpg: { extension: 'jpg', mime: 'image/jpeg' },
  svg: { extension: 'svg', mime: 'image/svg+xml', vector: true },
  pdf: { extension: 'pdf', mime: 'application/pdf' },
};

export const VECTOR_FORMATS = Object.keys(EXPORT_FORMATS).filter((name) => EXPORT_FORMATS[name].vector);

export function suggestExportName(fileName) {
  return (fileName || 'red').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'red';
}

/**
 * Elegir el tamaño de salida obliga a medir el reparto una y otra vez, y ahí cada nombre
 * se consulta miles de veces. Los cuerpos de las etiquetas son fijos, así que dentro de
 * una misma exportación cada cadena se mide una sola vez.
 */
function labelMeasurer() {
  const context = document.createElement('canvas').getContext('2d');
  const widths = new Map();
  const width = (font, text) => {
    const key = `${font}\n${text}`;
    if (!widths.has(key)) {
      context.font = font;
      widths.set(key, context.measureText(text).width);
    }
    return widths.get(key);
  };

  return {
    context,
    // Lo que no depende del tamaño de salida, guardado por exportación. Ver `measureDiagram`.
    fixed: new Map(),
    nameWidth: (text) => width(LABEL_FONT, text),
    addressWidth: (text) => width(ADDRESS_FONT, text),
  };
}

/** Mitad de la etiqueta más ancha de un dispositivo: lo que sobresale a cada lado. */
function halfLabelWidth(measure, device) {
  const address = device.interfaces.flatMap((entry) => entry.addresses)[0];
  const width = Math.max(
    measure.nameWidth(device.name),
    address ? measure.addressWidth(address.address) : 0,
  );
  return width / 2;
}

/**
 * Reparte la leyenda en columnas de ancho uniforme para que las entradas queden
 * alineadas entre sí, y en varias filas si no entran a lo ancho.
 */
function planLegend(context, links, availableWidth, chrome) {
  const entries = LEGEND_ENTRIES.filter((entry) => new Set(links.map(threadFor)).has(entry.thread))
    .map((entry) => ({ ...entry, label: t(entry.key) }));

  if (entries.length === 0) return { entries, columns: 0, rows: 0, columnWidth: 0, height: 0 };

  context.font = chrome.legendFont;
  const widest = Math.max(...entries.map((entry) => context.measureText(entry.label).width));
  const columnWidth = Math.ceil(widest) + (26 + 32) * chrome.zoom;
  const columns = Math.max(1, Math.min(entries.length, Math.floor(availableWidth / columnWidth)));
  const rows = Math.ceil(entries.length / columns);

  return { entries, columns, rows, columnWidth, height: rows * chrome.legendRow };
}

function drawLinks(context, links, positions, palette) {
  context.lineCap = 'round';
  context.lineWidth = 1.4;

  for (const link of links) {
    const from = positions.get(link.from);
    const to = positions.get(link.to);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const offsetX = (-dy / length) * 1.6;
    const offsetY = (dx / length) * 1.6;
    const thread = threadFor(link);

    context.save();
    if (!link.functional) {
      context.setLineDash([3, 5]);
      context.globalAlpha = 0.4;
    }

    context.strokeStyle = palette[thread];
    context.beginPath();
    context.moveTo(from.x + offsetX, from.y + offsetY);
    context.lineTo(to.x + offsetX, to.y + offsetY);
    context.stroke();

    context.strokeStyle = palette[`${thread}-pale`];
    context.globalAlpha *= 0.55;
    context.beginPath();
    context.moveTo(from.x - offsetX, from.y - offsetY);
    context.lineTo(to.x - offsetX, to.y - offsetY);
    context.stroke();
    context.restore();
  }
}

function drawNodes(context, devices, positions, palette, labels) {
  for (const device of devices) {
    const { x, y } = positions.get(device.id);
    const shown = labels.get(device.id);
    const [outline, symbol] = CATEGORY_THREADS[device.category] || CATEGORY_THREADS.other;

    context.beginPath();
    context.arc(x, y, 26, 0, Math.PI * 2);
    context.fillStyle = palette.ground;
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = palette.line;
    context.stroke();

    context.beginPath();
    context.arc(x, y, 18, 0, Math.PI * 2);
    context.fillStyle = palette.raised;
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = palette[outline];
    context.stroke();

    context.save();
    context.translate(x - 12, y - 12);
    context.lineWidth = 1.6;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.strokeStyle = palette[symbol];
    strokeGlyph(context, CATEGORY_GLYPHS[device.category] || CATEGORY_GLYPHS.other);
    context.restore();

    context.textAlign = 'center';
    context.strokeStyle = palette.ground;
    context.lineWidth = LABEL_HALO;
    context.lineJoin = 'round';

    context.fillStyle = palette.text;
    context.font = LABEL_FONT;
    haloText(context, device.name, x, y + LABEL_TYPE.nameBaseline + shown.offset);

    const address = device.interfaces.flatMap((entry) => entry.addresses)[0];
    if (address) {
      context.fillStyle = palette['text-muted'];
      context.font = ADDRESS_FONT;
      haloText(context, address.address, x, y + LABEL_TYPE.addressBaseline + shown.offset);
    }
  }
}

function drawTray(context, stray, positions, palette, chrome, { left, right, top }) {
  if (stray.length === 0) return;

  context.strokeStyle = palette.line;
  context.lineWidth = chrome.zoom;
  context.setLineDash([2 * chrome.zoom, 4 * chrome.zoom]);
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(right, top);
  context.stroke();
  context.setLineDash([]);

  context.textAlign = 'left';
  context.fillStyle = palette['text-faint'];
  context.font = chrome.legendFont;
  context.fillText(t('diagram.unconnected'), left, top + 16 * chrome.zoom);
}

function watermarkWidth(context, chrome) {
  context.font = chrome.watermarkFont;
  return Math.ceil(context.measureText(SITE_URL).width);
}

function drawWatermark(context, palette, chrome, { right, bottom }) {
  context.textAlign = 'right';
  context.font = chrome.watermarkFont;
  context.fillStyle = palette['text-faint'];
  context.fillText(SITE_URL, right, bottom);
  context.textAlign = 'left';
}

function drawCaption(context, { title, subtitle, palette, chrome, left, top }) {
  context.textAlign = 'left';
  context.fillStyle = palette.text;
  context.font = chrome.titleFont;
  context.fillText(title, left, top + 24 * chrome.zoom);

  context.fillStyle = palette['text-muted'];
  context.font = chrome.subtitleFont;
  context.fillText(subtitle, left, top + 46 * chrome.zoom);
}

function drawLegend(context, legend, { palette, chrome, left, top }) {
  const { zoom } = chrome;
  context.textAlign = 'left';
  context.font = chrome.legendFont;

  legend.entries.forEach((entry, index) => {
    const x = left + (index % legend.columns) * legend.columnWidth;
    const y = top + Math.floor(index / legend.columns) * chrome.legendRow + 10 * zoom;

    context.lineWidth = 2 * zoom;
    context.strokeStyle = palette[entry.thread];
    context.beginPath();
    context.moveTo(x, y - 3 * zoom);
    context.lineTo(x + 18 * zoom, y - 3 * zoom);
    context.stroke();

    context.strokeStyle = palette[`${entry.thread}-pale`];
    context.beginPath();
    context.moveTo(x, y + zoom);
    context.lineTo(x + 18 * zoom, y + zoom);
    context.stroke();

    context.fillStyle = palette['text-muted'];
    context.fillText(entry.label, x + 26 * zoom, y + 4 * zoom);
  });
}

/**
 * Mide lo que el diagrama necesita: cuánto hay que separar los dispositivos para que
 * las etiquetas no se pisen, y cuánto margen piden el título, la leyenda y la bandeja.
 * De ahí sale el tamaño natural, el más chico en el que el dibujo respira.
 */
function measureDiagram(model, showInfrastructure, chrome, measure) {
  const context2d = measure.context;

  // La búsqueda del ancho llama a esto una vez por candidato, y sólo el marco cambia entre
  // uno y otro: qué equipos hay, cuánto separarlos y cuánto sobresale la etiqueta más ancha
  // salen de los nombres y de las posiciones. Separarlos cuesta un recorrido por cada par
  // —cinco mil en la red del showcase—, repetido hasta veinticinco veces para dar lo mismo.
  const key = showInfrastructure ? 'con' : 'sin';
  if (!measure.fixed.has(key)) {
    const visible = selectVisible(model, showInfrastructure);
    if (visible.devices.length === 0) throw new Error(t('error.noDevices'));

    const { placed, stray } = partitionDevices(visible.devices, visible.links);
    const halfWidth = (device) => halfLabelWidth(measure, device);
    const { spanX, spanY } = measureBounds(placed);

    measure.fixed.set(key, {
      placed,
      stray,
      links: visible.links,
      labelReach: Math.ceil(Math.max(...visible.devices.map(halfWidth))),
      spread: Math.min(
        Math.max(spreadScaleFor(placed, halfWidth), MIN_CONTENT_WIDTH / spanX),
        MAX_CONTENT_WIDTH / spanX,
        MAX_CONTENT_HEIGHT / spanY,
      ),
    });
  }

  const { placed, stray, links, labelReach, spread } = measure.fixed.get(key);

  const side = chrome.margin + labelReach;
  const top = chrome.margin + chrome.header + NODE_EXTENT.top;
  const provisional = frameForNetwork(placed, { left: side, right: side, top, bottom: top }, spread);
  const across = provisional.width - chrome.margin * 2;

  const legend = planLegend(context2d, links, across - watermarkWidth(context2d, chrome) - 24 * chrome.zoom, chrome);
  const tray = trayPlan(stray, across);
  const insets = {
    left: side,
    right: side,
    top,
    bottom: chrome.margin + NODE_EXTENT.bottom + legend.height + 16 * chrome.zoom + tray.height,
  };

  const natural = frameForNetwork(placed, insets, spread);
  return { placed, stray, links, measure, chrome, insets, legend, tray, natural };
}

/**
 * Coloca el diagrama dentro de un espacio de diseño dado. El marco —título, leyenda y
 * dirección— se ancla a los bordes de ese espacio, no al rectángulo del dibujo: si no,
 * en un lienzo más alto que el diagrama la leyenda queda flotando en el medio.
 */
function layoutInto(shape, design) {
  const { chrome } = shape;
  const trayTop = design.height - chrome.margin - shape.legend.height - 16 * chrome.zoom - shape.tray.height;
  const content = {
    x: shape.insets.left,
    y: shape.insets.top,
    width: Math.max(120, design.width - shape.insets.left - shape.insets.right),
    height: Math.max(120, trayTop - NODE_EXTENT.bottom - shape.insets.top),
  };

  const positions = projectIntoRect(shape.placed, content, { stretch: LAYOUT_STRETCH });
  for (const [id, point] of trayPositions(shape.stray, shape.tray, {
    x: chrome.margin,
    y: trayTop,
    width: design.width - chrome.margin * 2,
  })) {
    positions.set(id, point);
  }

  const devices = [...shape.placed, ...shape.stray];
  const labels = planLabels(devices, positions, shape.measure);

  // Se dibuja todo. Lo que se mide es qué tan prolijo quedó: cuántos bloques se rozan y
  // cuántos tuvieron que bajar de renglón. Un bloque corrido no pierde información pero
  // rompe la alineación, y una fila de equipos iguales con uno más abajo canta.
  const crowded = devices.reduce((total, device) => total + (labels.get(device.id).crowded ? 1 : 0), 0);
  const stepped = devices.reduce((total, device) => total + (labels.get(device.id).offset > 0 ? 1 : 0), 0);

  return { ...shape, design, trayTop, positions, labels, devices, crowded, stepped };
}

/**
 * Qué tan lejos está un reparto de quedar prolijo. Una etiqueta rozando a otra pesa mucho
 * más que una corrida de renglón, pero las dos cuentan: el objetivo es que todos los
 * bloques queden a la misma altura bajo su icono.
 */
function untidiness(plan) {
  return plan.crowded * 1000 + plan.stepped;
}

/**
 * Resuelve una exportación: en qué espacio se dibuja el diagrama y a qué escala se lleva
 * a la imagen final.
 */
function planExport(model, { showInfrastructure, pixels }) {
  const measure = labelMeasurer();
  const shapeFor = (width) => measureDiagram(model, showInfrastructure, chromeFor(width), measure);

  // El marco crece con la imagen, y al crecer pide más margen, lo que corre el tamaño
  // natural. Dos pasadas alcanzan para que el par se asiente.
  let shape = shapeFor(CHROME_WIDTH);
  for (let pass = 0; pass < 2; pass++) {
    const next = shapeFor(shape.natural.width);
    if (next.chrome.zoom === shape.chrome.zoom) break;
    shape = next;
  }

  if (!pixels) return { ...layoutInto(shape, shape.natural), scale: 1 };

  // Se arranca del ancho más chico que valga la pena y, si alguna etiqueta se quedó sin
  // lugar, el diseño se ensancha hasta que entren todas: una dirección a medias no sirve
  // para nada, y el precio es cuerpo de letra, no información.
  //
  // La búsqueda pasa del ancho natural, y no por capricho. El natural se mide con la
  // proporción que el dibujo pide, pero la salida impone la suya: un diagrama que a lo
  // ancho no se pisaba, apretado a 16:9, sí. En una red de diez equipos el natural queda
  // en 1070, por debajo del ancho de referencia, y con el techo ahí la búsqueda se
  // terminaba en la primera vuelta sin haber probado nada.
  const aspect = pixels.width / pixels.height;
  const planAt = (width) => layoutInto(shapeFor(width), { width, height: width / aspect });
  const floor = Math.min(shape.natural.width, DESIGN_WIDTH);

  let best = planAt(floor);
  for (let step = 1; step <= DESIGN_STEPS && untidiness(best) > 0; step++) {
    // Más ancho no siempre es más prolijo: al estirarse cambia también la separación
    // vertical, así que se comparan todos y gana el primero que llegue a cero.
    const candidate = planAt(floor + DESIGN_STEP * step);
    if (untidiness(candidate) < untidiness(best)) best = candidate;
  }

  return { ...best, scale: pixels.width / best.design.width };
}

/** Medidas de salida que sirven: las que dejan el texto por encima del piso legible. */
export function offeredSizes(model, { showInfrastructure, format }) {
  const survives = (size) => {
    try {
      const pixels = canvasSizeFor(format, size);
      const { scale } = planExport(model, { showInfrastructure, pixels });
      return format === 'pdf'
        ? ADDRESS_SIZE * scale * 72 / PRINT_DPI >= MIN_ADDRESS_POINTS
        : ADDRESS_SIZE * scale >= MIN_ADDRESS_SIZE;
    } catch {
      return false;
    }
  };

  try {
    measureDiagram(model, showInfrastructure, chromeFor(CHROME_WIDTH), labelMeasurer());
  } catch {
    return [];
  }

  const candidates = format === 'pdf' ? PAPER_SIZES : EXPORT_RESOLUTIONS;
  return Object.entries(candidates)
    .filter(([, size]) => survives(size))
    .map(([name]) => name)
    .concat('fit');
}

/**
 * Píxeles del lienzo para la medida pedida, o ninguno si el dibujo pone el tamaño. La hoja
 * se rasteriza a 300 puntos por pulgada salvo que eso pase del lienzo más grande que se
 * puede pedir; ahí baja lo justo para entrar, que en un A3 son 294 y no se nota. La medida
 * de la hoja no cambia: el PDF la calcula desde los píxeles que salieron.
 */
function canvasSizeFor(format, size) {
  if (!size) return null;
  if (format !== 'pdf') return size;

  const perPoint = PRINT_DPI / 72;
  const area = size.width * size.height * perPoint ** 2;
  const fit = area > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / area) : 1;

  return {
    width: Math.round(size.width * perPoint * fit),
    height: Math.round(size.height * perPoint * fit),
  };
}

/**
 * Dibuja la red completa. Con una medida fija el lienzo mide exactamente eso: el
 * diagrama se reparte en lo que queda y el marco se apoya en los bordes.
 */
async function renderNetworkToCanvas(model, { showInfrastructure, format, size, transparent, title, palette, language, budget }) {
  await document.fonts.ready;

  // Todo el dibujo va dentro de `withLanguage`: la leyenda y el pie se escriben en el
  // idioma pedido, y además su ancho entra en el cálculo del encuadre.
  return withLanguage(language, () => {
    const pixels = canvasSizeFor(format, size);
    const plan = planExport(model, { showInfrastructure, pixels });
    const { design, scale } = plan;

    const width = Math.round(design.width * scale);
    const height = Math.round(design.height * scale);
    if (!budget && width * height > MAX_CANVAS_PIXELS) throw new Error(t('error.tooLarge'));

    // La vista previa sale del mismo plan en un lienzo chico: mismo reparto, mismas
    // etiquetas, mismo encuadre; lo único que cambia es cuántos píxeles hay debajo.
    const shrink = budget ? Math.min(1, budget / width) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * shrink);
    canvas.height = Math.round(height * shrink);
    const context = canvas.getContext('2d');
    context.setTransform(scale * shrink, 0, 0, scale * shrink, 0, 0);

    if (!transparent) {
      context.fillStyle = palette.ground;
      context.fillRect(0, 0, design.width, design.height);
    }

    paintDiagram(context, plan, { palette, title });

    /**
     * Vuelve a pintar el mismo plan en otro lienzo, a la escala de verdad y centrado en un
     * punto: es lo que mira la lupa. Reaprovechar el plan es lo que lo hace barato, porque
     * lo caro no es dibujar sino decidir el reparto. Lo que cae fuera del lienzo lo
     * descarta el propio contexto.
     */
    const magnify = (target, at) => {
      const view = target.getContext('2d');
      view.setTransform(1, 0, 0, 1, 0, 0);
      view.clearRect(0, 0, target.width, target.height);
      view.setTransform(scale, 0, 0, scale, target.width / 2 - at.x * scale, target.height / 2 - at.y * scale);

      view.fillStyle = palette.ground;
      view.fillRect(at.x - target.width / scale, at.y - target.height / scale, target.width * 2 / scale, target.height * 2 / scale);
      paintDiagram(view, plan, { palette, title });
    };

    return { canvas, plan, width, height, magnify };
  });
}

/** El mismo dibujo para el lienzo y para el SVG, expresado sobre un contexto 2D. */
function paintDiagram(context, plan, { palette, title }) {
  const { chrome, design } = plan;

  drawLinks(context, plan.links, plan.positions, palette);
  drawTray(context, plan.stray, plan.positions, palette, chrome, {
    left: chrome.margin,
    right: design.width - chrome.margin,
    top: plan.trayTop,
  });
  drawNodes(context, plan.devices, plan.positions, palette, plan.labels);
  drawCaption(context, {
    title,
    subtitle: t('export.caption', {
      devices: countOf('devices', plan.devices.length),
      links: countOf('links', plan.links.length),
    }),
    palette,
    chrome,
    left: chrome.margin,
    top: chrome.margin,
  });
  drawLegend(context, plan.legend, {
    palette,
    chrome,
    left: chrome.margin,
    top: design.height - chrome.margin - plan.legend.height,
  });
  drawWatermark(context, palette, chrome, {
    right: design.width - chrome.margin,
    bottom: design.height - chrome.margin,
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(t('error.canvas')))),
      mime,
      quality,
    );
  });
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Arma un PDF de una página con el diagrama como imagen sin pérdida. Se escribe a
 * mano porque es un documento mínimo y no justifica sumar una biblioteca entera.
 */
async function buildPdf(canvas, pointsPerPixel) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
  const rgb = new Uint8Array(width * height * 3);
  for (let source = 0, target = 0; source < data.length; source += 4, target += 3) {
    rgb[target] = data[source];
    rgb[target + 1] = data[source + 1];
    rgb[target + 2] = data[source + 2];
  }

  const image = await deflate(rgb);
  const pageWidth = (width * pointsPerPixel).toFixed(2);
  const pageHeight = (height * pointsPerPixel).toFixed(2);
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;

  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let position = 0;

  const write = (part) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    position += bytes.length;
  };
  const startObject = (number) => {
    offsets[number] = position;
  };

  write('%PDF-1.4\n');

  startObject(1);
  write('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  write('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  startObject(3);
  write(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] `
    + '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');

  startObject(4);
  write(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} `
    + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`);
  write(image);
  write('\nendstream\nendobj\n');

  startObject(5);
  write(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefPosition = position;
  write('xref\n0 6\n0000000000 65535 f \n');
  for (let number = 1; number <= 5; number++) {
    write(`${String(offsets[number]).padStart(10, '0')} 00000 n \n`);
  }
  write(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}

/** El SVG sale del tamaño natural del diagrama: escalarlo es tarea de quien lo abra. */
async function buildSvg(model, { showInfrastructure, transparent, title, palette, language }) {
  await document.fonts.ready;

  return withLanguage(language, () => {
    const plan = planExport(model, { showInfrastructure, pixels: null });
    const context = new SvgContext();

    if (!transparent) {
      context.fillStyle = palette.ground;
      context.fillRect(0, 0, plan.design.width, plan.design.height);
    }
    paintDiagram(context, plan, { palette, title });

    const markup = context.toSvg({ width: plan.design.width, height: plan.design.height, title });
    return { blob: new Blob([markup], { type: 'image/svg+xml' }), plan };
  });
}

/** Traduce la medida elegida en el diálogo al rectángulo de salida, si es que hay una. */
function sizeFor(format, choice) {
  if (choice === 'fit' || !choice) return null;
  return format === 'pdf' ? PAPER_SIZES[choice] : EXPORT_RESOLUTIONS[choice];
}

/**
 * El mismo dibujo que se va a descargar, en un lienzo del tamaño que entre en pantalla.
 * Devuelve además la medida real, porque es la que hay que decirle al usuario: en la vista
 * previa dos resoluciones del mismo formato se ven igual, y lo único que las separa es la
 * definición. El SVG y el PDF se previsualizan como lo que son, un vector y una hoja.
 */
export async function renderNetworkPreview(model, request, budget) {
  const { format, name, size: choice, transparent, showInfrastructure, language, theme } = request;
  const descriptor = EXPORT_FORMATS[format];
  if (!descriptor) throw new Error(t('error.unknownFormat', { format }));

  const { canvas, plan, width, height, magnify } = await renderNetworkToCanvas(model, {
    showInfrastructure,
    format,
    size: descriptor.vector ? null : sizeFor(format, choice),
    transparent: transparent && format === 'png',
    title: name,
    palette: readPalette(theme),
    language,
    budget,
  });

  return { canvas, crowded: plan.crowded, width, height, design: plan.design, magnify };
}

export async function createNetworkExport(model, { format, name, size: choice, transparent, showInfrastructure, language, theme }) {
  const descriptor = EXPORT_FORMATS[format];
  if (!descriptor) throw new Error(t('error.unknownFormat', { format }));

  const palette = readPalette(theme);
  const fileName = `${name}.${descriptor.extension}`;

  if (descriptor.vector) {
    const { blob, plan } = await buildSvg(model, { showInfrastructure, transparent, title: name, palette, language });
    return { blob, fileName, crowded: plan.crowded, width: plan.design.width, height: plan.design.height };
  }

  const { canvas, plan } = await renderNetworkToCanvas(model, {
    showInfrastructure,
    format,
    size: sizeFor(format, choice),
    transparent: transparent && format === 'png',
    title: name,
    palette,
    language,
  });

  // La hoja mide lo que pidió el usuario; los píxeles de más sólo suben la definición.
  const paper = format === 'pdf' ? PAPER_SIZES[choice] : null;
  const pointsPerPixel = paper ? paper.width / canvas.width : 0.75;

  const blob = format === 'pdf'
    ? await buildPdf(canvas, pointsPerPixel)
    : await canvasToBlob(canvas, descriptor.mime, format === 'jpg' ? JPEG_QUALITY : undefined);

  return {
    blob,
    fileName,
    crowded: plan.crowded,
    width: canvas.width,
    height: canvas.height,
    paper: paper ? choice : null,
  };
}

export async function exportNetwork(model, options) {
  const result = await createNetworkExport(model, options);
  download(result.blob, result.fileName);
  return { ...result, bytes: result.blob.size };
}
