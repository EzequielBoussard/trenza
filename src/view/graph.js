// Los símbolos siguen la convención que usa quien lee diagramas de red: el router lleva las
// cuatro flechas de «elige por dónde sale», y el switch, dos flechas opuestas de «cruza
// tráfico entre bocas». La dirección importa: sin flechas, dos rieles con topes se leen como
// el control de un ecualizador, que es de lo más común en cualquier interfaz.
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

// Los colores viven en variables CSS para que el diagrama en pantalla y la exportación
// sigan el mismo tema sin enterarse de cuál es.
const PALETTE_NAMES = [
  'orange', 'orange-pale', 'green', 'green-pale', 'blue', 'blue-pale',
  'brown', 'brown-pale', 'neutral', 'neutral-pale',
  'ground', 'surface', 'raised', 'line', 'text', 'text-muted', 'text-faint',
];

/**
 * Sin argumento devuelve los colores que se están viendo. Con uno, los del otro tema: las
 * variables cuelgan del elemento raíz, así que hay que ponérselo un instante. Nadie ve el
 * cambio, porque entre ponerlo y devolverlo no se cede el turno y el navegador no repinta.
 */
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

// De una pasada y sin desparramar el arreglo en argumentos: `Math.min(...xs)` arma dos
// arreglos intermedios por llamada, y esto se llama una vez por cada ancho que se prueba.
// Con muchos argumentos además desborda la pila, que es un límite absurdo para una red pero
// un límite al fin.
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

// Cuánto se admite estirar un eje respecto del otro al repartir la red. Casi ninguna red
// tiene la proporción del marco que le toca —ni la del visor, ni la de un 16:9— y sin esto
// el dibujo queda con franjas vacías. Estirar un esquema no lo falsea; deformarlo al doble, sí.
export const LAYOUT_STRETCH = 1.75;

/**
 * Reparte los dispositivos dentro de un rectángulo. `stretch` es cuánto se admite estirar
 * un eje respecto del otro: con 1 la red conserva su proporción y, si el rectángulo tiene
 * otra, quedan franjas vacías a los costados o arriba y abajo; por encima de 1 la red se
 * reparte hasta llenarlas. Es un esquema, no un plano: separar más los equipos en un eje
 * no dice nada falso sobre la red.
 */
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

// Geometría del bloque de etiqueta, medida desde el centro del dispositivo. El radio es el
// del halo que se dibuja, no uno menor: con 22 reservados sobre un disco de 26, una
// dirección podía apoyarse en el anillo de afuera y quedar tapada por él. Y `nameTop` no
// puede bajar de ese radio: el nombre quedaría dentro del disco y chocaría con él siempre.
const LABEL_GEOMETRY = {
  discRadius: 26,
  nameTop: 26,
  nameBottom: 46,
  addressTop: 47,
  addressBottom: 59,
  gap: 5,
};

/**
 * El cuerpo de las etiquetas y dónde apoyan sus renglones, en unidades de diseño. Lo
 * comparten el visor y la exportación, que son el mismo dibujo a distinta escala.
 *
 * Lo que decide cuánto hay que separar los equipos es la caja más ancha de cada bloque, y
 * ésa es la de la dirección en sesenta de los setenta y un equipos del showcase. De ahí
 * salen los cuatro valores:
 *
 * - La dirección va en condensada y no en monoespaciada. Una dirección tiene trece
 *   caracteres, así que su ancho es lo único que fija el reparto, y en condensada el mismo
 *   ancho alcanza para dos puntos más de cuerpo. Alinear dígitos, que es para lo que sirve
 *   la monoespaciada, no aporta nada en una etiqueta suelta centrada bajo un icono; en la
 *   tabla de paquetes, donde sí hay columnas que alinear, se sigue usando.
 * - El nombre viaja gratis: no fija el reparto, así que subirlo no obliga a separar nada.
 *   Entre 17 y 24 el lienzo no se mueve ni una unidad, y a partir de ahí es sólo una
 *   cuestión de proporción contra el icono.
 *
 * Las dos líneas de base están donde la tinta entra justa en la caja reservada: el nombre
 * ocupa de 27 a 45 y la dirección de 49 a 57, medidos desde el centro del dispositivo.
 */
export const LABEL_TYPE = {
  nameSize: 20,
  addressSize: 11,
  nameBaseline: 41,
  addressBaseline: 57,
};

// Las familias son las mismas que declara la hoja de estilos, alternativas incluidas: lo
// que se mide para repartir tiene que ser lo que después se dibuja, y si la tipografía no
// llegara a cargar, medir contra otra alternativa repartiría la red para una letra que
// nadie va a ver.
const CONDENSED = "'IBM Plex Sans Condensed', 'Arial Narrow', system-ui, sans-serif";
export const LABEL_FONT = `600 ${LABEL_TYPE.nameSize}px ${CONDENSED}`;
export const ADDRESS_FONT = `500 ${LABEL_TYPE.addressSize}px ${CONDENSED}`;

/**
 * `document.fonts.ready` promete que terminó lo que estaba cargando, no que esté cargada
 * una familia que todavía nadie pidió. La condensada la usa el diagrama y nada más, así
 * que un exporte lanzado antes de haber dibujado uno medía con la alternativa y repartía
 * la red en 2722 unidades en vez de 3097, con una etiqueta rozando a otra. Pedirlas por
 * nombre sí lo garantiza, y no cuesta nada cuando ya están. Si no llegan —sin red, o con
 * la hoja de fuentes bloqueada— se mide con la alternativa, que es la que se va a ver.
 */
export async function labelFontsReady() {
  if (!document.fonts) return;
  try {
    await Promise.all([document.fonts.load(LABEL_FONT), document.fonts.load(ADDRESS_FONT)]);
  } catch {
    // Sin la tipografía preferida se dibuja con la alternativa; medirla es lo correcto.
  }
}

// Nombre y dirección son una sola pieza y se corren juntos: separarlos dejaba la dirección
// flotando lejos de su nombre, sin que se supiera de quién era. Cuando el lugar de siempre
// está ocupado, el bloque entero baja un renglón, lo justo para pasar por debajo del que ya
// estaba ahí.
const BLOCK_STEP = 36;
const BLOCK_SLOTS = [0, BLOCK_STEP, BLOCK_STEP * 2];

/** Lo que un bloque sobresale hacia abajo cuando le toca el último renglón. */
export const LABEL_REACH_BELOW = LABEL_GEOMETRY.addressBottom + BLOCK_SLOTS[BLOCK_SLOTS.length - 1];

/**
 * Escala mínima, en píxeles por unidad del archivo, para que ningún par de
 * dispositivos se pise. Dos vecinos alcanza con que se separen en un eje, así que
 * de cada par se toma el eje más barato y del conjunto, el caso peor.
 */
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

/**
 * Lo que mide la etiqueta de un dispositivo no depende de dónde caiga: sale de su nombre,
 * de su primera dirección y del cuerpo de letra. La búsqueda del ancho llama a `planLabels`
 * una vez por candidato —treinta veces en una red típica—, así que sin guardarlo cada
 * dispositivo aplana sus interfaces treinta veces para sacar siempre la misma dirección.
 *
 * Lo guardado cuelga del medidor y no de un mapa suelto del módulo, y la diferencia no es
 * cosmética: las tipografías llegan por la red, y un medidor creado antes de que lleguen
 * mide con la alternativa. Compartiendo el mapa, esa medida vieja se le colaba al exporte,
 * que sí espera a que carguen: la red del showcase salía repartida en 2722 unidades en vez
 * de 3097, con una etiqueta rozando a otra. Cada medidor guarda lo suyo.
 */
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

/**
 * Mitad de la etiqueta más ancha de un dispositivo: lo que sobresale a cada lado de su
 * icono. Es lo que hay que dejar libre en los bordes para que no quede cortada, y lo que
 * hay que separar entre dos vecinos para que no se toquen.
 */
export function halfLabelWidth(device, measure) {
  return labelBox(device, measure).half;
}

// Hasta dónde llega la influencia de un dispositivo hacia arriba y hacia abajo: lo que
// ocupa su bloque en el último renglón, más el radio del disco. Dos dispositivos separados
// por más que esto no pueden tocarse pase lo que pase, y ése es el corte que convierte la
// prueba de choque de «cada uno contra todos» en «cada uno contra sus vecinos».
const NEIGHBOURHOOD = LABEL_GEOMETRY.addressBottom + BLOCK_SLOTS[BLOCK_SLOTS.length - 1]
  + LABEL_GEOMETRY.discRadius;

/**
 * Decide a qué altura va el bloque de cada dispositivo. Si su lugar está ocupado baja al
 * siguiente renglón, y si no queda ninguno libre se dibuja igual en el suyo: una etiqueta
 * que aparece y desaparece al acercarse molesta más que dos que se rozan. `crowded` marca
 * las que quedaron encimadas, que es de lo que la exportación se guía para darle más lugar
 * al dibujo hasta que no quede ninguna.
 *
 * Se recorre de arriba abajo y cada uno se prueba sólo contra los que tiene cerca en
 * vertical. Probarlo contra todos es cuadrático y se paga completo en cada candidato de
 * ancho: en una red de trescientos equipos eran 1,73 ms por pasada y 48 ms por reparto.
 */
export function planLabels(devices, positions, measure) {
  const overlaps = (box, other) =>
    box.x1 < other.x2 && box.x2 > other.x1 && box.y1 < other.y2 && box.y2 > other.y1;

  // El disco es redondo: una caja que sólo alcanza la esquina de su cuadrado no lo toca de
  // verdad, y descartar por eso un lugar que servía cuesta hasta once píxeles en diagonal.
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

    // La ventana de vecinos. Como se recorre en orden de altura, su borde de arriba sólo
    // avanza, y el de abajo se busca desde ahí.
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
      // Su propio disco entra en la cuenta, como antes: es lo que hace valer que `nameTop`
      // no pueda bajar del radio, porque si bajara todo bloque chocaría con su propio icono.
      for (let j = first; j <= last; j++) {
        if (touchesDisc(box, discs[j])) return true;
        if (j < i && overlaps(box, reserved[j])) return true;
      }
      return false;
    };

    const free = BLOCK_SLOTS.find((offset) => !collides(boxAt(offset)));
    const offset = free ?? 0;

    // La caja se reserva aunque haya quedado encimada: la tinta está ahí igual, y el
    // que venga después tiene que contar con ella.
    reserved[i] = boxAt(offset);
    plan.set(device.id, { offset, crowded: free === undefined });
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
