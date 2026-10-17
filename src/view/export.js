import { countOf, t, withLanguage } from '../i18n.js';
import { download } from '../download.js';
import { SvgContext, haloText, strokeGlyph } from './svg-context.js';
import {
  ADDRESS_FONT,
  CATEGORY_GLYPHS,
  CATEGORY_ORDER,
  CATEGORY_THREADS,
  LABEL_FONT,
  LABEL_REACH_BELOW,
  LABEL_TYPE,
  LAYOUT_STRETCH,
  LEGEND_ENTRIES,
  frameForNetwork,
  halfLabelWidth,
  labelFontsReady,
  measureBounds,
  partitionDevices,
  planLabels,
  projectIntoRect,
  readPalette,
  selectVisible,
  spreadScaleFor,
  threadFor,
  tidiestWidth,
  trayPlan,
  trayPositions,
  untidiness,
} from './graph.js';

// Safari en iPhone devuelve un lienzo en blanco, sin error, por encima de ~16,7 Mpx.
const MAX_CANVAS_PIXELS = 16.7e6;

// Texto fino sobre color plano: con menos calidad aparecen artefactos alrededor de las letras.
const JPEG_QUALITY = 0.95;

// Banda del título: los renglones escalan con la letra, el respiro queda fijo.
const HEADER_TEXT = 52;
const HEADER_GAP = 22;
const LEGEND_ROW_HEIGHT = 22;
const NODE_EXTENT = { top: 32, bottom: LABEL_REACH_BELOW + 6 };
const MARGIN = 40;

// Ancho inicial del espacio de diseño con una medida fija. Menos unidades es texto más
// grande; si alguna etiqueta no entra, la búsqueda lo ensancha.
const DESIGN_WIDTH = 2200;

// Paso fijo: como fracción del rango, en redes grandes queda demasiado grueso.
const DESIGN_STEP = 50;
const DESIGN_STEPS = 24;

const MIN_CONTENT_WIDTH = 760;
const MAX_CONTENT_WIDTH = 4200;
const MAX_CONTENT_HEIGHT = 3000;

// 'fit' (ajustar al diagrama) se agrega aparte.
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

// En puntos, apaisadas.
const PAPER_SIZES = {
  a4: { width: 842, height: 595 },
  letter: { width: 792, height: 612 },
  a3: { width: 1191, height: 842 },
};

export const DEFAULT_PAPER = 'a4';

// El PDF lleva el diagrama como imagen; a 200 ppp el texto se veía blando al ampliar.
const PRINT_DPI = 300;

// El piso de legibilidad se mide sobre la dirección, que es el texto más chico.
const MIN_ADDRESS_POINTS = 2.5;
const MIN_ADDRESS_SIZE = 7;

const ADDRESS_SIZE = LABEL_TYPE.addressSize;

const LABEL_HALO = 3.5;

const SITE_URL = 'trenza.pages.dev';

// El marco (título, leyenda, dirección) escala con el ancho de la imagen, aunque el dibujo se achique.
// La letra crece contra CHROME_WIDTH y los márgenes contra SPACING_WIDTH, que es mayor.
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

// Una caché por exportación: en el módulo guardaría medidas hechas antes de que carguen
// las fuentes.
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
    fixed: new Map(),
    nameWidth: (text) => width(LABEL_FONT, text),
    addressWidth: (text) => width(ADDRESS_FONT, text),
  };
}

// Con la guía, primero los tipos de equipo que hay, con su símbolo: quien no es de redes los
// necesita para leer el dibujo. Después, los cables.
function planLegend(context, { devices, links, guide }, availableWidth, chrome) {
  const kinds = new Set(devices.map((device) => device.category));
  const entries = [
    ...(guide ? CATEGORY_ORDER.filter((category) => kinds.has(category))
      .map((category) => ({ category, label: t(`category.${category}`) })) : []),
    ...LEGEND_ENTRIES.filter((entry) => new Set(links.map(threadFor)).has(entry.thread))
      .map((entry) => ({ ...entry, label: t(entry.key) })),
  ];

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

    context.fillStyle = palette['text-muted'];
    context.fillText(entry.label, x + 26 * zoom, y + 4 * zoom);

    if (entry.category) {
      // El símbolo del diagrama, de 24 unidades llevado a 18 como la muestra de cable.
      context.save();
      context.translate(x, y - 10 * zoom);
      context.scale(0.75 * zoom, 0.75 * zoom);
      context.lineWidth = 2;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.strokeStyle = palette[(CATEGORY_THREADS[entry.category] || CATEGORY_THREADS.other)[0]];
      strokeGlyph(context, CATEGORY_GLYPHS[entry.category] || CATEGORY_GLYPHS.other);
      context.restore();
      return;
    }

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
  });
}

// Tamaño natural: el más chico en el que las etiquetas no se pisan.
function measureDiagram(model, { showInfrastructure, guide }, chrome, measure) {
  const context2d = measure.context;

  // Lo que no depende del marco se calcula una vez: spreadScaleFor es O(n²) y esto se
  // llama una vez por ancho candidato.
  const key = showInfrastructure ? 'con' : 'sin';
  if (!measure.fixed.has(key)) {
    const visible = selectVisible(model, showInfrastructure);
    if (visible.devices.length === 0) throw new Error(t('error.noDevices'));

    const { placed, stray } = partitionDevices(visible.devices, visible.links);
    const halfWidth = (device) => halfLabelWidth(device, measure);
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

  const legendWidth = across - watermarkWidth(context2d, chrome) - 24 * chrome.zoom;
  const legend = planLegend(context2d, { devices: [...placed, ...stray], links, guide }, legendWidth, chrome);
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

// El marco se ancla a los bordes del espacio de diseño: anclado al dibujo, en un lienzo más
// alto la leyenda quedaría flotando en el medio.
function layoutInto(shape, design, limit) {
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
  const labels = planLabels(devices, positions, shape.measure, limit);
  if (!labels) return null;

  const crowded = devices.reduce((total, device) => total + (labels.get(device.id).crowded ? 1 : 0), 0);
  return { ...shape, design, trayTop, positions, labels, devices, crowded, untidiness: untidiness(labels) };
}

// El marco pide más margen al crecer y eso cambia el tamaño natural: 2 pasadas alcanzan.
function settledShape(shapeFor) {
  let shape = shapeFor(CHROME_WIDTH);
  for (let pass = 0; pass < 2; pass++) {
    const next = shapeFor(shape.natural.width);
    if (next.chrome.zoom === shape.chrome.zoom) break;
    shape = next;
  }
  return shape;
}

// Pasa del ancho natural porque la salida (16:9) impone otra proporción donde las etiquetas
// pueden pisarse. No es monótona: más ancho cambia también la separación vertical.
function designWidths(shape) {
  const floor = Math.min(shape.natural.width, DESIGN_WIDTH);
  return Array.from({ length: DESIGN_STEPS + 1 }, (_, step) => floor + DESIGN_STEP * step);
}

function planExport(model, { showInfrastructure, guide, pixels, measure = labelMeasurer() }) {
  const shapeFor = (width) => measureDiagram(model, { showInfrastructure, guide }, chromeFor(width), measure);
  const shape = settledShape(shapeFor);
  if (!pixels) return { ...layoutInto(shape, shape.natural), scale: 1 };

  const aspect = pixels.width / pixels.height;
  const planAt = (width, limit) => layoutInto(shapeFor(width), { width, height: width / aspect }, limit);
  const best = tidiestWidth(designWidths(shape), planAt, shape.placed.length + shape.stray.length);
  return { ...best, scale: pixels.width / best.design.width };
}

// Sólo las medidas en las que la dirección queda por encima del piso de legibilidad.
export function offeredSizes(model, { showInfrastructure, guide, format }) {
  // Un medidor para todas las medidas: lo que no depende del marco se calcula una sola vez.
  const measure = labelMeasurer();
  let widths;
  try {
    widths = designWidths(settledShape((width) => measureDiagram(model, { showInfrastructure, guide }, chromeFor(width), measure)));
  } catch {
    return [];
  }

  // La escala baja con el ancho de diseño: si el más angosto no se lee, ninguno; si el más
  // ancho se lee, cualquiera. Sólo en el medio hace falta buscar el ancho de verdad.
  const survives = (size) => {
    const pixels = canvasSizeFor(format, size);
    const readable = (designWidth) => {
      const scale = pixels.width / designWidth;
      return format === 'pdf'
        ? ADDRESS_SIZE * scale * 72 / PRINT_DPI >= MIN_ADDRESS_POINTS
        : ADDRESS_SIZE * scale >= MIN_ADDRESS_SIZE;
    };
    if (!readable(widths[0])) return false;
    if (readable(widths[widths.length - 1])) return true;
    try {
      return readable(planExport(model, { showInfrastructure, guide, pixels, measure }).design.width);
    } catch {
      return false;
    }
  };

  const candidates = format === 'pdf' ? PAPER_SIZES : EXPORT_RESOLUTIONS;
  return Object.entries(candidates)
    .filter(([, size]) => survives(size))
    .map(([name]) => name)
    .concat('fit');
}

// Las hojas se rasterizan a 300 ppp salvo que pasen de MAX_CANVAS_PIXELS (A3 queda en 294).
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

async function renderNetworkToCanvas(model, { showInfrastructure, guide, format, size, transparent, title, palette, language, budget }) {
  await labelFontsReady();

  // Dentro de withLanguage también el plan: el ancho de la leyenda depende del idioma.
  return withLanguage(language, () => {
    const pixels = canvasSizeFor(format, size);
    const plan = planExport(model, { showInfrastructure, guide, pixels });
    const { design, scale } = plan;

    const width = Math.round(design.width * scale);
    const height = Math.round(design.height * scale);
    if (!budget && width * height > MAX_CANVAS_PIXELS) throw new Error(t('error.tooLarge'));

    // La vista previa usa el mismo plan en menos píxeles.
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

    // Para la lupa: repinta el mismo plan a escala real centrado en `at`.
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

// Sirve para el lienzo y para el SVG (ver svg-context.js).
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

// PDF de una página con la imagen en FlateDecode, escrito a mano.
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

// El SVG va al tamaño natural.
async function buildSvg(model, { showInfrastructure, guide, transparent, title, palette, language }) {
  await labelFontsReady();

  return withLanguage(language, () => {
    const plan = planExport(model, { showInfrastructure, guide, pixels: null });
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

function sizeFor(format, choice) {
  if (choice === 'fit' || !choice) return null;
  return format === 'pdf' ? PAPER_SIZES[choice] : EXPORT_RESOLUTIONS[choice];
}

// Devuelve también la medida real, que es lo que distingue 2 resoluciones en la vista previa.
export async function renderNetworkPreview(model, request, budget) {
  const { format, name, size: choice, transparent, showInfrastructure, guide, language, theme } = request;
  const descriptor = EXPORT_FORMATS[format];
  if (!descriptor) throw new Error(t('error.unknownFormat', { format }));

  const { canvas, plan, width, height, magnify } = await renderNetworkToCanvas(model, {
    showInfrastructure,
    guide,
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

async function createNetworkExport(model, { format, name, size: choice, transparent, showInfrastructure, guide, language, theme }) {
  const descriptor = EXPORT_FORMATS[format];
  if (!descriptor) throw new Error(t('error.unknownFormat', { format }));

  const palette = readPalette(theme);
  const fileName = `${name}.${descriptor.extension}`;

  if (descriptor.vector) {
    const { blob, plan } = await buildSvg(model, { showInfrastructure, guide, transparent, title: name, palette, language });
    return { blob, fileName, crowded: plan.crowded, width: plan.design.width, height: plan.design.height };
  }

  const { canvas, plan } = await renderNetworkToCanvas(model, {
    showInfrastructure,
    guide,
    format,
    size: sizeFor(format, choice),
    transparent: transparent && format === 'png',
    title: name,
    palette,
    language,
  });

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
