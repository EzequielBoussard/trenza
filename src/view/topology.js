import { countOf, t } from '../i18n.js';
import {
  ADDRESS_FONT,
  CATEGORY_GLYPHS,
  LABEL_FONT,
  LABEL_REACH_BELOW,
  LABEL_TYPE,
  LEGEND_ENTRIES,
  halfLabelWidth,
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

// El visor reparte la red en un lienzo propio: el más chico donde todas las etiquetas
// tienen lugar limpio. Después el SVG lo lleva al tamaño del panel, y el zoom se mueve por
// dentro de un dibujo ya resuelto, así que acercarse no hace aparecer ni desaparecer nada,
// sólo agranda. Cuanto más chico el lienzo, más grandes salen los iconos y los textos.
const MIN_VIEW_WIDTH = 900;
const MAX_VIEW_WIDTH = 5200;

// Cuánto se agranda el lienzo entre un intento y el siguiente. Los huecos donde el reparto
// queda prolijo son angostos y no vienen en orden, así que un paso grueso los saltea: con
// escalones de trescientas unidades, la red del showcase pasaba de 2400 —que ya estaba
// limpia— a 3664, un tercio de cuerpo de letra tirado. Cada intento cuesta cuatro décimas
// de milisegundo, así que recorrer el rango entero de a cincuenta son 33 ms en el peor caso.
const VIEW_STEP = 50;

// El lienzo toma la proporción del panel donde va a entrar. Con una fija sobraba: un
// lienzo apaisado dentro de un panel casi cuadrado entraba por el ancho y dejaba 312 px
// de los 812 en blanco, y el dibujo se achicaba para caber en la parte que sí usaba. Los
// topes son por si el panel queda con una forma imposible, que ahí estirar la red no
// arregla nada. Sin panel medido —oculto o recién creado— vale la proporción de siempre.
const FALLBACK_ASPECT = 1.6;
const MIN_VIEW_ASPECT = 0.6;
const MAX_VIEW_ASPECT = 2.6;

// Cuánto tiene que cambiar la forma del panel para que valga la pena rehacer el reparto,
// medido en logaritmo para que ensanchar y angostar pesen igual. 0,12 son un 13 %.
const RESHAPE_THRESHOLD = 0.12;

// Márgenes del área de dibujo. Arriba alcanza con el halo del nodo. Abajo tiene que caber el
// bloque de nombre y dirección en el último renglón al que puede bajar, que es lo que mide
// `LABEL_REACH_BELOW`: con noventa, la etiqueta de un equipo de la fila de abajo se dibujaba
// fuera del lienzo y el SVG la recortaba —cinco píxeles de la dirección de dos equipos en un
// panel de 768×349—, y encima era otro número que el exporte, que sí reservaba lo que hace
// falta. A los costados no hay número fijo: es la mitad de la etiqueta más ancha, medida.
const VIEW_INSETS = { top: 70, bottom: LABEL_REACH_BELOW + 6 };
const VIEW_SIDE_MARGIN = 40;

const MIN_SCALE = 0.35;
const MAX_SCALE = 6;

// Cuánto tarda la vista en alcanzar el destino cuando se anima, que es sólo al usar los
// botones. La rueda y el pellizco no se animan: ahí el gesto ya marca el ritmo y cualquier
// suavizado encima se siente como retraso.
const GLIDE_TAU = 45;

// Cuánto se demora la entrada de cada dispositivo respecto del anterior, y a partir de
// cuándo deja de demorarse: en una red de setenta equipos, el último no puede esperar
// casi un segundo para aparecer.
const REVEAL_STEP = 12;
const REVEAL_CAP = 420;

// Cuánto acerca cada unidad de rueda. Una muesca de ratón manda 100 y da un paso de 1,17.
const WHEEL_SENSITIVITY = 0.0016;

// El pellizco del trackpad llega como rueda con Control apretado y avisos mucho más chicos,
// así que necesita más ganancia para que el gesto recorra la misma distancia.
const PINCH_SENSITIVITY = 0.01;


function element(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/**
 * Buscar el lienzo obliga a repartir la red hasta quince veces, y en cada pasada se
 * consulta el ancho de cada nombre y de cada dirección. Los cuerpos son fijos, así que
 * cada cadena se mide una sola vez y las demás pasadas salen de la tabla.
 */
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
  constructor(container, { onSelect, onClear }) {
    this.container = container;
    this.onSelect = onSelect;
    this.onClear = onClear;
    this.transform = { x: 0, y: 0, scale: 1 };
    this.target = { x: 0, y: 0, scale: 1 };
    this.gliding = 0;
    this.selectedId = null;
    this.thread = null;
    this.measure = labelMeasurer();
    this.watchPanelShape();
  }

  /**
   * El lienzo se calcula para la forma del panel, así que un panel con otra forma pide otro
   * lienzo. Se rehace sólo si la vista está sin tocar: rehacer el reparto mueve todo de
   * lugar, y hacérselo a alguien que estaba mirando algo de cerca molesta más que la franja
   * que evita. Un cambio chico tampoco cuenta, que no vale la pena por unos píxeles.
   */
  watchPanelShape() {
    // El observador se guarda: sin una referencia viva el navegador lo recolecta y deja de
    // avisar, así que el reparto se quedaba con la forma que tuviera el panel al abrir el
    // archivo. Al primer aviso todavía no hay nada dibujado, y ahí no hay qué rehacer.
    this.shapeWatcher = new ResizeObserver(() => {
      if (!this.last || !this.aspect) return;
      const { x, y, scale } = this.target;
      if (x !== 0 || y !== 0 || scale !== 1) return;
      if (Math.abs(Math.log(this.panelAspect() / this.aspect)) < RESHAPE_THRESHOLD) return;
      this.render(this.last.model, { showInfrastructure: this.last.showInfrastructure });
    });
    this.shapeWatcher.observe(this.container);
  }

  render(model, { showInfrastructure }) {
    this.last = { model, showInfrastructure };
    const { devices: visible, links } = selectVisible(model, showInfrastructure);

    this.container.replaceChildren();
    if (visible.length === 0) return;

    // Los apartados van a una bandeja al pie: si entraran al encuadre general, uno
    // solo tirado en un rincón del espacio de trabajo aplastaría toda la red.
    const { placed, stray } = partitionDevices(visible, links);
    const devices = [...placed, ...stray];
    this.aspect = this.panelAspect();
    const { width, height, positions, plan, tray, trayTop, side } = this.layoutFor(placed, stray, this.aspect);

    const svg = element('svg', {
      viewBox: `0 0 ${width} ${height}`,
      class: 'topology',
      role: 'img',
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

    devices.forEach((device, order) => {
      const position = positions.get(device.id);
      const node = element('g', {
        class: `node node--${device.category}`,
        transform: `translate(${position.x} ${position.y})`,
        'data-id': device.id,
        tabindex: '0',
        role: 'button',
        'aria-label': `${device.name}, ${t(`category.${device.category}`)}`,
      });

      // El retraso va por CSSOM y no como atributo `style`: la política de seguridad de
      // contenido no lleva `unsafe-inline`, así que un atributo de estilo se descarta, y
      // con setenta y un dispositivos eso eran setenta y un rechazos por dibujado. Escribir
      // la propiedad no pasa por esa puerta.
      node.style.setProperty('--reveal-delay', `${Math.min(order * REVEAL_STEP, REVEAL_CAP)}ms`);

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

      // Nombre y dirección van en un grupo que se corre entero al renglón que le tocó, y
      // que no compensa el zoom: la etiqueta crece y se achica con el dibujo, igual que en
      // la imagen exportada.
      const labels = element('g', {
        class: 'node__labels',
        transform: `translate(0 ${plan.get(device.id).offset})`,
      });
      const label = element('text', { class: 'node__label', y: LABEL_TYPE.nameBaseline, 'text-anchor': 'middle' });
      label.textContent = device.name;
      labels.append(label);

      const address = device.interfaces.flatMap((entry) => entry.addresses)[0];
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
        }
      });

      nodeLayer.append(node);
    });

    scene.append(linkLayer, nodeLayer);
    svg.append(scene);
    const legend = this.buildLegend(links);
    this.container.append(svg, this.buildControls());
    // Sin enlaces no hay leyenda: una franja vacía al pie del diagrama no dice nada.
    if (legend) this.container.append(legend);

    this.svg = svg;
    this.scene = scene;
    this.devices = devices;
    this.positions = positions;
    this.frame = { width, height };

    this.attachNavigation(svg);
    this.resetView();
    if (this.selectedId) this.highlight(this.selectedId);
  }

  /** Proporción del panel, que es la que le conviene al lienzo para no dejar franjas. */
  panelAspect() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return FALLBACK_ASPECT;
    return Math.min(MAX_VIEW_ASPECT, Math.max(MIN_VIEW_ASPECT, width / height));
  }

  /**
   * Reparte la red y, si alguna etiqueta quedó rozando a otra, agranda el lienzo y vuelve a
   * probar. Es la misma idea que en la exportación: antes que esconder un nombre o una
   * dirección, darle más lugar al dibujo.
   */
  layoutFor(placed, stray, aspect) {
    const devices = [...placed, ...stray];

    // Lo que sobresale la etiqueta más ancha, que es lo que hay que dejar libre a los lados.
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

      // Qué tan lejos quedó de lo prolijo: una etiqueta rozando a otra pesa mucho más que
      // una corrida de renglón, pero las dos cuentan. El objetivo es que todos los bloques
      // queden a la misma altura bajo su icono.
      const untidiness = devices.reduce((total, device) => {
        const spot = plan.get(device.id);
        return total + (spot.crowded ? 1000 : 0) + (spot.offset > 0 ? 1 : 0);
      }, 0);

      return { width, height, positions, plan, tray, trayTop, side, untidiness };
    };

    // Se prueba de menos a más ancho y gana el primero que quede prolijo, que por ser el
    // primero es también el más chico: cuanto más chico el lienzo, más grande sale todo.
    // Más ancho no siempre es más prolijo —al estirarse cambia la separación vertical—, así
    // que si ninguno llega a cero queda el que menos lejos se haya quedado.
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

  /**
   * La leyenda además filtra: tocar un tipo de cable deja encendidos sólo los suyos. Es el
   * lugar donde ya se está mirando cuando surge la pregunta «¿cuáles son los cruzados?».
   */
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

  /** Enciende un tipo de cable y apaga el resto. Con el mismo que ya estaba, vuelve atrás. */
  highlightThread(thread) {
    const next = this.thread === thread ? null : thread;

    // Los dos resaltados dirían cosas distintas a la vez, así que elegir uno apaga el otro.
    // El aviso va antes de encender el nuevo, porque limpiar la selección apaga los cables.
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

    // El paso sale de cuánto giró la rueda, no de un salto fijo: así un trackpad, que manda
    // muchos avisos chicos, acerca despacio, y un ratón de muescas avanza a su ritmo. El
    // pellizco del trackpad llega por acá también, con Control apretado.
    //
    // Los avisos se juntan y se aplican una sola vez por cuadro. Atenderlos de a uno hace
    // dibujar varias veces por cuadro y, peor, obliga a recalcular la posición del SVG en
    // cada uno: trabajo que no se ve pero que se siente como retraso. Y no se anima nada:
    // detrás hay un gesto continuo que ya da la sensación de avance, y cualquier suavizado
    // encima es la vista yendo atrás del dedo.
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

    // Safari manda su propio gesto de pellizco además de la rueda. Sin atenderlo, el
    // navegador acerca la página entera en vez del diagrama.
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
      // El factor sale de la matriz del SVG, no del ancho: con relaciones de aspecto
      // distintas el dibujo queda apaisado dentro del elemento y el ancho miente.
      const ratio = 1 / svg.getScreenCTM().a;
      this.target.x += (event.clientX - dragging.x) * ratio;
      this.target.y += (event.clientY - dragging.y) * ratio;
      dragging = { x: event.clientX, y: event.clientY };
      // Arrastrar tiene que ir pegado al dedo: acá no hay nada que suavizar.
      this.settle();
    });

    // Soltar sin haber arrastrado, y fuera de todo nodo, es un clic al vacío: limpia
    // la selección. El umbral tolera el temblor del dedo o del ratón al hacer clic.
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

  /**
   * Punto del cursor en las coordenadas sobre las que opera el desplazamiento. La matriz se
   * puede pasar ya calculada: pedirla obliga al navegador a rehacer la posición del SVG, y
   * dentro de un mismo cuadro no cambia.
   */
  pointerInScene(event, matrix) {
    return new DOMPoint(event.clientX, event.clientY)
      .matrixTransform(matrix ?? this.svg.getScreenCTM().inverse());
  }

  /**
   * Acerca dejando quieto el punto indicado. Sin eso el diagrama se va hacia la
   * esquina y hay que perseguirlo arrastrando después de cada rueda. El cálculo se hace
   * sobre el destino, no sobre lo que se está viendo: dos vueltas seguidas de rueda se
   * suman en vez de pelearse con la animación de la primera.
   */
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

  /** Los botones sí se animan: no hay detrás un gesto continuo que dé sensación de avance. */
  zoomBy(factor) {
    if (this.zoomTo(this.target.scale * factor)) this.glide();
  }

  /**
   * Lleva la vista hacia el destino un poco por cuadro, en vez de saltar. El avance es por
   * tiempo y no por cuadro, así que se ve igual en una pantalla de 60 Hz que en una de 144.
   */
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

  /** Salta al destino sin animar: es lo que hace falta al arrastrar y al reencuadrar. */
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

  /** Selección hecha desde el diagrama: avisa al resto de la interfaz. */
  select(id) {
    this.focus(id);
    this.onSelect(id);
  }

  /** Selección hecha desde otro control: sólo actualiza el diagrama. */
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
      node.classList.toggle('is-neighbour', !own && neighbours.has(node.dataset.id));
      node.classList.toggle('is-dimmed', !neighbours.has(node.dataset.id));
    }
    this.svg.classList.add('has-selection');
  }

  clearSelection() {
    this.selectedId = null;
    this.thread = null;
    if (!this.svg) return;

    this.paintThread();
    for (const node of this.svg.querySelectorAll('.node')) {
      node.classList.remove('is-selected', 'is-neighbour', 'is-dimmed');
    }
  }
}
