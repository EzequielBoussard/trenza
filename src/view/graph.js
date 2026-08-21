export const CATEGORY_GLYPHS = {
  router: 'M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3',
  switch: 'M3 9h18M3 15h18M8 9V5M16 15v4',
  wireless: 'M12 18h.01M8.5 14.5a5 5 0 0 1 7 0M5.5 11.5a9 9 0 0 1 13 0',
  server: 'M4 6h16v5H4zM4 13h16v5H4zM7.5 8.5h.01M7.5 15.5h.01',
  endpoint: 'M4 6h16v9H4zM9 19h6M12 15v4',
  cloud: 'M7 17a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5 3.5 3.5 0 0 1-.5 6.5z',
  security: 'M12 4l7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z',
  iot: 'M8 8h8v8H8zM10 5v3M14 5v3M10 16v3M14 16v3M5 10h3M5 14h3M16 10h3M16 14h3',
  infrastructure: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h6',
  other: 'M5 5h14v14H5z',
};

// Cada categoría toma un hilo del código T568B: el tono pleno para el contorno y
// el pálido para el símbolo interior.
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

/** Lee los colores desde las variables CSS para que diagrama y exportación coincidan. */
export function readPalette() {
  const styles = getComputedStyle(document.documentElement);
  const names = [
    'orange', 'orange-pale', 'green', 'green-pale', 'blue', 'blue-pale',
    'brown', 'brown-pale', 'neutral', 'neutral-pale',
    'ground', 'surface', 'raised', 'line', 'text', 'text-muted', 'text-faint',
  ];
  return Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(`--${name}`).trim()]));
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

/**
 * Separa los dispositivos que el archivo dejó apartados: sin ningún enlace y fuera
 * del rectángulo donde vive la red. Packet Tracer permite arrastrarlos a cualquier
 * rincón del espacio de trabajo, y uno solo a 3900 unidades aplasta todo el resto.
 */
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

/** Cuánto espacio pide la bandeja de apartados. Se necesita antes de fijar el lienzo. */
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

export function measureBounds(devices) {
  const xs = devices.map((device) => device.x);
  const ys = devices.map((device) => device.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, spanX: Math.max(...xs) - minX || 1, spanY: Math.max(...ys) - minY || 1 };
}

/** Reparte los dispositivos dentro de un rectángulo conservando la proporción original. */
export function projectIntoRect(devices, rect) {
  const { minX, minY, spanX, spanY } = measureBounds(devices);
  const scale = Math.min(rect.width / spanX, rect.height / spanY);
  const offsetX = rect.x + (rect.width - spanX * scale) / 2;
  const offsetY = rect.y + (rect.height - spanY * scale) / 2;

  return new Map(
    devices.map((device) => [
      device.id,
      { x: (device.x - minX) * scale + offsetX, y: (device.y - minY) * scale + offsetY },
    ]),
  );
}

// Geometría de la etiqueta de un dispositivo, medida desde su centro.
export const LABEL_GEOMETRY = {
  discRadius: 22,
  nameTop: 26,
  nameBottom: 42,
  addressTop: 43,
  addressBottom: 55,
  gap: 4,
};

/**
 * Escala mínima, en píxeles por unidad del archivo, para que ningún par de
 * dispositivos se pise. Dos vecinos alcanza con que se separen en un eje, así que
 * de cada par se toma el eje más barato y del conjunto, el caso peor.
 */
export function spreadScaleFor(devices, halfWidthOf, { verticalGap = 70, cap = 3.5 } = {}) {
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

/**
 * Decide qué etiquetas se dibujan. Los discos y los nombres tienen prioridad; una
 * dirección que se superpondría con algo ya reservado no se dibuja, porque dos
 * textos encimados no se leen ninguno de los dos.
 */
export function planLabels(devices, positions, { nameWidth, addressWidth }) {
  const reserved = [];
  const collides = (box) => reserved.some((other) =>
    box.x1 < other.x2 && box.x2 > other.x1 && box.y1 < other.y2 && box.y2 > other.y1);

  const ordered = [...devices].sort((a, b) => {
    const first = positions.get(a.id);
    const second = positions.get(b.id);
    return first.y - second.y || first.x - second.x;
  });

  for (const device of ordered) {
    const { x, y } = positions.get(device.id);
    reserved.push({
      x1: x - LABEL_GEOMETRY.discRadius,
      x2: x + LABEL_GEOMETRY.discRadius,
      y1: y - LABEL_GEOMETRY.discRadius,
      y2: y + LABEL_GEOMETRY.discRadius,
    });
  }

  const plan = new Map();

  for (const device of ordered) {
    const { x, y } = positions.get(device.id);
    const half = nameWidth(device.name) / 2 + LABEL_GEOMETRY.gap;
    const box = { x1: x - half, x2: x + half, y1: y + LABEL_GEOMETRY.nameTop, y2: y + LABEL_GEOMETRY.nameBottom };
    const visible = !collides(box);
    if (visible) reserved.push(box);
    plan.set(device.id, { name: visible, address: false });
  }

  for (const device of ordered) {
    const address = device.interfaces.flatMap((entry) => entry.addresses)[0];
    if (!address) continue;

    const { x, y } = positions.get(device.id);
    const half = addressWidth(address.address) / 2 + LABEL_GEOMETRY.gap;
    const box = { x1: x - half, x2: x + half, y1: y + LABEL_GEOMETRY.addressTop, y2: y + LABEL_GEOMETRY.addressBottom };
    if (collides(box)) continue;

    reserved.push(box);
    plan.get(device.id).address = true;
  }

  return plan;
}

/**
 * Calcula el lienzo a partir del área que ocupan los dispositivos a la escala
 * pedida, más los márgenes del título, la leyenda y las etiquetas.
 */
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
