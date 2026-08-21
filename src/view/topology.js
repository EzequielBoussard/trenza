import { countOf, t } from '../i18n.js';
import {
  CATEGORY_GLYPHS,
  LEGEND_ENTRIES,
  partitionDevices,
  planLabels,
  projectIntoRect,
  selectVisible,
  threadFor,
  trayPlan,
  trayPositions,
} from './graph.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 1000;

// Márgenes del área de dibujo: dejan lugar al halo del nodo arriba y al nombre y la
// dirección abajo, para que ninguna etiqueta quede cortada contra el borde.
const VIEW_INSETS = { x: 120, top: 70, bottom: 90 };

// Las mismas familias que declara la hoja de estilos para las etiquetas del diagrama.
const LABEL_FONT = '600 13px "IBM Plex Sans Condensed", sans-serif';
const ADDRESS_FONT = '400 10px "IBM Plex Mono", monospace';

function element(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function labelMeasurer() {
  const context = document.createElement('canvas').getContext('2d');
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
  constructor(container, { onSelect }) {
    this.container = container;
    this.onSelect = onSelect;
    this.transform = { x: 0, y: 0, scale: 1 };
    this.selectedId = null;
    this.measure = labelMeasurer();
  }

  render(model, { showInfrastructure }) {
    const { devices: visible, links } = selectVisible(model, showInfrastructure);

    this.container.replaceChildren();
    if (visible.length === 0) return;

    // Los apartados van a una bandeja al pie: si entraran al encuadre general, uno
    // solo tirado en un rincón del espacio de trabajo aplastaría toda la red.
    const { placed, stray } = partitionDevices(visible, links);
    const trayWidth = VIEW_WIDTH - VIEW_INSETS.x * 2;
    const tray = trayPlan(stray, trayWidth);
    const trayTop = VIEW_HEIGHT - VIEW_INSETS.bottom - tray.height;

    const positions = projectIntoRect(placed, {
      x: VIEW_INSETS.x,
      y: VIEW_INSETS.top,
      width: trayWidth,
      height: trayTop - VIEW_INSETS.top,
    });
    for (const [id, point] of trayPositions(stray, tray, { x: VIEW_INSETS.x, y: trayTop, width: trayWidth })) {
      positions.set(id, point);
    }

    const devices = [...placed, ...stray];

    const svg = element('svg', {
      viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`,
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
        class: 'tray__rule', x1: VIEW_INSETS.x, y1: trayTop, x2: VIEW_WIDTH - VIEW_INSETS.x, y2: trayTop,
      }));
      const caption = element('text', { class: 'tray__caption', x: VIEW_INSETS.x, y: trayTop + 16 });
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
        style: `--reveal-delay:${Math.min(order * 12, 420)}ms`,
      });

      node.append(
        element('circle', { class: 'node__halo', r: 26 }),
        element('circle', { class: 'node__disc', r: 18 }),
        element('path', {
          class: 'node__glyph',
          d: CATEGORY_GLYPHS[device.category] || CATEGORY_GLYPHS.other,
          transform: 'translate(-12 -12)',
        }),
      );

      // Las etiquetas van en su propio grupo para poder compensar el zoom: así
      // conservan su tamaño en pantalla y acercarse separa los textos de verdad.
      const labels = element('g', { class: 'node__labels' });
      const label = element('text', { class: 'node__label', y: 38, 'text-anchor': 'middle' });
      label.textContent = device.name;
      labels.append(label);

      const address = device.interfaces.flatMap((entry) => entry.addresses)[0];
      if (address) {
        const addressLabel = element('text', { class: 'node__address', y: 52, 'text-anchor': 'middle' });
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
    this.container.append(svg, this.buildControls(), this.buildLegend(links));

    this.svg = svg;
    this.scene = scene;
    this.devices = devices;
    this.positions = positions;
    this.plannedScale = null;

    this.attachNavigation(svg);
    this.applyTransform();
    if (this.selectedId) this.highlight(this.selectedId);
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

  buildLegend(links) {
    const used = new Set(links.map(threadFor));
    const legend = document.createElement('ul');
    legend.className = 'legend';

    for (const entry of LEGEND_ENTRIES) {
      if (!used.has(entry.thread)) continue;
      const item = document.createElement('li');
      item.className = `legend__item legend__item--${entry.thread}`;
      const swatch = document.createElement('span');
      swatch.className = 'legend__swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.textContent = t(entry.key);
      item.append(swatch, text);
      legend.append(item);
    }
    return legend;
  }

  attachNavigation(svg) {
    let dragging = null;

    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    svg.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.node')) return;
      dragging = { x: event.clientX, y: event.clientY };
      svg.setPointerCapture(event.pointerId);
      svg.classList.add('is-panning');
    });

    svg.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const rect = svg.getBoundingClientRect();
      const ratio = VIEW_WIDTH / rect.width;
      this.transform.x += (event.clientX - dragging.x) * ratio;
      this.transform.y += (event.clientY - dragging.y) * ratio;
      dragging = { x: event.clientX, y: event.clientY };
      this.applyTransform();
    });

    const endDrag = () => {
      dragging = null;
      svg.classList.remove('is-panning');
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
  }

  zoomBy(factor) {
    this.transform.scale = Math.min(6, Math.max(0.35, this.transform.scale * factor));
    this.applyTransform();
  }

  applyTransform() {
    if (!this.scene) return;
    const { x, y, scale } = this.transform;
    this.scene.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
    this.updateLabels();
  }

  /**
   * Recalcula qué etiquetas caben. Sólo hace falta al cambiar el zoom: el
   * desplazamiento mueve todo por igual y no altera quién se pisa con quién.
   */
  updateLabels() {
    const scale = this.transform.scale;
    if (this.plannedScale === scale) return;
    this.plannedScale = scale;

    const separated = new Map(
      [...this.positions].map(([id, point]) => [id, { x: point.x * scale, y: point.y * scale }]),
    );
    const plan = planLabels(this.devices, separated, this.measure);

    for (const node of this.svg.querySelectorAll('.node')) {
      const shown = plan.get(node.dataset.id);
      node.querySelector('.node__labels').setAttribute('transform', `scale(${1 / scale})`);
      node.classList.toggle('node--hide-name', !shown.name);
      node.classList.toggle('node--hide-address', !shown.address);
    }
  }

  resetView() {
    this.transform = { x: 0, y: 0, scale: 1 };
    this.applyTransform();
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
      node.classList.toggle('is-selected', node.dataset.id === id);
      node.classList.toggle('is-dimmed', !neighbours.has(node.dataset.id));
    }
    this.svg.classList.add('has-selection');
  }

  clearSelection() {
    this.selectedId = null;
    if (!this.svg) return;
    this.svg.classList.remove('has-selection');
    for (const node of this.svg.querySelectorAll('.node')) node.classList.remove('is-selected', 'is-dimmed');
    for (const link of this.svg.querySelectorAll('.link')) link.classList.remove('is-active');
  }
}
