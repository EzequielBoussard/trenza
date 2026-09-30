import { linkTypeName, toHexDump } from '../pcap/dissect.js';
import { getLocale, t } from '../i18n.js';

const PAGE_SIZE = 300;

const ROW_STEPS = {
  ArrowDown: 1,
  ArrowUp: -1,
  PageDown: 20,
  PageUp: -20,
  Home: -Infinity,
  End: Infinity,
};

// `text`: se ordena como texto; el resto, como número.
const COLUMNS = [
  { key: 'table.number', of: (packet) => packet.index },
  { key: 'table.time', of: (packet) => packet.timestamp },
  { key: 'table.source', of: (packet) => packet.source, text: true },
  { key: 'table.destination', of: (packet) => packet.destination, text: true },
  { key: 'table.protocol', of: (packet) => packet.protocol, text: true },
  { key: 'table.length', of: (packet) => packet.originalLength },
  { key: 'table.detail', of: (packet) => packet.summary, text: true },
];

// numeric: true, para que 192.168.1.2 vaya antes que 192.168.1.10.
const collator = () => new Intl.Collator(getLocale(), { numeric: true, sensitivity: 'base' });

// Se buscan campo por campo: concatenados, "icmp 192" coincide entre 2 columnas y la fila
// aparece sin nada resaltado.
const SEARCHED = ['protocol', 'source', 'destination', 'summary'];

// Campos en minúscula, armados al primer filtrado. Un solo arreglo plano (4 por paquete):
// 100k arreglos chicos cuestan más que las cadenas.
function haystacksFor(packets) {
  const haystacks = new Array(packets.length * SEARCHED.length);

  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i];
    const at = i * SEARCHED.length;
    for (let field = 0; field < SEARCHED.length; field++) {
      haystacks[at + field] = String(packet[SEARCHED[field]] ?? '').toLowerCase();
    }
  }

  return haystacks;
}

function createElement(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

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
    this.sort = null;
    this.rowPackets = new WeakMap();
    this.haystacks = null;
    this.matching = null;
    this.searched = '';
  }

  getSelection() {
    return this.packets.filter((packet) => this.selected.has(packet.index));
  }

  // Como en una planilla: Mayúsculas toma el tramo, Ctrl/Cmd suma o quita uno.
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

  select(indices) {
    this.selected = new Set(indices);
    this.anchor = null;
    this.paintSelection();
  }

  paintSelection() {
    if (!this.body) return;
    for (const row of this.body.children) {
      const chosen = this.selected.has(Number(row.dataset.index));
      row.classList.toggle('is-selected', chosen);
      row.setAttribute('aria-selected', String(chosen));
    }
  }

  load(packets) {
    this.packets = packets;
    this.origin = packets.length > 0 ? packets[0].timestamp : 0;
    this.collator = collator();
    this.filter = '';
    this.sort = null;
    this.selected = new Set();
    // Los resúmenes están traducidos: con otro idioma hay que rearmar los campos.
    this.haystacks = null;
    this.matching = null;
    this.searched = '';
    this.refresh();
  }

  setFilter(text) {
    this.filter = text.trim().toLowerCase();
    // Filtrar limpia la selección: si no, se podrían exportar paquetes que no están a la vista.
    this.selected = new Set();
    this.refresh();
    this.onSelect([], null);
  }

  // Ascendente, descendente y de vuelta al orden de la captura.
  sortByColumn(index) {
    const same = this.sort && this.sort.column === index;
    this.sort = same && this.sort.descending ? null : { column: index, descending: Boolean(same) };

    // draw() rehace los encabezados, así que el foco se devuelve al botón nuevo.
    const focused = this.container.contains(document.activeElement);
    this.refresh();
    if (focused) this.container.querySelectorAll('thead button')[index].focus();
  }

  // Si el texto nuevo contiene al anterior, se filtra sobre el resultado anterior.
  filtered() {
    if (!this.filter) {
      this.matching = null;
      this.searched = '';
      return this.packets;
    }

    if (!this.haystacks) this.haystacks = haystacksFor(this.packets);

    const needle = this.filter;
    const previous = this.matching && this.searched && needle.includes(this.searched) ? this.matching : null;
    const matching = [];

    const haystacks = this.haystacks;
    const hit = (index) => {
      const at = index * SEARCHED.length;
      for (let field = 0; field < SEARCHED.length; field++) {
        if (haystacks[at + field].includes(needle)) return true;
      }
      return false;
    };

    if (previous) {
      for (const index of previous) if (hit(index)) matching.push(index);
    } else {
      for (let index = 0; index < this.packets.length; index++) if (hit(index)) matching.push(index);
    }

    this.matching = matching;
    this.searched = needle;
    return matching.map((index) => this.packets[index]);
  }

  // Filtrar y ordenar van siempre juntos; por separado, uno deshacía al otro.
  refresh() {
    const filtered = this.filtered();

    this.visible = this.sort ? this.sorted(filtered) : filtered;
    this.rendered = 0;
    this.anchor = null;
    this.draw();
  }

  sorted(packets) {
    const { of, text } = COLUMNS[this.sort.column];
    const direction = this.sort.descending ? -1 : 1;
    const compare = text
      ? ((a, b) => this.collator.compare(String(of(a) ?? ''), String(of(b) ?? '')))
      : ((a, b) => of(a) - of(b));

    // Copia: sort ordena en el lugar y se perdería el orden de la captura.
    return [...packets].sort((a, b) => compare(a, b) * direction);
  }

  draw() {
    this.container.replaceChildren();

    const table = createElement('table', 'table table--packets');
    // grid: en una tabla común aria-selected no aplica a las filas.
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-multiselectable', 'true');
    const head = createElement('thead');
    const headRow = createElement('tr');

    COLUMNS.forEach((column, index) => {
      const label = t(column.key);
      const heading = createElement('th');
      const sorting = this.sort && this.sort.column === index;

      const button = createElement('button', 'sortable', label);
      button.type = 'button';
      button.setAttribute('aria-label', t('table.sortBy', { column: label }));
      // El span va siempre, aunque esté vacío, para que ordenar no mueva los títulos.
      button.append(createElement('span', 'sortable__mark', sorting ? (this.sort.descending ? '▾' : '▴') : ''));

      heading.setAttribute('aria-sort', sorting ? (this.sort.descending ? 'descending' : 'ascending') : 'none');
      button.addEventListener('click', () => this.sortByColumn(index));
      heading.append(button);
      headRow.append(heading);
    });
    head.append(headRow);
    this.body = createElement('tbody');
    this.body.addEventListener('keydown', (event) => this.navigate(event));
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
      // Tabindex móvil: una sola parada para toda la tabla.
      row.tabIndex = -1;
      row.classList.toggle('is-selected', this.selected.has(packet.index));
      row.setAttribute('aria-selected', String(this.selected.has(packet.index)));
      this.rowPackets.set(row, packet);
      row.append(
        createElement('td', 'table__mono', String(packet.index)),
        createElement('td', 'table__mono', formatTime(packet.timestamp, this.origin)),
        cell('table__mono', packet.source || '—', this.filter),
        cell('table__mono', packet.destination || '—', this.filter),
        cell(null, packet.protocol, this.filter),
        createElement('td', 'table__mono', String(packet.originalLength)),
        cell('table__detail', packet.summary, this.filter),
      );
      // Shift+clic selecciona texto por defecto.
      row.addEventListener('mousedown', (event) => {
        if (event.shiftKey) event.preventDefault();
      });
      row.addEventListener('click', (event) => this.choose(packet, event));
      fragment.append(row);
    }

    this.body.append(fragment);
    this.rendered += slice.length;
    if (!this.body.querySelector('[tabindex="0"]')) this.body.firstElementChild.tabIndex = 0;
  }

  // Enter con Shift o Ctrl se comporta como el clic: choose() lee las teclas del evento.
  navigate(event) {
    const row = event.target.closest('.packet-row');
    if (!row) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const packet = this.rowPackets.get(row);
      if (packet) this.choose(packet, event);
      return;
    }

    const step = ROW_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    this.moveRow(row, step);
  }

  moveRow(row, step) {
    const rows = this.body.children;
    let to = step === Infinity ? rows.length - 1
      : step === -Infinity ? 0
      : row.sectionRowIndex + step;

    // Las filas se dibujan por tandas. End va a la última dibujada, no a la última del archivo.
    if (to >= rows.length) {
      this.appendRows();
      to = Math.min(to, rows.length - 1);
    }

    const next = rows[Math.max(0, to)];
    if (!next || next === row) return;
    row.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }
}

export function renderPacketInspector(container, packet) {
  container.replaceChildren();

  const header = createElement('header', 'panel-head');
  header.append(
    createElement('p', 'panel-head__kind', t('panel.packet', { index: packet.index })),
    createElement('h2', 'panel-head__title', packet.protocol),
  );
  container.append(header);

  for (const layer of packet.layers) {
    const wrapper = createElement('section', 'panel-section');
    wrapper.append(createElement('h3', 'panel-section__title', layer.name));
    const list = createElement('dl', 'facts');
    for (const [term, value] of layer.fields()) {
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
    createElement('p', 'panel-head__kind', t('panel.summary')),
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
  const entries = [
    [t('panel.format'), capture.container],
    [t('panel.linkLayer'), linkTypeName(capture.linkType)],
    [t('panel.packets'), String(packets.length)],
    [t('panel.totalBytes'), bytes.toLocaleString(getLocale())],
    [t('panel.duration'), span > 0 ? `${span.toFixed(3)} s` : '—'],
  ];

  if (capture.truncated > 0) {
    entries.push([t('panel.truncated'), t('panel.truncatedValue', { bytes: capture.truncated })]);
  }

  const facts = createElement('dl', 'facts');
  for (const [term, value] of entries) {
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
