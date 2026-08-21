import { countOf, t } from '../i18n.js';
import { download } from '../download.js';
import {
  CATEGORY_GLYPHS,
  CATEGORY_THREADS,
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

const MAX_PIXELS = 40e6;

// Alto de la banda del título y de cada fila de la leyenda, y cuánto sobresale un
// dispositivo de su centro: el halo hacia arriba, el nombre y la dirección hacia abajo.
const HEADER_HEIGHT = 74;
const LEGEND_ROW_HEIGHT = 22;
const NODE_EXTENT = { top: 32, bottom: 60 };
const MARGIN = 40;

// Límites del área donde se reparten los dispositivos. El mínimo evita diagramas
// diminutos; el máximo, archivos de decenas de megapíxeles.
const MIN_CONTENT_WIDTH = 760;
const MAX_CONTENT_WIDTH = 4200;
const MAX_CONTENT_HEIGHT = 3000;

// Tamaños de salida fijos, más la opción de dejar que el diagrama pida el suyo.
export const EXPORT_RESOLUTIONS = {
  hd: { width: 1280, height: 720 },
  fullhd: { width: 1920, height: 1080 },
  qhd: { width: 2560, height: 1440 },
  uhd: { width: 3840, height: 2160 },
  fit: null,
};

export const DEFAULT_RESOLUTION = 'fullhd';

// Una página A4 apaisada, el tamaño que cualquiera puede imprimir.
const PAGE_LIMIT = { width: 842, height: 595 };

const LABEL_FONT = '600 13px "IBM Plex Sans Condensed", sans-serif';
const ADDRESS_FONT = '400 10px "IBM Plex Mono", monospace';
const LEGEND_FONT = '400 12px "IBM Plex Sans", sans-serif';
const WATERMARK_FONT = '500 11px "IBM Plex Mono", monospace';

// Dirección del visor, estampada en cada exportación para que la imagen diga de dónde salió.
export const SITE_URL = 'trenza.pages.dev';
const TITLE_FONT = '700 24px "IBM Plex Sans Condensed", sans-serif';
const SUBTITLE_FONT = '400 13px "IBM Plex Sans", sans-serif';

export const EXPORT_FORMATS = {
  png: { extension: 'png', mime: 'image/png' },
  jpg: { extension: 'jpg', mime: 'image/jpeg' },
  pdf: { extension: 'pdf', mime: 'application/pdf' },
};

export function suggestExportName(fileName) {
  return (fileName || 'red').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'red';
}

function measuringContext() {
  return document.createElement('canvas').getContext('2d');
}

function labelMeasurer(context) {
  return {
    nameWidth: (text) => {
      context.font = LABEL_FONT;
      return context.measureText(text).width;
    },
    addressWidth: (text) => {
      context.font = ADDRESS_FONT;
      return context.measureText(text).width;
    },
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
function planLegend(context, links, availableWidth) {
  const entries = LEGEND_ENTRIES.filter((entry) => new Set(links.map(threadFor)).has(entry.thread))
    .map((entry) => ({ ...entry, label: t(entry.key) }));

  if (entries.length === 0) return { entries, columns: 0, rows: 0, columnWidth: 0, height: 0 };

  context.font = LEGEND_FONT;
  const columnWidth = Math.ceil(Math.max(...entries.map((entry) => context.measureText(entry.label).width))) + 26 + 32;
  const columns = Math.max(1, Math.min(entries.length, Math.floor(availableWidth / columnWidth)));
  const rows = Math.ceil(entries.length / columns);

  return { entries, columns, rows, columnWidth, height: rows * LEGEND_ROW_HEIGHT };
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
    context.stroke(new Path2D(CATEGORY_GLYPHS[device.category] || CATEGORY_GLYPHS.other));
    context.restore();

    context.textAlign = 'center';
    if (shown.name) {
      context.fillStyle = palette.text;
      context.font = LABEL_FONT;
      context.fillText(device.name, x, y + 38);
    }

    const address = device.interfaces.flatMap((entry) => entry.addresses)[0];
    if (address && shown.address) {
      context.fillStyle = palette['text-faint'];
      context.font = ADDRESS_FONT;
      context.fillText(address.address, x, y + 52);
    }
  }
}

function drawTray(context, stray, positions, palette, { left, right, top }) {
  if (stray.length === 0) return;

  context.strokeStyle = palette.line;
  context.lineWidth = 1;
  context.setLineDash([2, 4]);
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(right, top);
  context.stroke();
  context.setLineDash([]);

  context.textAlign = 'left';
  context.fillStyle = palette['text-faint'];
  context.font = LEGEND_FONT;
  context.fillText(t('diagram.unconnected'), left, top + 16);
}

function watermarkWidth(context) {
  context.font = WATERMARK_FONT;
  return Math.ceil(context.measureText(SITE_URL).width);
}

function drawWatermark(context, palette, { right, bottom }) {
  context.textAlign = 'right';
  context.font = WATERMARK_FONT;
  context.fillStyle = palette['text-faint'];
  context.fillText(SITE_URL, right, bottom);
  context.textAlign = 'left';
}

function drawCaption(context, { title, subtitle, palette, left, top }) {
  context.textAlign = 'left';
  context.fillStyle = palette.text;
  context.font = TITLE_FONT;
  context.fillText(title, left, top + 24);

  context.fillStyle = palette['text-muted'];
  context.font = SUBTITLE_FONT;
  context.fillText(subtitle, left, top + 46);
}

function drawLegend(context, legend, { palette, left, top }) {
  context.textAlign = 'left';
  context.font = LEGEND_FONT;

  legend.entries.forEach((entry, index) => {
    const x = left + (index % legend.columns) * legend.columnWidth;
    const y = top + Math.floor(index / legend.columns) * LEGEND_ROW_HEIGHT + 10;

    context.lineWidth = 2;
    context.strokeStyle = palette[entry.thread];
    context.beginPath();
    context.moveTo(x, y - 3);
    context.lineTo(x + 18, y - 3);
    context.stroke();

    context.strokeStyle = palette[`${entry.thread}-pale`];
    context.beginPath();
    context.moveTo(x, y + 1);
    context.lineTo(x + 18, y + 1);
    context.stroke();

    context.fillStyle = palette['text-muted'];
    context.fillText(entry.label, x + 26, y + 4);
  });
}

/**
 * Resuelve la geometría del diagrama sin dibujar nada: dónde va cada dispositivo y
 * qué etiquetas caben. Separarlo del dibujo permite preguntar por adelantado si una
 * resolución alcanza para mostrar la red entera.
 */
export function planExport(model, { showInfrastructure, resolution }) {
  const visible = selectVisible(model, showInfrastructure);
  if (visible.devices.length === 0) throw new Error(t('error.noDevices'));

  const { placed, stray } = partitionDevices(visible.devices, visible.links);
  const links = visible.links;

  const context2d = measuringContext();
  const measure = labelMeasurer(context2d);
  const halfWidth = (device) => halfLabelWidth(measure, device);
  const labelReach = Math.ceil(Math.max(...visible.devices.map(halfWidth)));

  const size = EXPORT_RESOLUTIONS[resolution];
  const frame = size
    ? fixedFrame(size, { context2d, links, stray, labelReach })
    : adaptiveFrame({ context2d, placed, links, stray, labelReach, halfWidth });

  const positions = projectIntoRect(placed, frame.content);
  for (const [id, point] of trayPositions(stray, frame.tray, {
    x: MARGIN,
    y: frame.trayTop,
    width: frame.width - MARGIN * 2,
  })) {
    positions.set(id, point);
  }

  const devices = [...placed, ...stray];
  const labels = planLabels(devices, positions, measure);

  // Sólo cuenta como oculto lo que existe y no se pudo dibujar: un dispositivo sin
  // dirección no deja ninguna etiqueta afuera.
  const hidden = devices.reduce((total, device) => {
    const shown = labels.get(device.id);
    const hasAddress = device.interfaces.some((entry) => entry.addresses.length > 0);
    return total + (shown.name ? 0 : 1) + (hasAddress && !shown.address ? 1 : 0);
  }, 0);

  return { frame, positions, labels, devices, links, stray, hidden };
}

/** Qué resoluciones alcanzan para dibujar la red entera, sin dejar ninguna etiqueta afuera. */
export function resolutionsThatFit(model, { showInfrastructure }) {
  return Object.fromEntries(
    Object.keys(EXPORT_RESOLUTIONS).map((resolution) => {
      try {
        return [resolution, planExport(model, { showInfrastructure, resolution }).hidden === 0];
      } catch {
        return [resolution, false];
      }
    }),
  );
}

/**
 * Dibuja la red completa en un lienzo. Con una resolución fija el lienzo es
 * exactamente ese y el diagrama se ajusta adentro; con `fit` el lienzo crece hasta
 * que las etiquetas dejan de pisarse.
 */
export async function renderNetworkToCanvas(model, options) {
  const { showInfrastructure, resolution, transparent, title, palette } = options;

  await document.fonts.ready;
  const plan = planExport(model, { showInfrastructure, resolution });
  const { frame, positions, labels, devices, links, stray } = plan;

  if (frame.width * frame.height > MAX_PIXELS) throw new Error(t('error.tooLarge'));

  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext('2d');

  if (!transparent) {
    context.fillStyle = palette.ground;
    context.fillRect(0, 0, frame.width, frame.height);
  }

  drawLinks(context, links, positions, palette);
  drawTray(context, stray, positions, palette, {
    left: MARGIN,
    right: frame.width - MARGIN,
    top: frame.trayTop,
  });
  drawNodes(context, devices, positions, palette, labels);
  drawCaption(context, {
    title,
    subtitle: t('export.caption', {
      devices: countOf('devices', devices.length),
      links: countOf('links', links.length),
    }),
    palette,
    left: MARGIN,
    top: MARGIN,
  });
  drawLegend(context, frame.legend, {
    palette,
    left: MARGIN,
    top: frame.height - MARGIN - frame.legend.height,
  });
  drawWatermark(context, palette, { right: frame.width - MARGIN, bottom: frame.height - MARGIN });

  return { canvas, frame, hidden: plan.hidden };
}

function bands(context2d, links, stray, width) {
  // La leyenda comparte la franja de abajo con la marca de agua, y no debe alcanzarla.
  const legend = planLegend(context2d, links, width - MARGIN * 2 - watermarkWidth(context2d) - 24);
  const tray = trayPlan(stray, width - MARGIN * 2);
  return { legend, tray };
}

/** El lienzo mide lo pedido y el diagrama se acomoda en lo que sobra. */
function fixedFrame(size, { context2d, links, stray, labelReach }) {
  const { legend, tray } = bands(context2d, links, stray, size.width);
  // Un margen lateral no puede comerse el lienzo, por larga que sea una etiqueta.
  const side = Math.min(MARGIN + labelReach, size.width * 0.22);
  const top = MARGIN + HEADER_HEIGHT + NODE_EXTENT.top;
  const bottom = MARGIN + legend.height + 16 + tray.height + NODE_EXTENT.bottom;

  return {
    width: size.width,
    height: size.height,
    legend,
    tray,
    trayTop: size.height - MARGIN - legend.height - 16 - tray.height,
    content: {
      x: side,
      y: top,
      width: Math.max(120, size.width - side * 2),
      height: Math.max(120, size.height - top - bottom),
    },
  };
}

/** El lienzo crece hasta que ninguna etiqueta se pisa con otra. */
function adaptiveFrame({ context2d, placed, links, stray, labelReach, halfWidth }) {
  const { spanX, spanY } = measureBounds(placed);
  const spread = Math.min(
    Math.max(spreadScaleFor(placed, halfWidth), MIN_CONTENT_WIDTH / spanX),
    MAX_CONTENT_WIDTH / spanX,
    MAX_CONTENT_HEIGHT / spanY,
  );

  const side = MARGIN + labelReach;
  const insets = {
    left: side,
    right: side,
    top: MARGIN + HEADER_HEIGHT + NODE_EXTENT.top,
    bottom: MARGIN + NODE_EXTENT.bottom + LEGEND_ROW_HEIGHT,
  };

  // Leyenda y bandeja se planifican antes de fijar el alto, porque sus filas
  // deciden cuánto espacio hay que reservar abajo.
  const provisional = frameForNetwork(placed, insets, spread);
  const { legend, tray } = bands(context2d, links, stray, provisional.width);

  const frame = frameForNetwork(placed, {
    ...insets,
    bottom: MARGIN + NODE_EXTENT.bottom + legend.height + 16 + tray.height,
  }, spread);

  return {
    ...frame,
    legend,
    tray,
    trayTop: frame.height - MARGIN - legend.height - 16 - tray.height,
  };
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

/** Genera el archivo con la red completa, no sólo con la parte visible en pantalla. */
export async function createNetworkExport(model, { format, name, resolution, transparent, showInfrastructure }) {
  const descriptor = EXPORT_FORMATS[format];
  if (!descriptor) throw new Error(t('error.unknownFormat', { format }));

  const { canvas, hidden } = await renderNetworkToCanvas(model, {
    showInfrastructure,
    resolution,
    transparent: transparent && format === 'png',
    title: name,
    palette: readPalette(),
  });

  // El PDF entra en una hoja imprimible; más píxeles suben la definición, no el tamaño.
  const pointsPerPixel = Math.min(0.75, PAGE_LIMIT.width / canvas.width, PAGE_LIMIT.height / canvas.height);
  const blob = format === 'pdf'
    ? await buildPdf(canvas, pointsPerPixel)
    : await canvasToBlob(canvas, descriptor.mime, format === 'jpg' ? 0.92 : undefined);

  return { blob, hidden, fileName: `${name}.${descriptor.extension}`, width: canvas.width, height: canvas.height };
}

export async function exportNetwork(model, options) {
  const result = await createNetworkExport(model, options);
  download(result.blob, result.fileName);
  return { ...result, bytes: result.blob.size };
}
