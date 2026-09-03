import { toHexDump } from '../pcap/dissect.js';
import { getLocale, t } from '../i18n.js';

const PAGE_SIZE = 300;

function createElement(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

/** Parte el texto por el término buscado y marca los tramos que coinciden. */
function highlighted(text, needle) {
  const value = String(text ?? '');
  if (!needle) return document.createTextNode(value);

  const fragment = document.createDocumentFragment();
  const lower = value.toLowerCase();
  let cursor = 0;

  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, cursor)) {
    fragment.append(value.slice(cursor, at));
    const mark = document.createElement('mark');
    mark.textContent = value.slice(at, at + needle.length);
    fragment.append(mark);
    cursor = at + needle.length;
  }

  fragment.append(value.slice(cursor));
  return fragment;
}

function cell(className, text, needle) {
  const node = createElement('td', className);
  node.append(highlighted(text, needle));
  return node;
}

function formatTime(seconds, origin) {
  return Number.isFinite(seconds) ? (seconds - origin).toFixed(6) : '—';
}

export class PacketTableView {
  constructor(container, { onSelect }) {
    this.container = container;
    this.onSelect = onSelect;
    this.packets = [];
    this.filter = '';
    this.rendered = 0;
    this.selected = new Set();
    this.anchor = null;
  }

  /** Los paquetes elegidos, en el orden en que están en la captura. */
  getSelection() {
    return this.packets.filter((packet) => this.selected.has(packet.index));
  }

  /**
   * Selección al estilo de una planilla: un clic elige uno, con Mayúsculas se toma
   * el tramo desde el último elegido y con Control o Comando se suma o se quita uno.
   */
  choose(packet, event) {
    const position = this.visible.indexOf(packet);

    if (event.shiftKey && this.anchor !== null) {
      const from = Math.min(this.anchor, position);
      const to = Math.max(this.anchor, position);
      this.selected = new Set(this.visible.slice(from, to + 1).map((entry) => entry.index));
    } else if (event.ctrlKey || event.metaKey) {
      if (this.selected.has(packet.index)) this.selected.delete(packet.index);
      else this.selected.add(packet.index);
      this.anchor = position;
    } else {
      this.selected = new Set([packet.index]);
      this.anchor = position;
    }

    this.paintSelection();
    this.onSelect(this.getSelection(), packet);
  }

  /** Restablece una selección guardada, por ejemplo tras cambiar de idioma. */
  select(indices) {
    this.selected = new Set(indices);
    this.anchor = null;
    this.paintSelection();
  }

  paintSelection() {
    if (!this.body) return;
    for (const row of this.body.children) {
      row.classList.toggle('is-selected', this.selected.has(Number(row.dataset.index)));
    }
  }

  load(packets) {
    this.packets = packets;
    this.origin = packets.length > 0 ? packets[0].timestamp : 0;
    this.setFilter('');
  }

  setFilter(text) {
    this.filter = text.trim().toLowerCase();
    this.visible = this.filter
      ? this.packets.filter((packet) =>
          `${packet.protocol} ${packet.source} ${packet.destination} ${packet.summary}`
            .toLowerCase()
            .includes(this.filter))
      : this.packets;
    this.rendered = 0;
    this.selected = new Set();
    this.anchor = null;
    this.draw();
  }

  draw() {
    this.container.replaceChildren();

    const table = createElement('table', 'table table--packets');
    const head = createElement('thead');
    const headRow = createElement('tr');
    for (const key of ['table.number', 'table.time', 'table.source', 'table.destination', 'table.protocol', 'table.length', 'table.detail']) {
      headRow.append(createElement('th', null, t(key)));
    }
    head.append(headRow);
    this.body = createElement('tbody');
    table.append(head, this.body);

    const scroller = createElement('div', 'packet-scroller');
    scroller.append(table);
    this.container.append(scroller);

    if (this.visible.length === 0) {
      this.container.append(createElement('p', 'empty-note', t('table.noPackets')));
      return;
    }

    this.appendRows();
    scroller.addEventListener('scroll', () => {
      const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 200;
      if (nearBottom) this.appendRows();
    });
  }

  appendRows() {
    const slice = this.visible.slice(this.rendered, this.rendered + PAGE_SIZE);
    if (slice.length === 0) return;

    const fragment = document.createDocumentFragment();
    for (const packet of slice) {
      const row = createElement('tr', 'packet-row');
      row.dataset.index = String(packet.index);
      row.classList.toggle('is-selected', this.selected.has(packet.index));
      row.append(
        createElement('td', 'table__mono', String(packet.index)),
        createElement('td', 'table__mono', formatTime(packet.timestamp, this.origin)),
        cell('table__mono', packet.source || '—', this.filter),
        cell('table__mono', packet.destination || '—', this.filter),
        cell(null, packet.protocol, this.filter),
        createElement('td', 'table__mono', String(packet.originalLength)),
        cell('table__detail', packet.summary, this.filter),
      );
      // Mayúsculas al hacer clic selecciona texto por defecto; con un rango de filas
      // en juego, eso deja media tabla resaltada por debajo de la selección real.
      row.addEventListener('mousedown', (event) => {
        if (event.shiftKey) event.preventDefault();
      });
      row.addEventListener('click', (event) => this.choose(packet, event));
      fragment.append(row);
    }

    this.body.append(fragment);
    this.rendered += slice.length;
  }
}

export function renderPacketInspector(container, packet) {
  container.replaceChildren();

  const header = createElement('header', 'panel-head');
  header.append(
    createElement('p', 'panel-head__eyebrow', t('panel.packet', { index: packet.index })),
    createElement('h2', 'panel-head__title', packet.protocol),
  );
  container.append(header);

  for (const layer of packet.layers) {
    const wrapper = createElement('section', 'panel-section');
    wrapper.append(createElement('h3', 'panel-section__title', layer.name));
    const list = createElement('dl', 'facts');
    for (const [term, value] of layer.fields) {
      list.append(createElement('dt', null, term), createElement('dd', 'facts__mono', String(value)));
    }
    wrapper.append(list);
    container.append(wrapper);
  }

  const dump = createElement('section', 'panel-section');
  dump.append(createElement('h3', 'panel-section__title', t('panel.bytes')));
  dump.append(createElement('pre', 'code-block', toHexDump(packet.bytes)));
  container.append(dump);
}

export function renderCaptureSummary(container, capture, packets, { title } = {}) {
  container.replaceChildren();

  const header = createElement('header', 'panel-head');
  header.append(
    createElement('p', 'panel-head__eyebrow', t('panel.summary')),
    createElement('h2', 'panel-head__title', title ?? t('panel.capture')),
  );
  container.append(header);

  const protocols = new Map();
  let bytes = 0;
  for (const packet of packets) {
    protocols.set(packet.protocol, (protocols.get(packet.protocol) || 0) + 1);
    bytes += packet.originalLength;
  }

  const span = packets.length > 1 ? packets[packets.length - 1].timestamp - packets[0].timestamp : 0;
  const facts = createElement('dl', 'facts');
  for (const [term, value] of [
    [t('panel.format'), capture.container],
    [t('panel.packets'), String(packets.length)],
    [t('panel.totalBytes'), bytes.toLocaleString(getLocale())],
    [t('panel.duration'), span > 0 ? `${span.toFixed(3)} s` : '—'],
  ]) {
    facts.append(createElement('dt', null, term), createElement('dd', null, value));
  }

  const section = createElement('section', 'panel-section');
  section.append(createElement('h3', 'panel-section__title', t('panel.file')), facts);
  container.append(section);

  const ranked = [...protocols.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const breakdown = createElement('dl', 'facts');
  for (const [protocol, count] of ranked) {
    breakdown.append(createElement('dt', null, protocol), createElement('dd', null, String(count)));
  }
  const protocolSection = createElement('section', 'panel-section');
  protocolSection.append(createElement('h3', 'panel-section__title', t('panel.protocols')), breakdown);
  container.append(protocolSection);
}
