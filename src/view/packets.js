import { linkTypeName, toHexDump } from '../pcap/dissect.js';
import { getLocale, t } from '../i18n.js';

const PAGE_SIZE = 300;

/**
 * Las columnas de la tabla, en orden, con de dónde sale el valor por el que se ordena.
 * `text` marca las que se comparan como texto; el resto, como número.
 */
const COLUMNS = [
  { key: 'table.number', of: (packet) => packet.index },
  { key: 'table.time', of: (packet) => packet.timestamp },
  { key: 'table.source', of: (packet) => packet.source, text: true },
  { key: 'table.destination', of: (packet) => packet.destination, text: true },
  { key: 'table.protocol', of: (packet) => packet.protocol, text: true },
  { key: 'table.length', of: (packet) => packet.originalLength },
  { key: 'table.detail', of: (packet) => packet.summary, text: true },
];

/**
 * La comparación de texto va con orden numérico, y eso es lo que hace falta acá: sin él
 * `192.168.1.10` va antes que `192.168.1.2`, porque compara dígito a dígito. Con él compara
 * cada tramo de números por su valor, que es justo lo que uno espera de una dirección.
 */
const collator = () => new Intl.Collator(getLocale(), { numeric: true, sensitivity: 'base' });

/**
 * Los campos por los que busca el filtro, que son los mismos que después se resaltan. Se
 * miran de a uno y no pegados en una sola cadena: pegados, `icmp 192` coincidía en la
 * juntura entre el protocolo y el origen, y la fila salía sin una sola marca encima, sin
 * que se pudiera ver por qué estaba ahí. Si una fila aparece, algo tiene resaltado.
 */
const SEARCHED = ['protocol', 'source', 'destination', 'summary'];

/**
 * Los campos buscables de cada paquete en minúscula, armados la primera vez que alguien
 * filtra y guardados después. Sin esto, cada tecla los rehace: en una captura de cien mil
 * paquetes son cuatrocientas mil conversiones por pulsación, y se nota al escribir. Se
 * arman recién al filtrar, así que quien no filtra no los paga.
 *
 * Van todos seguidos en un solo arreglo, cuatro por paquete, y no en un arreglo por
 * paquete: cien mil arreglos de cuatro cuestan más en armarse que las cadenas que guardan.
 */
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
    this.sort = null;
    this.haystacks = null;
    this.matching = null;
    this.searched = '';
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
    this.collator = collator();
    this.filter = '';
    this.sort = null;
    this.selected = new Set();
    // Los resúmenes vienen traducidos, así que un cambio de idioma trae paquetes nuevos:
    // lo que se guardó para buscar ya no sirve.
    this.haystacks = null;
    this.matching = null;
    this.searched = '';
    this.refresh();
  }

  setFilter(text) {
    this.filter = text.trim().toLowerCase();
    // Filtrar esconde filas, y una selección con filas escondidas adentro engaña: el
    // diálogo seguiría ofreciendo exportar paquetes que no están a la vista. Se limpia, y
    // se avisa, que si no el resto de la interfaz se queda con la cuenta vieja.
    this.selected = new Set();
    this.refresh();
    this.onSelect([], null);
  }

  /**
   * Un clic por columna recorre tres estados: primero de menor a mayor, después al revés y
   * después de vuelta al orden de la captura. El tercero hace falta porque ordenar por
   * cualquier cosa pierde la secuencia, que en una captura es la mitad de la información.
   */
  sortByColumn(index) {
    const same = this.sort && this.sort.column === index;
    this.sort = same && this.sort.descending ? null : { column: index, descending: Boolean(same) };
    this.refresh();
  }

  /**
   * Los paquetes que pasan el filtro, por posición en la captura. Cuando el texto nuevo
   * contiene al anterior no puede reaparecer ninguna fila que ya estaba escondida —si una
   * cadena contiene `icmp`, contiene `icm`—, así que se filtra el resultado anterior en vez
   * de la captura entera. Es el caso de escribir de corrido, que es como se usa: en cien mil
   * paquetes, la primera tecla cuesta una pasada y las siguientes, lo que quedó vivo.
   */
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

  /**
   * Filtra y ordena, en ese orden, y vuelve a dibujar. Las dos cosas salen siempre de la
   * misma pasada: hacerlas por separado dejaba una tabla ordenada que al filtrar volvía al
   * orden de la captura, o al revés.
   */
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

    // Se copia porque `sort` ordena en el lugar, y sin la copia el orden de la captura se
    // perdería para siempre en la primera ordenada. Es estable, así que los empates
    // conservan la secuencia original.
    return [...packets].sort((a, b) => compare(a, b) * direction);
  }

  draw() {
    this.container.replaceChildren();

    const table = createElement('table', 'table table--packets');
    const head = createElement('thead');
    const headRow = createElement('tr');

    COLUMNS.forEach((column, index) => {
      const label = t(column.key);
      const heading = createElement('th');
      const sorting = this.sort && this.sort.column === index;

      // El encabezado es un botón de verdad y no un `th` con un `click` encima: así se
      // llega con el tabulador y el lector de pantalla dice que se puede ordenar.
      const button = createElement('button', 'sortable', label);
      button.type = 'button';
      button.setAttribute('aria-label', t('table.sortBy', { column: label }));
      // La flecha va siempre, vacía si no ordena por acá: así ordenar no corre los títulos.
      button.append(createElement('span', 'sortable__mark', sorting ? (this.sort.descending ? '▾' : '▴') : ''));

      heading.setAttribute('aria-sort', sorting ? (this.sort.descending ? 'descending' : 'ascending') : 'none');
      button.addEventListener('click', () => this.sortByColumn(index));
      heading.append(button);
      headRow.append(heading);
    });
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
  const entries = [
    [t('panel.format'), capture.container],
    // De qué enlace salió la captura: decide cómo se lee cada paquete, y es lo primero
    // que hay que mirar cuando el desglose no dice lo que uno esperaba.
    [t('panel.linkLayer'), linkTypeName(capture.linkType)],
    [t('panel.packets'), String(packets.length)],
    [t('panel.totalBytes'), bytes.toLocaleString(getLocale())],
    [t('panel.duration'), span > 0 ? `${span.toFixed(3)} s` : '—'],
  ];

  // El corte se cuenta acá y no sólo en la barra de estado: es un dato del archivo, y es
  // donde alguien va a mirar cuando la cuenta de paquetes le parezca corta.
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
