import { countOf, t } from '../i18n.js';
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
  LAYOUT_STRETCH,
  projectIntoRect,
  selectVisible,
  threadFor,
  trayPlan,
  trayPositions,
} from './graph.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Ancho del lienzo en unidades de diseño. Se usa el más chico en el que las etiquetas no se
// pisan; el zoom después sólo agranda, no vuelve a repartir.
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

// El recorrido es una sola fila, así que las cuatro flechas avanzan o retroceden de a uno.
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

const MIN_SCALE = 0.35;
const MAX_SCALE = 6;

// Constante de tiempo, en ms, de la animación de los botones de zoom. La rueda y el
// pellizco no se animan porque se sienten con retraso.
const GLIDE_TAU = 45;

// Una muesca de rueda manda deltaY 100 y acerca ×1,17.
const WHEEL_SENSITIVITY = 0.0016;

// El pellizco del trackpad llega como rueda con Ctrl y deltas mucho más chicos.
const PINCH_SENSITIVITY = 0.01;


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

function control(label, title, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'zoom__button';
  button.textContent = label;
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
      const { x, y, scale } = this.target;
      if (x !== 0 || y !== 0 || scale !== 1) return;
      if (Math.abs(Math.log(this.panelAspect() / this.aspect)) < RESHAPE_THRESHOLD) return;
      this.render(this.last.model, { showInfrastructure: this.last.showInfrastructure });
    });
    this.shapeWatcher.observe(this.container);
  }

  // Una vista reemplazada seguía recibiendo avisos del observador y volvía a poner su leyenda.
  destroy() {
    this.shapeWatcher.disconnect();
    if (this.legend) this.legend.remove();
    this.legend = null;
    this.last = null;
  }

  render(model, { showInfrastructure }) {
    if (!this.container.isConnected) return;

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

    // Los equipos sueltos van a una bandeja al pie. Uno solo lejos del resto achicaba toda la red.
    const { placed, stray } = partitionDevices(visible, links);
    const devices = [...placed, ...stray];
    this.aspect = this.panelAspect();
    const { width, height, positions, plan, tray, trayTop, side } = this.layoutFor(placed, stray, this.aspect);

    // `group` y no `img`, para que el lector de pantalla pueda recorrer los equipos.
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

    for (const link of links) {
      const from = positions.get(link.from);
      const to = positions.get(link.to);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      // El desplazamiento perpendicular convierte cada enlace en un par de hilos.
      const offsetX = (-dy / length) * 1.6;
      const offsetY = (dx / length) * 1.6;

      const group = element('g', {
        class: `link link--${threadFor(link)}${link.functional ? '' : ' link--down'}`,
        'data-from': link.from,
        'data-to': link.to,
      });
      group.append(
        element('line', {
          class: 'link__strand link__strand--solid',
          x1: from.x + offsetX, y1: from.y + offsetY, x2: to.x + offsetX, y2: to.y + offsetY,
        }),
        element('line', {
          class: 'link__strand link__strand--pale',
          x1: from.x - offsetX, y1: from.y - offsetY, x2: to.x - offsetX, y2: to.y - offsetY,
        }),
      );

      const tooltip = element('title');
      tooltip.textContent = `${link.fromPort} ↔ ${link.toPort}`;
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
        'aria-pressed': 'false',
        'aria-label': address
          ? `${device.name}, ${t(`category.${device.category}`)}, ${address.address}`
          : `${device.name}, ${t(`category.${device.category}`)}`,
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

    // Las flechas siguen el orden de lectura, no el de dibujo.
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

    this.attachNavigation(svg);
    this.resetView();
    if (this.selectedId) this.highlight(this.selectedId);
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

    const attempt = (width) => {
      const height = Math.round(width / aspect);
      const trayWidth = width - side * 2;
      const tray = trayPlan(stray, trayWidth);
      const trayTop = height - VIEW_INSETS.bottom - tray.height;

      const positions = projectIntoRect(placed, {
        x: side,
        y: VIEW_INSETS.top,
        width: trayWidth,
        height: trayTop - VIEW_INSETS.top,
      }, { stretch: LAYOUT_STRETCH });
      for (const [id, point] of trayPositions(stray, tray, { x: side, y: trayTop, width: trayWidth })) {
        positions.set(id, point);
      }

      const plan = planLabels(devices, positions, this.measure);

      // Una etiqueta encimada pesa 1000 y una bajada de renglón, 1.
      const untidiness = devices.reduce((total, device) => {
        const spot = plan.get(device.id);
        return total + (spot.crowded ? 1000 : 0) + (spot.offset > 0 ? 1 : 0);
      }, 0);

      return { width, height, positions, plan, tray, trayTop, side, untidiness };
    };

    // Gana el primer ancho prolijo, que es el más chico. Si ninguno llega a 0, el de menor puntaje.
    let best = attempt(MIN_VIEW_WIDTH);
    for (let width = MIN_VIEW_WIDTH + VIEW_STEP; width <= MAX_VIEW_WIDTH && best.untidiness > 0; width += VIEW_STEP) {
      const candidate = attempt(width);
      if (candidate.untidiness < best.untidiness) best = candidate;
    }
    return best;
  }

  buildControls() {
    const group = document.createElement('div');
    group.className = 'zoom';
    group.append(
      control('+', t('zoom.in'), () => this.zoomBy(1.25)),
      control('−', t('zoom.out'), () => this.zoomBy(1 / 1.25)),
      control('◱', t('zoom.fit'), () => this.resetView()),
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

    for (const button of this.container.querySelectorAll('.legend__item')) {
      const own = button.dataset.thread === this.thread;
      button.classList.toggle('is-active', own);
      button.setAttribute('aria-pressed', String(own));
    }
    for (const link of this.svg.querySelectorAll('.link')) {
      link.classList.toggle('is-active', link.classList.contains(`link--${this.thread}`));
    }
    this.svg.classList.toggle('has-selection', Boolean(this.thread));
  }

  attachNavigation(svg) {
    let dragging = null;
    let origin = null;

    // Los eventos de rueda se acumulan y se aplican una vez por cuadro: getScreenCTM fuerza
    // un recálculo de layout en cada llamada.
    let turning = null;
    const applyTurn = () => {
      const { factor, focus } = turning;
      turning = null;
      this.zoomTo(this.target.scale * factor, focus);
      this.settle();
    };

    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      const gain = event.ctrlKey ? PINCH_SENSITIVITY : WHEEL_SENSITIVITY;

      if (!turning) {
        turning = { factor: 1, focus: null, matrix: svg.getScreenCTM().inverse() };
        requestAnimationFrame(applyTurn);
      }
      turning.factor *= Math.exp(-delta * gain);
      turning.focus = this.pointerInScene(event, turning.matrix);
    }, { passive: false });

    // Safari manda gesture* además de wheel. Sin esto acerca la página entera.
    let pinch = 1;
    svg.addEventListener('gesturestart', (event) => {
      event.preventDefault();
      pinch = event.scale;
    });
    svg.addEventListener('gesturechange', (event) => {
      event.preventDefault();
      this.zoomTo(this.target.scale * (event.scale / pinch), this.pointerInScene(event));
      this.settle();
      pinch = event.scale;
    });

    svg.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.node')) return;
      dragging = { x: event.clientX, y: event.clientY };
      origin = dragging;
      svg.setPointerCapture(event.pointerId);
      svg.classList.add('is-panning');
    });

    svg.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      // La escala sale de la matriz: con otra proporción, el ancho del elemento no sirve.
      const ratio = 1 / svg.getScreenCTM().a;
      this.target.x += (event.clientX - dragging.x) * ratio;
      this.target.y += (event.clientY - dragging.y) * ratio;
      dragging = { x: event.clientX, y: event.clientY };
      this.settle();
    });

    // Soltar sin moverse más de 5 px, fuera de un nodo, limpia la selección.
    const endDrag = (event) => {
      const click = origin
        && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 5
        && !event.target.closest('.node');

      dragging = null;
      origin = null;
      svg.classList.remove('is-panning');
      if (click) this.onClear();
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
  }

  pointerInScene(event, matrix) {
    return new DOMPoint(event.clientX, event.clientY)
      .matrixTransform(matrix ?? this.svg.getScreenCTM().inverse());
  }

  // Acerca dejando quieto `focus`. Se calcula sobre el destino para que dos ruedas seguidas
  // se sumen en vez de pelearse con la animación.
  zoomTo(scale, focus) {
    const previous = this.target.scale;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    if (next === previous) return false;

    const anchor = focus ?? { x: this.frame.width / 2, y: this.frame.height / 2 };
    const ratio = next / previous;
    this.target = {
      x: anchor.x - (anchor.x - this.target.x) * ratio,
      y: anchor.y - (anchor.y - this.target.y) * ratio,
      scale: next,
    };
    return true;
  }

  zoomBy(factor) {
    if (this.zoomTo(this.target.scale * factor)) this.glide();
  }

  // Avance exponencial por tiempo, no por cuadro: igual a 60 Hz que a 144.
  glide() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.settle();
      return;
    }
    if (this.gliding) return;

    let last = performance.now();
    const step = (now) => {
      const share = 1 - Math.exp(-(now - last) / GLIDE_TAU);
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
  }

  resetView() {
    this.target = { x: 0, y: 0, scale: 1 };
    this.settle();
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
  bringIntoView(id) {
    const position = this.positions.get(id);
    if (!position || !this.frame) return;

    const { x, y, scale } = this.target;
    const at = { x: position.x * scale + x, y: position.y * scale + y };
    const shift = (value, limit) => {
      if (value < FOCUS_MARGIN) return FOCUS_MARGIN - value;
      if (value > limit - FOCUS_MARGIN) return limit - FOCUS_MARGIN - value;
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

  // Desde otro control: sólo actualiza el diagrama.
  focus(id) {
    this.selectedId = id;
    this.highlight(id);
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
      node.setAttribute('aria-pressed', String(own));
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
      node.setAttribute('aria-pressed', 'false');
    }
  }
}
