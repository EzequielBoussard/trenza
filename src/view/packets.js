import { toHexDump } from '../pcap/dissect.js';
import { getLocale, t } from '../i18n.js';

const PAGE_SIZE = 300;

function createElement(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function formatTime(seconds, origin) {
  if (!seconds) return '—';
  return (seconds - origin).toFixed(6);
}

export class PacketTableView {
  constructor(container, { onSelect }) {
    this.container = container;
    this.onSelect = onSelect;
    this.packets = [];
    this.filter = '';
    this.rendered = 0;
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
      row.append(
        createElement('td', 'table__mono', String(packet.index)),
        createElement('td', 'table__mono', formatTime(packet.timestamp, this.origin)),
        createElement('td', 'table__mono', packet.source || '—'),
        createElement('td', 'table__mono', packet.destination || '—'),
        createElement('td', null, packet.protocol),
        createElement('td', 'table__mono', String(packet.originalLength)),
        createElement('td', 'table__detail', packet.summary),
      );
      row.addEventListener('click', () => {
        for (const selected of this.body.querySelectorAll('.is-selected')) selected.classList.remove('is-selected');
        row.classList.add('is-selected');
        this.onSelect(packet);
      });
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

export function renderCaptureSummary(container, capture, packets) {
  container.replaceChildren();

  const header = createElement('header', 'panel-head');
  header.append(
    createElement('p', 'panel-head__eyebrow', t('panel.summary')),
    createElement('h2', 'panel-head__title', t('panel.capture')),
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
