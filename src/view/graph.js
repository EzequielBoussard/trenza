// Símbolos de la convención de diagramas de red: 4 flechas para el router, 2 opuestas para
// el switch.
export const CATEGORY_GLYPHS = {
  router: 'M3 12h18M12 3v18M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3',
  switch: 'M4 9h16M20 9l-3-3M20 9l-3 3M20 15H4M4 15l3-3M4 15l3 3',
  wireless: 'M12 18h.01M8.5 14.5a5 5 0 0 1 7 0M5.5 11.5a9 9 0 0 1 13 0',
  server: 'M4 6h16v5H4zM4 13h16v5H4zM7.5 8.5h.01M7.5 15.5h.01',
  endpoint: 'M4 6h16v9H4zM9 19h6M12 15v4',
  cloud: 'M7 17a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5 3.5 3.5 0 0 1-.5 6.5z',
  security: 'M12 4l7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z',
  iot: 'M8 8h8v8H8zM10 5v3M14 5v3M10 16v3M14 16v3M5 10h3M5 14h3M16 10h3M16 14h3',
  infrastructure: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h6',
  other: 'M5 5h14v14H5z',
};

// De la puerta hacia adentro: así se lee la red, desde la salida a Internet hasta los equipos.
export const CATEGORY_ORDER = ['cloud', 'router', 'security', 'switch', 'wireless', 'server', 'endpoint', 'iot', 'other', 'infrastructure'];

// Colores del código T568B: el pleno para el contorno y el pálido para el símbolo.
export const CATEGORY_THREADS = {
  router: ['orange', 'orange-pale'],
  switch: ['blue', 'blue-pale'],
  wireless: ['green', 'green-pale'],
  server: ['brown', 'brown-pale'],
  endpoint: ['blue-pale', 'blue-pale'],
  cloud: ['brown-pale', 'brown-pale'],
  security: ['orange-pale', 'orange-pale'],
  iot: ['green-pale', 'green-pale'],
  infrastructure: ['neutral', 'neutral-pale'],
  other: ['neutral', 'neutral-pale'],
};

const WIRING_THREADS = {
  eStraightThrough: 'orange',
  eCrossOver: 'green',
  eFiber: 'blue',
  eSerial: 'brown',
  eConsole: 'neutral',
  eCoaxial: 'brown',
  ePhone: 'neutral',
};

const MEDIA_THREADS = {
  eCopper: 'orange',
  eFiber: 'blue',
  eSerial: 'brown',
  eWireless: 'neutral',
  eCoaxial: 'brown',
  ePhone: 'neutral',
};

export const LEGEND_ENTRIES = [
  { thread: 'orange', key: 'legend.straight' },
  { thread: 'green', key: 'legend.crossover' },
  { thread: 'blue', key: 'legend.fiber' },
  { thread: 'brown', key: 'legend.serial' },
  { thread: 'neutral', key: 'legend.other' },
];

export function threadFor(link) {
  return WIRING_THREADS[link.wiring] || MEDIA_THREADS[link.media] || 'neutral';
}

// Variables CSS que se leen para exportar con los mismos colores que la pantalla.
const PALETTE_NAMES = [
  'orange', 'orange-pale', 'green', 'green-pale', 'blue', 'blue-pale',
  'brown', 'brown-pale', 'neutral', 'neutral-pale',
  'ground', 'surface', 'raised', 'line', 'text', 'text-muted', 'text-faint',
];

// Para leer los colores de otro tema se cambia el atributo del elemento raíz y se restaura
// en el mismo turno, sin que el navegador llegue a repintar.
export function readPalette(theme) {
  const root = document.documentElement;
  const previous = root.getAttribute('data-theme');
  const borrowed = theme !== undefined && theme !== previous;
  if (borrowed) root.setAttribute('data-theme', theme);

  try {
    const styles = getComputedStyle(root);
    return Object.fromEntries(PALETTE_NAMES.map((name) => [name, styles.getPropertyValue(`--${name}`).trim()]));
  } finally {
    if (borrowed) {
      if (previous === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previous);
    }
  }
}

export function selectVisible(model, showInfrastructure) {
  const devices = showInfrastructure
    ? model.devices
    : model.devices.filter((device) => device.category !== 'infrastructure');
  const present = new Set(devices.map((device) => device.id));
  const links = model.links.filter((link) => present.has(link.from) && present.has(link.to));
  return { devices, links };
}

const TRAY_SLOT = 160;
const TRAY_ROW_HEIGHT = 96;
const TRAY_HEADING = 26;

// Aparta los equipos sin enlaces que quedaron fuera del rectángulo de la red: uno solo a
// 3900 unidades achicaría todo el resto.
export function partitionDevices(devices, links) {
  const connected = new Set(links.flatMap((link) => [link.from, link.to]));
  const wired = devices.filter((device) => connected.has(device.id));
  if (wired.length < 2) return { placed: devices, stray: [] };

  const { minX, minY, spanX, spanY } = measureBounds(wired);
  const slackX = spanX * 0.15;
  const slackY = spanY * 0.15;

  const placed = [];
  const stray = [];
  for (const device of devices) {
    const apart = !connected.has(device.id)
      && (device.x < minX - slackX || device.x > minX + spanX + slackX
        || device.y < minY - slackY || device.y > minY + spanY + slackY);
    (apart ? stray : placed).push(device);
  }
  return { placed, stray };
}

export function trayPlan(stray, availableWidth) {
  if (stray.length === 0) return { columns: 0, rows: 0, height: 0 };
  const columns = Math.max(1, Math.min(stray.length, Math.floor(availableWidth / TRAY_SLOT)));
  const rows = Math.ceil(stray.length / columns);
  return { columns, rows, height: rows * TRAY_ROW_HEIGHT + TRAY_HEADING };
}

export function trayPositions(stray, plan, { x, y, width }) {
  const positions = new Map();
  stray.forEach((device, index) => {
    const row = Math.floor(index / plan.columns);
    const column = index % plan.columns;
    const inRow = Math.min(plan.columns, stray.length - row * plan.columns);
    const left = x + (width - inRow * TRAY_SLOT) / 2 + TRAY_SLOT / 2;
    positions.set(device.id, {
      x: left + column * TRAY_SLOT,
      y: y + TRAY_HEADING + row * TRAY_ROW_HEIGHT + 30,
    });
  });
  return positions;
}

// Sin Math.min(...xs): se llama una vez por ancho probado y el spread arma arreglos.
export function measureBounds(devices) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const device of devices) {
    if (device.x < minX) minX = device.x;
    if (device.x > maxX) maxX = device.x;
    if (device.y < minY) minY = device.y;
    if (device.y > maxY) maxY = device.y;
  }

  return { minX, minY, spanX: maxX - minX || 1, spanY: maxY - minY || 1 };
}

// Cuánto puede estirarse un eje respecto del otro para llenar el marco sin franjas vacías.
export const LAYOUT_STRETCH = 1.75;

// Con stretch = 1 se conserva la proporción de la red; por encima de 1 se estira hasta
// llenar el rectángulo.
export function projectIntoRect(devices, rect, { stretch = 1 } = {}) {
  const { minX, minY, spanX, spanY } = measureBounds(devices);
  const fit = Math.min(rect.width / spanX, rect.height / spanY);
  const scaleX = Math.min(rect.width / spanX, fit * stretch);
  const scaleY = Math.min(rect.height / spanY, fit * stretch);
  const offsetX = rect.x + (rect.width - spanX * scaleX) / 2;
  const offsetY = rect.y + (rect.height - spanY * scaleY) / 2;

  return new Map(
    devices.map((device) => [
      device.id,
      { x: (device.x - minX) * scaleX + offsetX, y: (device.y - minY) * scaleY + offsetY },
    ]),
  );
}

// Medidas desde el centro del equipo. discRadius tiene que ser el del halo dibujado,
// y nameTop no puede ser menor que discRadius.
const LABEL_GEOMETRY = {
  discRadius: 26,
  nameTop: 26,
  nameBottom: 46,
  addressTop: 47,
  addressBottom: 59,
  gap: 5,
};

// Tipografía de las etiquetas, compartida por visor y exporte. La dirección es la caja más
// ancha y fija la separación entre equipos: por eso va en condensada.
export const LABEL_TYPE = {
  nameSize: 20,
  addressSize: 11,
  nameBaseline: 41,
  addressBaseline: 57,
};

// Tienen que coincidir con las de styles.css, alternativas incluidas.
const CONDENSED = "'IBM Plex Sans Condensed', 'Arial Narrow', system-ui, sans-serif";
export const LABEL_FONT = `600 ${LABEL_TYPE.nameSize}px ${CONDENSED}`;
export const ADDRESS_FONT = `500 ${LABEL_TYPE.addressSize}px ${CONDENSED}`;

// document.fonts.ready no carga una familia que nadie pidió todavía, así que se piden por
// nombre. Sin esto un exporte hecho antes del primer dibujado mide con la alternativa.
export async function labelFontsReady() {
  if (!document.fonts) return;
  try {
    await Promise.all([document.fonts.load(LABEL_FONT), document.fonts.load(ADDRESS_FONT)]);
  } catch {
    // Si no cargan se dibuja con la alternativa, y se mide con ella.
  }
}

// Nombre y dirección se mueven juntos. Si su lugar está ocupado, el bloque baja un renglón.
const BLOCK_STEP = 36;
const BLOCK_SLOTS = [0, BLOCK_STEP, BLOCK_STEP * 2];

export const LABEL_REACH_BELOW = LABEL_GEOMETRY.addressBottom + BLOCK_SLOTS[BLOCK_SLOTS.length - 1];

// Escala mínima para que ningún par se pise. Alcanza con separarlos en un eje, así que de
// cada par se toma el más barato y del conjunto, el peor caso.
export function spreadScaleFor(devices, halfWidthOf, { verticalGap = 76, cap = 3.5 } = {}) {
  let required = 0;

  // Por altura: un par con más separación vertical que verticalGap / required ya no puede
  // subir el máximo, y a partir de ahí tampoco los que siguen.
  const sorted = [...devices].sort((a, b) => a.y - b.y);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const dx = Math.abs(a.x - b.x);
      const dy = b.y - a.y;
      if (required > 0 && dy >= verticalGap / required) break;
      if (dx === 0 && dy === 0) continue;

      const byX = dx > 0 ? (halfWidthOf(a) + halfWidthOf(b) + LABEL_GEOMETRY.gap * 2) / dx : Infinity;
      const byY = dy > 0 ? verticalGap / dy : Infinity;
      required = Math.max(required, Math.min(byX, byY));
    }
  }

  return Math.min(cap, required);
}

// La caché vive en cada medidor: uno creado antes de que carguen las fuentes mide con la
// alternativa, y esas medidas no se pueden mezclar con las buenas.
function labelBox(device, measure) {
  let boxes = measure.boxes;
  if (!boxes) {
    boxes = new WeakMap();
    measure.boxes = boxes;
  }

  let box = boxes.get(device);
  if (box) return box;

  let address = '';
  for (const entry of device.interfaces) {
    if (entry.addresses.length > 0) { address = entry.addresses[0].address; break; }
  }

  box = {
    half: Math.max(measure.nameWidth(device.name), address ? measure.addressWidth(address) : 0) / 2,
    bottom: address ? LABEL_GEOMETRY.addressBottom : LABEL_GEOMETRY.nameBottom,
  };
  boxes.set(device, box);
  return box;
}

export function halfLabelWidth(device, measure) {
  return labelBox(device, measure).half;
}

// Más allá de esta distancia vertical 2 equipos no pueden chocar.
const NEIGHBOURHOOD = LABEL_GEOMETRY.addressBottom + BLOCK_SLOTS[BLOCK_SLOTS.length - 1]
  + LABEL_GEOMETRY.discRadius;

// Una etiqueta encimada pesa 1000 y una bajada de renglón, 1.
export function untidiness(plan) {
  let total = 0;
  for (const spot of plan.values()) total += (spot.crowded ? 1000 : 0) + (spot.offset > 0 ? 1 : 0);
  return total;
}

// Si aun con el ancho mayor queda encimada más de 1 etiqueta de cada 10, afinar el ancho de a un
// paso no se nota, y con miles de equipos son segundos: se prueba 1 ancho de cada 4.
const CROWDED_SHARE = 0.1;
const COARSE_STRIDE = 4;

// El ancho más chico con todas las etiquetas en su renglón; si no hay, el de menor desorden.
// La primera pasada corta cada intento en la primera etiqueta corrida, que suele estar arriba.
export function tidiestWidth(widths, attempt, labelCount) {
  for (const width of widths) {
    const tidy = attempt(width, 1);
    if (tidy) return tidy;
  }
  // Ninguno prolijo: del más ancho al más angosto, donde el mejor aparece pronto y poda más. Con
  // el límite en empate + 1, entre empatados gana el más angosto.
  const descending = [...widths].reverse();
  let best = attempt(descending[0], Infinity);
  const crowded = Math.floor(best.untidiness / 1000);
  const stride = crowded > labelCount * CROWDED_SHARE ? COARSE_STRIDE : 1;
  for (let at = stride; at < descending.length; at += stride) {
    best = attempt(descending[at], best.untidiness + 1) ?? best;
  }
  return best;
}

// Un renglón por bloque; sin renglón libre queda en el suyo como `crowded`. El offset 0 vale:
// comparar contra null. Con `limit` devuelve null apenas el desorden lo alcanza.
export function planLabels(devices, positions, measure, limit = Infinity) {
  const order = devices
    .map((device) => ({ device, disc: positions.get(device.id) }))
    .sort((a, b) => a.disc.y - b.disc.y || a.disc.x - b.disc.x);
  const ordered = order.map((entry) => entry.device);
  const discs = order.map((entry) => entry.disc);

  const count = ordered.length;
  const reserved = new Array(count);
  const plan = new Map();
  let penalty = 0;

  // Celdas del ancho del choque más largo posible: cada bloque se prueba sólo contra las 9
  // vecinas. Sin ellas, una fila de 100 equipos a la misma altura se prueba entera con cada uno.
  let reach = 0;
  for (const device of ordered) reach = Math.max(reach, labelBox(device, measure).half);
  const cellWidth = 2 * (reach + LABEL_GEOMETRY.gap) + LABEL_GEOMETRY.discRadius;
  const columns = discs.map(({ x }) => Math.floor(x / cellWidth));
  const rows = discs.map(({ y }) => Math.floor(y / NEIGHBOURHOOD));

  // Clave numérica, con una celda de margen para las vecinas del borde: armar una cadena por
  // vecina costaba más que probar los choques.
  let firstColumn = Infinity;
  let lastColumn = -Infinity;
  let firstRow = Infinity;
  for (let i = 0; i < count; i++) {
    firstColumn = Math.min(firstColumn, columns[i] - 1);
    lastColumn = Math.max(lastColumn, columns[i] + 1);
    firstRow = Math.min(firstRow, rows[i] - 1);
  }
  const span = lastColumn - firstColumn + 1;
  const keyOf = (column, row) => (row - firstRow) * span + column - firstColumn;
  const cells = new Map();
  for (let i = 0; i < count; i++) {
    const key = keyOf(columns[i], rows[i]);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }

  const radius = LABEL_GEOMETRY.discRadius ** 2;
  // Contra el círculo, porque su cuadrado sobra en las esquinas; y contra los bloques ya puestos.
  const collides = (x1, x2, y1, y2, around, i) => {
    for (const cell of around) {
      for (const j of cell) {
        const disc = discs[j];
        const dx = disc.x - Math.max(x1, Math.min(disc.x, x2));
        const dy = disc.y - Math.max(y1, Math.min(disc.y, y2));
        if (dx * dx + dy * dy < radius) return true;
        const other = reserved[j];
        if (j < i && x1 < other.x2 && x2 > other.x1 && y1 < other.y2 && y2 > other.y1) return true;
      }
    }
    return false;
  };

  for (let i = 0; i < count; i++) {
    const device = ordered[i];
    const { x, y } = discs[i];
    const box = labelBox(device, measure);
    const half = box.half + LABEL_GEOMETRY.gap;

    const around = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = cells.get(keyOf(columns[i] + dx, rows[i] + dy));
        if (cell) around.push(cell);
      }
    }

    const x1 = x - half;
    const x2 = x + half;
    const free = BLOCK_SLOTS.find((offset) =>
      !collides(x1, x2, y + LABEL_GEOMETRY.nameTop + offset, y + box.bottom + offset, around, i));
    const offset = free ?? 0;

    // Se reserva aunque haya quedado encimada: se dibuja igual.
    reserved[i] = { x1, x2, y1: y + LABEL_GEOMETRY.nameTop + offset, y2: y + box.bottom + offset };
    plan.set(device.id, { offset, crowded: free === undefined });

    penalty += (free === undefined ? 1000 : 0) + (offset > 0 ? 1 : 0);
    if (penalty >= limit) return null;
  }

  return plan;
}

export function frameForNetwork(devices, insets, scale) {
  const { spanX, spanY } = measureBounds(devices);
  const contentWidth = Math.round(spanX * scale);
  const contentHeight = Math.round(spanY * scale);

  return {
    width: contentWidth + insets.left + insets.right,
    height: contentHeight + insets.top + insets.bottom,
    content: { x: insets.left, y: insets.top, width: contentWidth, height: contentHeight },
  };
}
