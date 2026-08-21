import { countOf, getLanguage, setLanguage, t, translateDocument } from './i18n.js';
import { decodePacketTracerFile } from './pkt/decode.js';
import { buildNetworkModel } from './pkt/model.js';
import { decodeCapture } from './pcap/decode.js';
import { dissectPacket } from './pcap/dissect.js';
import { TopologyView } from './view/topology.js';
import { renderDeviceInspector, renderNetworkSummary } from './view/inspector.js';
import { PacketTableView, renderPacketInspector, renderCaptureSummary } from './view/packets.js';
import { readSourceFromLocation } from './share.js';
import { DEFAULT_RESOLUTION, exportNetwork, resolutionsThatFit, suggestExportName } from './view/export.js';
import { download } from './download.js';

const elements = {
  stage: document.querySelector('[data-stage]'),
  rail: document.querySelector('[data-rail]'),
  panel: document.querySelector('[data-panel]'),
  status: document.querySelector('[data-status]'),
  fileName: document.querySelector('[data-file-name]'),
  fileInput: document.querySelector('[data-file-input]'),
  reset: document.querySelector('[data-reset]'),
  dropzone: document.querySelector('[data-dropzone]'),
  open: document.querySelector('[data-open]'),
  language: document.querySelector('[data-language]'),
  export: document.querySelector('[data-export]'),
  exportDialog: document.querySelector('[data-export-dialog]'),
  exportForm: document.querySelector('[data-export-form]'),
  exportCancel: document.querySelector('[data-export-cancel]'),
  exportNote: document.querySelector('[data-export-note]'),
  transparentField: document.querySelector('[data-transparent-field]'),
};

const state = {
  file: null,
  kind: null,
  model: null,
  capture: null,
  packets: [],
  devicesById: new Map(),
  selectedDeviceId: null,
  selectedPacketIndex: null,
  showInfrastructure: false,
  topology: null,
  packetTable: null,
  status: { key: 'status.idle', values: null, tone: 'info' },
};

// Un valor { key } se traduce al pintar, no al guardarse: así el mensaje sigue al
// idioma cuando se cambia con un archivo ya abierto.
function resolveValues(values) {
  if (!values) return values;
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      value && typeof value === 'object' && value.key ? t(value.key, value.values) : value,
    ]),
  );
}

function setStatus(key, values = null, tone = 'info') {
  state.status = { key, values, tone };
  elements.status.textContent = t(key, resolveValues(values));
  elements.status.dataset.tone = tone;
}

function createElement(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function looksLikeCapture(name, bytes) {
  if (/\.(pcap|pcapng|cap)$/i.test(name)) return true;
  if (bytes.length < 4) return false;
  const magic = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  return [0x0a0d0d0a, 0xa1b2c3d4, 0xd4c3b2a1, 0xa1b23c4d, 0x4d3cb2a1].includes(magic >>> 0);
}

function renderDeviceList() {
  elements.rail.replaceChildren();

  const heading = createElement('div', 'rail__head');
  heading.append(createElement('h2', 'rail__title', t('rail.devices')));

  const toggle = createElement('label', 'toggle');
  const checkbox = createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.showInfrastructure;
  checkbox.addEventListener('change', () => {
    state.showInfrastructure = checkbox.checked;
    state.topology.render(state.model, { showInfrastructure: state.showInfrastructure });
    renderDeviceList();
  });
  toggle.append(checkbox, createElement('span', null, t('rail.infrastructure')));
  heading.append(toggle);
  elements.rail.append(heading);

  const search = createElement('input', 'rail__search');
  search.type = 'search';
  search.placeholder = t('rail.searchDevices');
  search.setAttribute('aria-label', t('rail.searchDevices'));
  elements.rail.append(search);

  const list = createElement('ul', 'device-list');
  elements.rail.append(list);

  const visible = state.showInfrastructure
    ? state.model.devices
    : state.model.devices.filter((device) => device.category !== 'infrastructure');

  const draw = (term) => {
    list.replaceChildren();
    const needle = term.trim().toLowerCase();
    const matches = visible.filter((device) => {
      if (!needle) return true;
      const addresses = device.interfaces.flatMap((entry) => entry.addresses).map((entry) => entry.address);
      return `${device.name} ${device.type} ${addresses.join(' ')}`.toLowerCase().includes(needle);
    });

    for (const device of matches) {
      const item = createElement('li');
      const button = createElement('button', `device-chip device-chip--${device.category}`);
      button.type = 'button';
      button.dataset.id = device.id;
      button.classList.toggle('is-selected', device.id === state.selectedDeviceId);
      button.append(
        createElement('span', 'device-chip__name', device.name),
        createElement('span', 'device-chip__meta', t(`category.${device.category}`)),
      );
      button.addEventListener('click', () => selectDevice(device.id));
      item.append(button);
      list.append(item);
    }

    if (matches.length === 0) {
      list.append(createElement('li', 'empty-note', t('rail.noMatches')));
    }
  };

  search.addEventListener('input', () => draw(search.value));
  draw('');
}

function selectDevice(id) {
  const device = state.devicesById.get(id);
  if (!device) return;
  state.selectedDeviceId = id;
  state.topology.focus(id);
  renderDeviceInspector(elements.panel, device, state.devicesById);
  for (const chip of elements.rail.querySelectorAll('.device-chip')) {
    chip.classList.toggle('is-selected', chip.dataset.id === id);
  }
}

function showNetworkSummary() {
  renderNetworkSummary(elements.panel, state.model, {
    fileName: state.file.name,
    onDownload: () => download(new Blob([state.file.bytes]), state.file.name),
  });
}

function paintNetwork() {
  elements.stage.replaceChildren();
  const canvas = createElement('div', 'stage__canvas');
  elements.stage.append(canvas);

  state.topology = new TopologyView(canvas, { onSelect: selectDevice });
  state.topology.render(state.model, { showInfrastructure: state.showInfrastructure });

  renderDeviceList();
  if (state.selectedDeviceId && state.devicesById.has(state.selectedDeviceId)) {
    selectDevice(state.selectedDeviceId);
  } else {
    showNetworkSummary();
  }
}

async function showNetwork(bytes) {
  const decoded = await decodePacketTracerFile(bytes);
  const model = buildNetworkModel(new TextDecoder().decode(decoded.xml));

  state.kind = 'network';
  state.model = model;
  state.variant = decoded.variant;
  state.devicesById = new Map(model.devices.map((device) => [device.id, device]));
  state.selectedDeviceId = null;

  paintNetwork();
  elements.export.disabled = false;
  setStatus('status.network', {
    devices: { key: 'unit.devices', values: { count: model.devices.length } },
    links: { key: 'unit.links', values: { count: model.links.length } },
    variant: { key: `variant.${decoded.variant}` },
  }, 'ok');
}

function paintCapture() {
  state.packets = state.capture.packets.map(dissectPacket);

  elements.stage.replaceChildren();
  const table = createElement('div', 'stage__table');
  elements.stage.append(table);

  state.packetTable = new PacketTableView(table, {
    onSelect: (packet) => {
      state.selectedPacketIndex = packet.index;
      renderPacketInspector(elements.panel, packet);
    },
  });
  state.packetTable.load(state.packets);

  elements.rail.replaceChildren();
  const heading = createElement('div', 'rail__head');
  heading.append(createElement('h2', 'rail__title', t('rail.filter')));
  elements.rail.append(heading);

  const search = createElement('input', 'rail__search');
  search.type = 'search';
  search.placeholder = t('rail.searchPackets');
  search.setAttribute('aria-label', t('rail.searchPackets'));
  search.addEventListener('input', () => state.packetTable.setFilter(search.value));
  elements.rail.append(search, createElement('p', 'rail__hint', t('rail.filterHint')));

  const selected = state.packets.find((packet) => packet.index === state.selectedPacketIndex);
  if (selected) {
    renderPacketInspector(elements.panel, selected);
  } else {
    renderCaptureSummary(elements.panel, state.capture, state.packets);
  }
}

function showCapture(bytes) {
  state.kind = 'capture';
  state.capture = decodeCapture(bytes);
  state.selectedPacketIndex = null;

  paintCapture();
  setStatus('status.capture', {
    packets: { key: 'unit.packets', values: { count: state.capture.packets.length } },
    container: state.capture.container,
  }, 'ok');
}

async function open(name, bytes) {
  state.file = { name, bytes };
  state.kind = null;
  state.model = null;
  state.capture = null;
  elements.fileName.textContent = name;
  elements.export.disabled = true;
  document.body.dataset.loaded = 'true';
  setStatus('status.reading');

  try {
    if (looksLikeCapture(name, bytes)) {
      showCapture(bytes);
    } else {
      await showNetwork(bytes);
    }
  } catch (error) {
    state.kind = null;
    elements.status.textContent = error.message;
    elements.status.dataset.tone = 'error';
    state.status = { key: null, message: error.message, tone: 'error' };
    elements.stage.replaceChildren(createElement('p', 'empty-note', error.message));
    elements.panel.replaceChildren();
    elements.rail.replaceChildren();
  }
}

async function openFile(file) {
  await open(file.name, new Uint8Array(await file.arrayBuffer()));
}

function wireFileInput() {
  elements.fileInput.addEventListener('change', () => {
    const [file] = elements.fileInput.files;
    if (file) openFile(file);
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    document.body.dataset.dragging = 'true';
  });
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) delete document.body.dataset.dragging;
  });
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    delete document.body.dataset.dragging;
    const [file] = event.dataTransfer.files;
    if (file) openFile(file);
  });

  const chooseFile = () => elements.fileInput.click();
  elements.open.addEventListener('click', chooseFile);
  elements.dropzone.addEventListener('click', chooseFile);
  elements.dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      chooseFile();
    }
  });
}

function wireExport() {
  const updateFormatFields = () => {
    const format = elements.exportForm.elements.format.value;
    elements.transparentField.hidden = format !== 'png';
    elements.exportNote.textContent = format === 'pdf' ? t('export.pdfNote') : '';
  };

  // Una resolución que dejaría etiquetas afuera no se ofrece. Depende del archivo,
  // así que se calcula cada vez que se abre el diálogo.
  const updateResolutionOptions = () => {
    const fits = resolutionsThatFit(state.model, { showInfrastructure: state.showInfrastructure });
    const select = elements.exportForm.elements.resolution;
    let first = null;

    for (const option of select.options) {
      const label = option.dataset.size || t('export.fit');
      // Ajustar al diagrama es el mayor tamaño posible: si ni ese alcanza, no hay
      // nada mejor que ofrecer, así que queda elegible con la advertencia puesta.
      const selectable = fits[option.value] || option.value === 'fit';
      option.disabled = !selectable;
      option.textContent = fits[option.value] ? label : `${label} — ${t('export.doesNotFit')}`;
      if (fits[option.value] && first === null) first = option.value;
    }

    select.value = fits[DEFAULT_RESOLUTION] ? DEFAULT_RESOLUTION : first ?? 'fit';
  };

  elements.export.addEventListener('click', () => {
    if (!state.model) return;
    elements.exportForm.elements.name.value = suggestExportName(state.file.name);
    updateResolutionOptions();
    updateFormatFields();
    elements.exportDialog.showModal();
    elements.exportForm.elements.name.select();
  });

  elements.exportForm.addEventListener('change', updateFormatFields);
  elements.exportCancel.addEventListener('click', () => elements.exportDialog.close());

  elements.exportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = elements.exportForm.elements;
    const request = {
      format: fields.format.value,
      name: fields.name.value.trim() || suggestExportName(state.file.name),
      resolution: fields.resolution.value,
      transparent: fields.transparent.checked,
      showInfrastructure: state.showInfrastructure,
    };

    elements.exportDialog.close();
    setStatus('status.exporting');

    try {
      const result = await exportNetwork(state.model, request);
      setStatus(result.hidden > 0 ? 'status.exportedTrimmed' : 'status.exported', {
        file: result.fileName,
        width: result.width,
        height: result.height,
        size: Math.round(result.bytes / 1024),
        hidden: { key: 'unit.labels', values: { count: result.hidden } },
      }, 'ok');
    } catch (error) {
      setStatus('status.exportFailed', { reason: error.message }, 'error');
    }
  });
}

function wireLanguage() {
  elements.language.value = getLanguage();
  elements.language.addEventListener('change', () => {
    setLanguage(elements.language.value);
    translateDocument();

    if (state.status.key) setStatus(state.status.key, state.status.values, state.status.tone);
    if (state.kind === 'network') paintNetwork();
    if (state.kind === 'capture') paintCapture();
  });
}

function wireActions() {
  elements.reset.addEventListener('click', () => {
    state.file = null;
    state.kind = null;
    state.model = null;
    state.capture = null;
    state.selectedDeviceId = null;
    state.selectedPacketIndex = null;
    delete document.body.dataset.loaded;
    elements.fileName.textContent = '';
    elements.export.disabled = true;
    elements.stage.replaceChildren();
    elements.rail.replaceChildren();
    elements.panel.replaceChildren();
    elements.fileInput.value = '';
    history.replaceState(null, '', location.pathname);
    setStatus('status.idle');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || elements.exportDialog.open || state.kind !== 'network') return;
    state.selectedDeviceId = null;
    state.topology.clearSelection();
    for (const chip of elements.rail.querySelectorAll('.device-chip')) chip.classList.remove('is-selected');
    showNetworkSummary();
  });
}

async function start() {
  translateDocument();
  wireLanguage();
  wireFileInput();
  wireActions();
  wireExport();
  setStatus('status.idle');

  try {
    const source = await readSourceFromLocation();
    if (source) await open(source.name, source.bytes);
  } catch (error) {
    setStatus('status.linkFailed', { reason: error.message }, 'error');
  }
}

start();
