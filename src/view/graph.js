// Símbolos de la convención de diagramas de red: cuatro flechas para el router, dos
// opuestas para el switch.
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
// 3900 unidades achicaba todo el resto.
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

// Medidas desde el centro del dispositivo. discRadius tiene que ser el del halo dibujado,
// y nameTop no puede ser menor que discRadius.
const LABEL_GEOMETRY = {
  discRadius: 26,
  nameTop: 26,
  nameBottom: 46,
  addressTop: 47,
  addressBottom: 59,
  gap: 5,
};

// Tipografía de las etiquetas, en unidades de diseño; la comparten el visor y el exporte.
// La dirección es la caja más ancha y la que fija la separación entre equipos, por eso va
// en condensada. El tamaño del nombre no cambia el reparto.
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
// nombre. Sin esto un exporte hecho antes del primer dibujado medía con la alternativa.
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

  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      const a = devices[i];
      const b = devices[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx === 0 && dy === 0) continue;

      const byX = dx > 0 ? (halfWidthOf(a) + halfWidthOf(b) + LABEL_GEOMETRY.gap * 2) / dx : Infinity;
      const byY = dy > 0 ? verticalGap / dy : Infinity;
      required = Math.max(required, Math.min(byX, byY));
    }
  }

  return Math.min(cap, required);
}

// La caché va en el medidor y no en el módulo: un medidor creado antes de que carguen las
// fuentes mide con la alternativa, y esas medidas no se pueden mezclar con las buenas.
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

// Más allá de esta distancia vertical dos dispositivos no pueden chocar, así que cada uno
// se prueba sólo contra sus vecinos.
const NEIGHBOURHOOD = LABEL_GEOMETRY.addressBottom + BLOCK_SLOTS[BLOCK_SLOTS.length - 1]
  + LABEL_GEOMETRY.discRadius;

// Asigna un renglón a cada bloque. Si no hay ninguno libre queda en el suyo marcado como
// `crowded`; nunca se esconde. Ojo: offset 0 es un valor válido, comparar contra null.
export function planLabels(devices, positions, measure) {
  const overlaps = (box, other) =>
    box.x1 < other.x2 && box.x2 > other.x1 && box.y1 < other.y2 && box.y2 > other.y1;

  // Contra el círculo, no contra su cuadrado.
  const touchesDisc = (box, disc) => {
    const dx = disc.x - Math.max(box.x1, Math.min(disc.x, box.x2));
    const dy = disc.y - Math.max(box.y1, Math.min(disc.y, box.y2));
    return dx * dx + dy * dy < LABEL_GEOMETRY.discRadius ** 2;
  };

  const ordered = [...devices].sort((a, b) => {
    const first = positions.get(a.id);
    const second = positions.get(b.id);
    return first.y - second.y || first.x - second.x;
  });

  const discs = ordered.map((device) => positions.get(device.id));
  const reserved = new Array(ordered.length);
  const plan = new Map();
  let first = 0;

  for (let i = 0; i < ordered.length; i++) {
    const device = ordered[i];
    const { x, y } = discs[i];
    const box = labelBox(device, measure);
    const half = box.half + LABEL_GEOMETRY.gap;
    const bottom = box.bottom;

    // Ventana de vecinos: se recorre en orden de altura, así que el borde de arriba sólo avanza.
    while (first < i && discs[first].y < y - NEIGHBOURHOOD) first++;
    let last = i;
    while (last + 1 < ordered.length && discs[last + 1].y <= y + NEIGHBOURHOOD) last++;

    const boxAt = (offset) => ({
      x1: x - half,
      x2: x + half,
      y1: y + LABEL_GEOMETRY.nameTop + offset,
      y2: y + bottom + offset,
    });

    const collides = (box) => {
      for (let j = first; j <= last; j++) {
        if (touchesDisc(box, discs[j])) return true;
        if (j < i && overlaps(box, reserved[j])) return true;
      }
      return false;
    };

    const free = BLOCK_SLOTS.find((offset) => !collides(boxAt(offset)));
    const offset = free ?? 0;

    // Se reserva aunque haya quedado encimada: se dibuja igual.
    reserved[i] = boxAt(offset);
    plan.set(device.id, { offset, crowded: free === undefined });
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
