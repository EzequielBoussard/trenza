import { countOf, getLocale, t } from '../i18n.js';
import {
  ADDRESS_FONT,
  CATEGORY_GLYPHS,
  LABEL_FONT,
  LABEL_REACH_BELOW,
  LABEL_TYPE,
  LEGEND_ENTRIES,
  halfLabelWidth,
  labelFontsReady,
  partitionDevices,
  planLabels,
  projectIntoRect,
  selectVisible,
  threadFor,
  tidiestWidth,
  trayPlan,
  trayPositions,
  untidiness,
} from './graph.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Ancho del lienzo en unidades de diseño: el más chico en el que las etiquetas no se pisan.
// Después el zoom sólo agranda; el reparto queda fijo.
const MIN_VIEW_WIDTH = 900;
const MAX_VIEW_WIDTH = 5200;

// La prolijidad no es monótona con el ancho, así que no se puede bisecar. Barrer todo el
// rango de a 50 cuesta unos 33 ms en el peor caso.
const VIEW_STEP = 50;

// El lienzo toma la proporción del panel para no dejar franjas vacías. Un teléfono apaisado
// llega a 4,09, de ahí el tope de arriba.
const FALLBACK_ASPECT = 1.6;
const MIN_VIEW_ASPECT = 0.6;
const MAX_VIEW_ASPECT = 4.5;

// Cambio de proporción del panel, en logaritmo, a partir del cual se rehace el reparto.
const RESHAPE_THRESHOLD = 0.12;

// En pantalla se estira más que en el exporte: los paneles de teléfono son altos y las redes,
// apaisadas. Con 2,5 el ejemplo pasa de 42 % a 59 % del alto a 375 px, con la misma letra.
const VIEW_STRETCH = 2.5;

// Con la casa se reparte ante cualquier cambio que se note: ahí nadie está mirando de cerca.
const FIT_TOLERANCE = 0.02;

// El recorrido es una sola fila, así que las 4 flechas avanzan o retroceden de a uno.
const ARROW_STEPS = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: -Infinity,
  End: Infinity,
};

// Margen al traer a la vista el equipo enfocado, para que su etiqueta no quede cortada.
const FOCUS_MARGIN = 80;

// Abajo tiene que entrar la etiqueta en el renglón más bajo al que puede bajar. El margen de
// los costados se calcula: es la mitad de la etiqueta más ancha.
const VIEW_INSETS = { top: 70, bottom: LABEL_REACH_BELOW + 6 };
const VIEW_SIDE_MARGIN = 40;

// Por debajo de 0,5 el diagrama entero ya entra con aire de sobra; alejar más sólo lo achica.
const MIN_SCALE = 0.5;
const MAX_SCALE = 6;

// Constante de tiempo, en ms, de la animación de los botones de zoom. La rueda y el
// pellizco no se animan porque se sienten con retraso.
const GLIDE_TAU = 45;

// La vuelta al límite después de soltar es más lenta, para que se lea como un rebote.
const SNAP_TAU = 90;

// Radio del aro del nodo más un respiro: al menos un equipo tiene que verse entero.
const NODE_REACH = 36;

// Hasta cuántos píxeles se puede estirar la vista más allá del límite al arrastrar.
const OVERSCROLL = 70;

// Movimiento, en píxeles, por debajo del cual soltar cuenta como clic.
const CLICK_SLOP = 5;

// Una muesca de rueda manda deltaY 100 y acerca ×1,17.
const WHEEL_SENSITIVITY = 0.0016;

// El pellizco del trackpad llega como rueda con Ctrl y deltas mucho más chicos.
const PINCH_SENSITIVITY = 0.01;

// Tope por evento: con Ctrl, la muesca de un mouse (100) usaría la ganancia del pellizco.
const WHEEL_NOTCH = 100 * WHEEL_SENSITIVITY;

// Separación de la trama de fondo, en píxeles, con la vista de apertura.
const GRID_SPACING = 28;

function element(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

// Cada texto se mide una vez: la búsqueda del ancho reparte la red decenas de veces.
function labelMeasurer() {
  const context = document.createElement('canvas').getContext('2d');
  const measured = (font) => {
    const widths = new Map();
    return (text) => {
      if (!widths.has(text)) {
        context.font = font;
        widths.set(text, context.measureText(text).width);
      }
      return widths.get(text);
    };
  };

  return { nameWidth: measured(LABEL_FONT), addressWidth: measured(ADDRESS_FONT) };
}

// Una casa para volver a la vista de apertura, con la red entera.
function homeIcon() {
  const icon = element('svg', { viewBox: '0 0 24 24', class: 'zoom__icon', 'aria-hidden': 'true', focusable: 'false' });
  icon.append(element('path', { d: 'M4 11.5 12 4.5l8 7M6.5 9.5v10h4v-5.5h3v5.5h4v-10' }));
  return icon;
}

function control(label, title, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'zoom__button';
  button.append(label);
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('click', action);
  return button;
}

export class TopologyView {
  constructor(container, { onSelect, onClear, legendHost }) {
    this.container = container;
    this.legendHost = legendHost || container;
    this.onSelect = onSelect;
    this.onClear = onClear;
    this.transform = { x: 0, y: 0, scale: 1 };
    this.target = { x: 0, y: 0, scale: 1 };
    this.gliding = 0;
    this.selectedId = null;
    this.thread = null;
    this.nodes = new Map();
    this.order = [];
    this.measure = labelMeasurer();
    this.watchPanelShape();
    this.watchFonts();
  }

  // Si las fuentes llegan después del primer dibujado, las medidas estaban hechas con la
  // alternativa (hasta 19 % más angosta). Se reparte de nuevo, sólo con la vista sin tocar.
  watchFonts() {
    labelFontsReady().then(() => {
      if (!this.last) return;
      const { x, y, scale } = this.target;
      if (x !== 0 || y !== 0 || scale !== 1) return;
      this.measure = labelMeasurer();
      this.render(this.last.model, { showInfrastructure: this.last.showInfrastructure });
    });
  }

  // Rehace el reparto si el panel cambia bastante de forma, pero sólo con la vista sin tocar.
  watchPanelShape() {
    // Hay que guardar la referencia: si no, el observador se recolecta y deja de avisar.
    this.shapeWatcher = new ResizeObserver(() => {
      if (!this.last || !this.aspect) return;
      this.measurePixels();
      this.applyTransform();
      const { x, y, scale } = this.target;
      if (x !== 0 || y !== 0 || scale !== 1) return;
      if (Math.abs(Math.log(this.panelAspect() / this.aspect)) < RESHAPE_THRESHOLD) return;
      this.render(this.last.model, { showInfrastructure: this.last.showInfrastructure });
    });
    this.shapeWatcher.observe(this.container);
  }

  // Sin desconectar el observador, una vista reemplazada vuelve a poner su leyenda.
  destroy() {
    this.shapeWatcher.disconnect();
    if (this.legend) this.legend.remove();
    this.legend = null;
    this.last = null;
  }

  // `keepView`: en otro idioma el reparto sale igual, y si el lienzo mide lo mismo la vista sigue.
  render(model, { showInfrastructure, keepView = false }) {
    if (!this.container.isConnected) return;

    const kept = keepView && this.frame ? { view: { ...this.target }, frame: this.frame } : null;
    this.last = { model, showInfrastructure };
    const { devices: visible, links } = selectVisible(model, showInfrastructure);

    this.container.replaceChildren();
    // La leyenda está fuera del contenedor, así que replaceChildren no se la lleva.
    if (this.legend) this.legend.remove();
    this.legend = null;
    if (visible.length === 0) return;

    // Va antes de medir el panel, porque le quita alto.
    this.legend = this.buildLegend(links);
    if (this.legend) this.legendHost.append(this.legend);

    // Los equipos sueltos van a una bandeja al pie: uno solo lejos del resto achica toda la red.
    const { placed, stray } = partitionDevices(visible, links);
    const devices = [...placed, ...stray];
    this.aspect = this.panelAspect();
    const { width, height, positions, plan, tray, trayTop, side } = this.layoutFor(placed, stray, this.aspect);

    // `group`: el lector de pantalla puede entrar y recorrer los equipos.
    const svg = element('svg', {
      viewBox: `0 0 ${width} ${height}`,
      class: 'topology',
      role: 'group',
      'aria-label': t('export.caption', {
        devices: countOf('devices', devices.length),
        links: countOf('links', links.length),
      }),
    });

    const scene = element('g', { class: 'topology__scene' });
    const linkLayer = element('g', { class: 'topology__links' });
    const nodeLayer = element('g', { class: 'topology__nodes' });

    if (stray.length > 0) {
      const divider = element('g', { class: 'tray' });
      divider.append(element('line', {
        class: 'tray__rule', x1: side, y1: trayTop, x2: width - side, y2: trayTop,
      }));
      const caption = element('text', { class: 'tray__caption', x: side, y: trayTop + 16 });
      caption.textContent = t('diagram.unconnected');
      divider.append(caption);
      scene.append(divider);
    }

    const names = new Map(visible.map((device) => [device.id, device.name]));
    const meters = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 });
    for (const link of links) {
      const from = positions.get(link.from);
      const to = positions.get(link.to);
      const thread = threadFor(link);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      // El desplazamiento perpendicular convierte cada enlace en un par de hilos.
      const offsetX = (-dy / length) * 1.6;
      const offsetY = (dx / length) * 1.6;

      const group = element('g', {
        class: `link link--${thread}${link.functional ? '' : ' link--down'}`,
        'data-from': link.from,
        'data-to': link.to,
      });
      group.append(
        // Invisible y ancho: un hilo de 1,4 unidades es imposible de apuntar para ver su aviso.
        element('line', { class: 'link__hit', x1: from.x, y1: from.y, x2: to.x, y2: to.y }),
        element('line', {
          class: 'link__strand link__strand--solid',
          x1: from.x + offsetX, y1: from.y + offsetY, x2: to.x + offsetX, y2: to.y + offsetY,
        }),
        element('line', {
          class: 'link__strand link__strand--pale',
          x1: from.x - offsetX, y1: from.y - offsetY, x2: to.x - offsetX, y2: to.y - offsetY,
        }),
      );

      const cable = LEGEND_ENTRIES.find((entry) => entry.thread === thread);
      const details = [
        `${names.get(link.from)} ${link.fromPort} ↔ ${names.get(link.to)} ${link.toPort}`,
        t(cable.key),
      ];
      if (link.length > 0) details.push(`${meters.format(link.length)} m`);
      const tooltip = element('title');
      tooltip.textContent = details.join(' · ');
      group.append(tooltip);
      linkLayer.append(group);
    }

    const nodes = new Map();
    devices.forEach((device) => {
      const position = positions.get(device.id);
      const address = device.interfaces.flatMap((entry) => entry.addresses)[0];
      const node = element('g', {
        class: `node node--${device.category}`,
        transform: `translate(${position.x} ${position.y})`,
        'data-id': device.id,
        // Tabindex móvil: una sola parada para todo el diagrama, las flechas mueven entre equipos.
        tabindex: '-1',
        role: 'button',
        // Primero lo que se ve escrito, para que quien maneja por voz pueda nombrarlo.
        'aria-label': [device.name, address?.address, t(`category.${device.category}`)].filter(Boolean).join(', '),
      });

      node.append(
        element('circle', { class: 'node__ring', r: 31 }),
        element('circle', { class: 'node__halo', r: 26 }),
        element('circle', { class: 'node__disc', r: 18 }),
        element('path', {
          class: 'node__glyph',
          d: CATEGORY_GLYPHS[device.category] || CATEGORY_GLYPHS.other,
          transform: 'translate(-12 -12)',
        }),
      );

      const labels = element('g', {
        class: 'node__labels',
        transform: `translate(0 ${plan.get(device.id).offset})`,
      });
      const label = element('text', { class: 'node__label', y: LABEL_TYPE.nameBaseline, 'text-anchor': 'middle' });
      label.textContent = device.name;
      labels.append(label);

      if (address) {
        const addressLabel = element('text', { class: 'node__address', y: LABEL_TYPE.addressBaseline, 'text-anchor': 'middle' });
        addressLabel.textContent = address.address;
        labels.append(addressLabel);
      }
      node.append(labels);

      const select = () => this.select(device.id);
      node.addEventListener('click', select);
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
          return;
        }
        const step = ARROW_STEPS[event.key];
        if (step === undefined) return;
        event.preventDefault();
        this.moveFocus(device.id, step);
      });

      nodes.set(device.id, node);
      nodeLayer.append(node);
    });
    this.nodes = nodes;

    // Las flechas siguen el orden de lectura: por filas, de izquierda a derecha.
    this.order = devices
      .map((device) => ({ id: device.id, ...positions.get(device.id) }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((entry) => entry.id);
    this.setTabStop(this.selectedId && this.order.includes(this.selectedId) ? this.selectedId : this.order[0]);

    scene.append(linkLayer, nodeLayer);
    svg.append(scene);
    this.container.append(svg, this.buildControls());

    this.svg = svg;
    this.scene = scene;
    this.devices = devices;
    this.positions = positions;
    this.frame = { width, height };
    // El centro del lienzo entra en el rectángulo: la vista de apertura tiene que ser válida.
    const points = [...positions.values(), { x: width / 2, y: height / 2 }];
    this.bounds = {
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    };
    this.measurePixels();

    this.attachNavigation(svg);
    if (kept && kept.frame.width === width && kept.frame.height === height) {
      this.target = kept.view;
      this.settle();
    } else {
      this.resetView();
    }
    if (this.selectedId) this.highlight(this.selectedId);
    else if (this.thread) this.paintThread();
    if (this.matches) this.markMatches(this.matches);
  }

  panelAspect() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return FALLBACK_ASPECT;
    return Math.min(MAX_VIEW_ASPECT, Math.max(MIN_VIEW_ASPECT, width / height));
  }

  // Si alguna etiqueta se pisa, agranda el lienzo y vuelve a probar. No se esconde ninguna.
  layoutFor(placed, stray, aspect) {
    const devices = [...placed, ...stray];

    let reach = 0;
    for (const device of devices) reach = Math.max(reach, halfLabelWidth(device, this.measure));
    const side = Math.ceil(reach) + VIEW_SIDE_MARGIN;

    const attempt = (width, limit) => {
      const height = Math.round(width / aspect);
      const trayWidth = width - side * 2;
      const tray = trayPlan(stray, trayWidth);
      const trayTop = height - VIEW_INSETS.bottom - tray.height;

      const positions = projectIntoRect(placed, {
        x: side,
        y: VIEW_INSETS.top,
        width: trayWidth,
        height: trayTop - VIEW_INSETS.top,
      }, { stretch: VIEW_STRETCH });
      for (const [id, point] of trayPositions(stray, tray, { x: side, y: trayTop, width: trayWidth })) {
        positions.set(id, point);
      }

      const plan = planLabels(devices, positions, this.measure, limit);
      return plan && { width, height, positions, plan, tray, trayTop, side, untidiness: untidiness(plan) };
    };

    const widths = [];
    for (let width = MIN_VIEW_WIDTH; width <= MAX_VIEW_WIDTH; width += VIEW_STEP) widths.push(width);
    return tidiestWidth(widths, attempt);
  }

  buildControls() {
    const group = document.createElement('div');
    group.className = 'zoom';
    group.append(
      control('+', t('zoom.in'), () => this.zoomBy(1.25)),
      control('−', t('zoom.out'), () => this.zoomBy(1 / 1.25)),
      control(homeIcon(), t('zoom.fit'), () => this.fit()),
    );
    return group;
  }

  // Cada entrada de la leyenda filtra los cables de su tipo.
  buildLegend(links) {
    const used = new Set(links.map(threadFor));
    const legend = document.createElement('ul');
    legend.className = 'legend';

    for (const entry of LEGEND_ENTRIES) {
      if (!used.has(entry.thread)) continue;

      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `legend__item legend__item--${entry.thread}`;
      button.dataset.thread = entry.thread;
      button.setAttribute('aria-pressed', 'false');

      const swatch = document.createElement('span');
      swatch.className = 'legend__swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.textContent = t(entry.key);

      button.append(swatch, text);
      button.addEventListener('click', () => this.highlightThread(entry.thread));
      item.append(button);
      legend.append(item);
    }
    return legend.childElementCount > 0 ? legend : null;
  }

  highlightThread(thread) {
    const next = this.thread === thread ? null : thread;

    // Limpia la selección de equipo. Va antes porque limpiar también apaga los cables.
    if (next) this.onClear();

    this.thread = next;
    this.paintThread();
  }

  paintThread() {
    if (!this.svg) return;

    for (const button of this.legend?.querySelectorAll('.legend__item') ?? []) {
      const own = button.dataset.thread === this.thread;
      button.classList.toggle('is-active', own);
      button.setAttribute('aria-pressed', String(own));
    }
    this.legend?.classList.toggle('has-active', Boolean(this.thread));
    for (const link of this.svg.querySelectorAll('.link')) {
      link.classList.toggle('is-active', link.classList.contains(`link--${this.thread}`));
    }
    this.svg.classList.toggle('has-selection', Boolean(this.thread));
  }

  attachNavigation(svg) {
    // Un puntero arrastra, 2 pellizcan. `raw` es la vista sin límite que va pidiendo el
    // gesto; lo que se muestra es esa vista frenada contra el límite.
    const pointers = new Map();
    let origin = null;
    let raw = null;
    let spread = null;
    let panning = false;

    // Sobre un equipo el arrastre empieza recién pasados CLICK_SLOP píxeles, para que tocarlo
    // siga siendo elegirlo. La captura va al empezar: con ella el clic ya no llega al equipo.
    const startPan = () => {
      if (panning) return;
      panning = true;
      for (const id of pointers.keys()) svg.setPointerCapture(id);
      svg.classList.add('is-panning');
    };

    const spreadOf = () => {
      const [a, b] = pointers.values();
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 };
    };

    // Los eventos de rueda se acumulan y se aplican una vez por cuadro: getScreenCTM fuerza
    // un recálculo de layout en cada llamada.
    let turning = null;
    const applyTurn = () => {
      const { factor, focus, shift } = turning;
      turning = null;
      if (factor !== 1) this.zoomTo(this.target.scale * factor, focus);
      this.target = this.clampView({ ...this.target, x: this.target.x + shift });
      this.settle();
    };

    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      const lines = event.deltaMode === 1 ? 16 : 1;

      if (!turning) {
        turning = { factor: 1, focus: null, shift: 0, matrix: svg.getScreenCTM().inverse() };
        requestAnimationFrame(applyTurn);
      }
      // Con Alt la rueda desplaza a lo ancho.
      if (event.altKey) {
        turning.shift -= (event.deltaY + event.deltaX) * lines * turning.matrix.a;
        return;
      }
      const gain = event.ctrlKey ? PINCH_SENSITIVITY : WHEEL_SENSITIVITY;
      const turn = Math.min(WHEEL_NOTCH, Math.max(-WHEEL_NOTCH, event.deltaY * lines * gain));
      turning.factor *= Math.exp(-turn);
      turning.focus = this.pointerInScene(event, turning.matrix);
    }, { passive: false });

    // Safari manda gesture* además de wheel; sin esto acerca la página entera. En iOS el
    // pellizco ya llega como 2 punteros, así que acá sólo se atiende el del trackpad.
    let pinch = 1;
    svg.addEventListener('gesturestart', (event) => {
      event.preventDefault();
      pinch = event.scale;
    });
    svg.addEventListener('gesturechange', (event) => {
      event.preventDefault();
      if (pointers.size < 2) {
        this.zoomTo(this.target.scale * (event.scale / pinch), this.pointerInScene(event));
        this.target = this.clampView(this.target);
        this.settle();
      }
      pinch = event.scale;
    });

    svg.addEventListener('pointerdown', (event) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 1) {
        // Si todavía estaba volviendo al límite, se agarra desde donde se ve.
        this.target = { ...this.transform };
        this.settle();
        raw = { ...this.target };
        origin = { x: event.clientX, y: event.clientY, onNode: Boolean(event.target.closest('.node')) };
        if (!origin.onNode) startPan();
      } else {
        spread = spreadOf();
        startPan();
      }
    });

    svg.addEventListener('pointermove', (event) => {
      const last = pointers.get(event.pointerId);
      if (!last) return;
      if (!panning) {
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < CLICK_SLOP) return;
        startPan();
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      // La escala sale de la matriz: con otra proporción, el ancho del elemento no sirve.
      const ratio = 1 / svg.getScreenCTM().a;
      if (pointers.size === 1) {
        raw.x += (event.clientX - last.x) * ratio;
        raw.y += (event.clientY - last.y) * ratio;
      } else {
        const next = spreadOf();
        raw.x += (next.clientX - spread.clientX) * ratio;
        raw.y += (next.clientY - spread.clientY) * ratio;
        if (spread.distance > 0) raw = this.zoomView(raw, raw.scale * (next.distance / spread.distance), this.pointerInScene(next));
        spread = next;
      }
      this.target = this.stretchView(raw, ratio);
      this.settle();
    });

    // Soltar sin haberse movido, fuera de un equipo, limpia la selección.
    const endDrag = (event) => {
      if (!pointers.delete(event.pointerId)) return;
      if (pointers.size === 1) spread = null;
      if (pointers.size > 0) return;

      const click = origin
        && !origin.onNode
        && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < CLICK_SLOP;

      origin = null;
      raw = null;
      panning = false;
      svg.classList.remove('is-panning');
      if (click) this.onClear();

      const limited = this.clampView(this.target);
      if (limited.x !== this.target.x || limited.y !== this.target.y) {
        this.target = limited;
        this.glide(SNAP_TAU);
      }
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    // Si el navegador suelta la captura por su cuenta, el puntero no puede quedar colgado.
    svg.addEventListener('lostpointercapture', endDrag);
  }

  pointerInScene(event, matrix) {
    return new DOMPoint(event.clientX, event.clientY)
      .matrixTransform(matrix ?? this.svg.getScreenCTM().inverse());
  }

  // Acerca dejando quieto `focus`.
  zoomView(view, scale, focus) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const anchor = focus ?? { x: this.frame.width / 2, y: this.frame.height / 2 };
    const ratio = next / view.scale;
    return {
      x: anchor.x - (anchor.x - view.x) * ratio,
      y: anchor.y - (anchor.y - view.y) * ratio,
      scale: next,
    };
  }

  // Se calcula sobre el destino para que 2 ruedas seguidas se sumen en vez de pelearse
  // con la animación.
  zoomTo(scale, focus) {
    const next = this.zoomView(this.target, scale, focus);
    if (next.scale === this.target.scale) return false;
    this.target = next;
    return true;
  }

  zoomBy(factor) {
    if (!this.zoomTo(this.target.scale * factor)) return;
    this.target = this.clampView(this.target);
    this.glide();
  }

  // La vista más cercana a `view` con al menos un equipo entero y el centro de la pantalla dentro
  // de la red: el rectángulo de cada equipo recortado por el de la red, y el más cercano.
  clampView(view) {
    if (!this.positions || !this.frame) return view;
    const { scale } = view;
    const { width, height } = this.frame;
    const { minX, maxX, minY, maxY } = this.bounds;
    const margin = NODE_REACH * scale;
    const within = (value, low, high) => Math.min(high, Math.max(low, value));

    let best = null;
    for (const point of this.positions.values()) {
      const x = within(
        view.x,
        Math.max(margin - point.x * scale, width / 2 - maxX * scale),
        Math.min(width - margin - point.x * scale, width / 2 - minX * scale),
      );
      const y = within(
        view.y,
        Math.max(margin - point.y * scale, height / 2 - maxY * scale),
        Math.min(height - margin - point.y * scale, height / 2 - minY * scale),
      );
      const distance = Math.hypot(x - view.x, y - view.y);
      if (distance === 0) return view;
      if (!best || distance < best.distance) best = { x, y, distance };
    }
    return { x: best.x, y: best.y, scale: view.scale };
  }

  // Pasado el límite la vista sigue al dedo cada vez menos, hasta OVERSCROLL píxeles.
  // `ratio` convierte píxeles de pantalla en unidades del lienzo.
  stretchView(view, ratio) {
    const limited = this.clampView(view);
    const reach = OVERSCROLL * ratio;
    const resist = (excess) => Math.sign(excess) * reach * (1 - 1 / (Math.abs(excess) / reach + 1));
    return {
      x: limited.x + resist(view.x - limited.x),
      y: limited.y + resist(view.y - limited.y),
      scale: view.scale,
    };
  }

  // Avance exponencial medido en tiempo: igual a 60 Hz que a 144.
  glide(tau = GLIDE_TAU) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.settle();
      return;
    }
    if (this.gliding) return;

    let last = performance.now();
    const step = (now) => {
      const share = 1 - Math.exp(-(now - last) / tau);
      last = now;

      const done = ['x', 'y', 'scale'].every((axis) => Math.abs(this.target[axis] - this.transform[axis]) < 0.01);
      if (done) {
        this.transform = { ...this.target };
        this.gliding = 0;
      } else {
        for (const axis of ['x', 'y', 'scale']) {
          this.transform[axis] += (this.target[axis] - this.transform[axis]) * share;
        }
        this.gliding = requestAnimationFrame(step);
      }
      this.applyTransform();
    };

    this.gliding = requestAnimationFrame(step);
  }

  settle() {
    if (this.gliding) cancelAnimationFrame(this.gliding);
    this.gliding = 0;
    this.transform = { ...this.target };
    this.applyTransform();
  }

  applyTransform() {
    if (!this.scene) return;
    const { x, y, scale } = this.transform;
    this.scene.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);

    // Propiedades del contenedor: una variable CSS se heredaría y recalcularía el SVG entero.
    const { ratio, left, top } = this.pixels;
    const spacing = GRID_SPACING * scale;
    this.container.style.setProperty('background-size', `${spacing}px ${spacing}px`);
    this.container.style.setProperty('background-position', `${left + x * ratio}px ${top + y * ratio}px`);
  }

  // Píxeles por unidad del lienzo y dónde empieza, con la franja que deja `meet` si sobra panel.
  measurePixels() {
    const { width, height } = this.svg.getBoundingClientRect();
    const ratio = Math.min(width / this.frame.width, height / this.frame.height) || 1;
    this.pixels = { ratio, left: (width - this.frame.width * ratio) / 2, top: (height - this.frame.height * ratio) / 2 };
  }

  resetView() {
    this.target = { x: 0, y: 0, scale: 1 };
    this.settle();
  }

  // El botón de la casa. Si el panel cambió de forma desde el último reparto, volver a la vista
  // vieja dejaría franjas vacías: se reparte de nuevo.
  fit() {
    if (this.last && Math.abs(Math.log(this.panelAspect() / this.aspect)) > FIT_TOLERANCE) {
      // Repartir rehace los controles: el foco vuelve a la casa nueva.
      const focused = this.container.contains(document.activeElement);
      this.render(this.last.model, { showInfrastructure: this.last.showInfrastructure });
      if (focused) this.container.querySelector('.zoom__button:last-child')?.focus();
    } else {
      this.resetView();
    }
  }

  setTabStop(id) {
    if (!this.nodes || !this.nodes.has(id)) return;
    for (const [own, node] of this.nodes) node.setAttribute('tabindex', own === id ? '0' : '-1');
  }

  moveFocus(from, step) {
    const at = this.order.indexOf(from);
    if (at < 0) return;
    const last = this.order.length - 1;
    const to = step === Infinity ? last : step === -Infinity ? 0 : Math.min(last, Math.max(0, at + step));
    const id = this.order[to];
    this.setTabStop(id);
    this.nodes.get(id).focus();
    this.bringIntoView(id);
  }

  // El zoom es una transformación, así que no hay scroll que el navegador pueda mover.
  bringIntoView(id, margin = FOCUS_MARGIN) {
    const position = this.positions?.get(id);
    if (!position || !this.frame) return;

    const { x, y, scale } = this.target;
    const at = { x: position.x * scale + x, y: position.y * scale + y };
    const shift = (value, limit) => {
      if (value < margin) return margin - value;
      if (value > limit - margin) return limit - margin - value;
      return 0;
    };

    const dx = shift(at.x, this.frame.width);
    const dy = shift(at.y, this.frame.height);
    if (dx === 0 && dy === 0) return;

    this.target = { x: x + dx, y: y + dy, scale };
    this.glide();
  }

  // Desde el diagrama: avisa al resto de la interfaz.
  select(id) {
    this.focus(id);
    this.onSelect(id);
  }

  // Desde otro control: actualiza el diagrama y, si el equipo quedó fuera de la vista, lo trae.
  focus(id) {
    this.selectedId = id;
    this.highlight(id);
    this.bringIntoView(id, NODE_REACH * this.target.scale);
  }

  highlight(id) {
    if (!this.svg) return;

    this.thread = null;
    this.paintThread();

    const neighbours = new Set([id]);
    for (const link of this.svg.querySelectorAll('.link')) {
      const touches = link.dataset.from === id || link.dataset.to === id;
      link.classList.toggle('is-active', touches);
      if (touches) {
        neighbours.add(link.dataset.from);
        neighbours.add(link.dataset.to);
      }
    }
    for (const node of this.svg.querySelectorAll('.node')) {
      const own = node.dataset.id === id;
      node.classList.toggle('is-selected', own);
      if (own) node.setAttribute('aria-current', 'true');
      else node.removeAttribute('aria-current');
      node.classList.toggle('is-neighbour', !own && neighbours.has(node.dataset.id));
      node.classList.toggle('is-dimmed', !neighbours.has(node.dataset.id));
    }
    this.setTabStop(id);
    this.svg.classList.add('has-selection');
  }

  clearSelection() {
    this.selectedId = null;
    this.thread = null;
    if (!this.svg) return;

    this.paintThread();
    for (const node of this.svg.querySelectorAll('.node')) {
      node.classList.remove('is-selected', 'is-neighbour', 'is-dimmed');
      node.removeAttribute('aria-current');
    }
  }

  // Lo que encuentra el buscador de la columna; con null el diagrama vuelve entero.
  markMatches(ids) {
    this.matches = ids;
    if (!this.svg) return;
    this.svg.classList.toggle('has-search', ids !== null);
    for (const node of this.svg.querySelectorAll('.node')) {
      node.classList.toggle('is-match', ids !== null && ids.has(node.dataset.id));
    }
  }
}
