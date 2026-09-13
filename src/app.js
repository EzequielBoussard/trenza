import { getLanguage, setLanguage, t, translateDocument } from './i18n.js';
import { decodePacketTracerFile } from './pkt/decode.js';
import { buildNetworkModel } from './pkt/model.js';
import { decodeCapture } from './pcap/decode.js';
import { dissectPacket } from './pcap/dissect.js';
import { TopologyView } from './view/topology.js';
import { renderDeviceInspector, renderNetworkSummary } from './view/inspector.js';
import { PacketTableView, renderPacketInspector, renderCaptureSummary } from './view/packets.js';
import { readSourceFromLocation } from './share.js';
import { wireExportDialog } from './view/export-dialog.js';
import { download } from './download.js';
import { applyTheme, getTheme, toggleTheme } from './theme.js';

const elements = {
  stage: document.querySelector('[data-stage]'),
  rail: document.querySelector('[data-rail]'),
  panel: document.querySelector('[data-panel]'),
  status: document.querySelector('[data-status]'),
  fileName: document.querySelector('[data-file-name]'),
  fileInput: document.querySelector('[data-file-input]'),
  reset: document.querySelector('[data-reset]'),
  open: document.querySelector('[data-open]'),
  openCopy: document.querySelector('[data-open-copy]'),
  example: document.querySelector('[data-example]'),
  themeToggle: document.querySelector('[data-theme-toggle]'),
  sizeField: document.querySelector('[data-size-field]'),
  sizeLabel: document.querySelector('[data-size-label]'),
  scopeField: document.querySelector('[data-scope-field]'),
  languageField: document.querySelector('[data-language-field]'),
  themeField: document.querySelector('[data-theme-field]'),
  language: document.querySelector('[data-language]'),
  export: document.querySelector('[data-export]'),
  exportDialog: document.querySelector('[data-export-dialog]'),
  exportForm: document.querySelector('[data-export-form]'),
  exportCancel: document.querySelector('[data-export-cancel]'),
  exportNote: document.querySelector('[data-export-note]'),
  transparentField: document.querySelector('[data-transparent-field]'),
  previewPanel: document.querySelector('[data-preview-panel]'),
  previewFrame: document.querySelector('[data-preview-frame]'),
  previewNote: document.querySelector('[data-preview-note]'),
  previewLens: document.querySelector('[data-preview-lens]'),
  previewLensCanvas: document.querySelector('[data-preview-lens-canvas]'),
};

const EXAMPLE_FILE = '/showcase/red-supermercado-2023.pkt';
const EXAMPLE_NAME = 'red-supermercado-2023.pkt';

// Una ruta que no existe devuelve el index, así que el visor se sirve también en /demo.
// Ahí no hay parámetro que leer: la ruta sola vale como pedido de la red del showcase, y
// la dirección corta se queda entera en la barra en vez de convertirse en la del archivo.
const DEMO_PATH = /^\/demo\/?$/;

const state = {
  file: null,
  kind: null,
  model: null,
  capture: null,
  packets: [],
  devicesById: new Map(),
  selectedDeviceId: null,
  packetSelection: [],
  showInfrastructure: false,
  topology: null,
  packetTable: null,
  variant: null,
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

function clearSelection() {
  if (state.kind !== 'network') return;
  state.selectedDeviceId = null;
  state.topology.clearSelection();
  for (const chip of elements.rail.querySelectorAll('.device-chip')) chip.classList.remove('is-selected');
  showNetworkSummary();
}

function showNetworkSummary() {
  renderNetworkSummary(elements.panel, state.model, {
    fileName: state.file.name,
    variant: state.variant,
    onDownload: () => download(new Blob([state.file.bytes]), state.file.name),
  });
}

/**
 * Vacía la escena. El visor de topología se da de baja antes: sigue escuchando el tamaño
 * de su recuadro, y si se lo sacan de debajo sin avisarle vuelve a dibujar sobre lo que
 * haya quedado en su lugar.
 */
function clearStage() {
  if (state.topology) state.topology.destroy();
  state.topology = null;
  elements.stage.replaceChildren();
}

function paintNetwork() {
  clearStage();
  const canvas = createElement('div', 'stage__canvas');
  elements.stage.append(canvas);

  state.topology = new TopologyView(canvas, {
    onSelect: selectDevice,
    onClear: clearSelection,
    legendHost: elements.stage,
  });
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
  document.body.dataset.view = 'network';
  state.model = model;
  state.variant = decoded.variant;
  state.devicesById = new Map(model.devices.map((device) => [device.id, device]));
  state.selectedDeviceId = null;

  paintNetwork();
  setStatus('status.network', {
    devices: { key: 'unit.devices', values: { count: model.devices.length } },
    links: { key: 'unit.links', values: { count: model.links.length } },
  }, 'ok');
}

function paintCapture() {
  state.packets = state.capture.packets.map(dissectPacket);

  clearStage();
  const table = createElement('div', 'stage__table');
  elements.stage.append(table);

  state.packetTable = new PacketTableView(table, { onSelect: showPacketSelection });
  state.packetTable.load(state.packets);
  if (state.packetSelection.length > 0) state.packetTable.select(state.packetSelection);

  elements.rail.replaceChildren();
  const heading = createElement('div', 'rail__head');
  heading.append(createElement('h2', 'rail__title', t('rail.filter')));
  elements.rail.append(heading);

  const search = createElement('input', 'rail__search');
  search.type = 'search';
  search.placeholder = t('rail.searchPackets');
  search.setAttribute('aria-label', t('rail.searchPackets'));
  search.addEventListener('input', () => state.packetTable.setFilter(search.value));
  elements.rail.append(
    search,
    createElement('p', 'rail__hint', t('rail.filterHint')),
    createElement('p', 'rail__hint', t('rail.multiselect')),
  );

  showPacketSelection(state.packetTable.getSelection(), null);
}

/**
 * Un paquete elegido muestra su desglose; varios, un resumen del tramo. Ninguno,
 * el de la captura entera.
 */
function showPacketSelection(selection, last) {
  state.packetSelection = selection.map((packet) => packet.index);

  if (selection.length === 1 || (last && selection.length === 0)) {
    renderPacketInspector(elements.panel, last ?? selection[0]);
  } else if (selection.length > 1) {
    renderCaptureSummary(elements.panel, state.capture, selection, { title: t('panel.selection') });
  } else {
    renderCaptureSummary(elements.panel, state.capture, state.packets);
  }
}

function showCapture(bytes) {
  state.kind = 'capture';
  document.body.dataset.view = 'capture';
  state.capture = decodeCapture(bytes);
  state.packetSelection = [];

  paintCapture();

  // Una captura cortada a la mitad no es un error: los paquetes enteros que trae valen.
  // Pero hay que decirlo, porque si el corte llegó antes del primer paquete la pantalla
  // dice «0 paquetes» y parece que el visor no supo leer el archivo.
  const { packets, container, truncated } = state.capture;
  const values = { packets: { key: 'unit.packets', values: { count: packets.length } }, container };

  if (truncated > 0) {
    setStatus(packets.length > 0 ? 'status.captureCut' : 'status.captureCutEmpty',
      { ...values, bytes: truncated }, 'warn');
    return;
  }

  setStatus('status.capture', values, 'ok');
}

async function open(name, bytes) {
  state.file = { name, bytes };
  state.kind = null;
  state.model = null;
  state.capture = null;
  delete document.body.dataset.view;
  elements.fileName.textContent = name;
  document.body.dataset.loaded = 'true';
  setStatus('status.reading');

  try {
    if (looksLikeCapture(name, bytes)) {
      showCapture(bytes);
    } else {
      await showNetwork(bytes);
    }
  } catch (error) {
    showFailure(error.message);
  }
}

function showFailure(message) {
  state.kind = null;
  delete document.body.dataset.view;
  state.status = { key: null, tone: 'error' };
  elements.status.textContent = message;
  elements.status.dataset.tone = 'error';
  clearStage();
  elements.stage.append(createElement('p', 'empty-note', message));
  elements.panel.replaceChildren();
  elements.rail.replaceChildren();
}

async function openFile(file) {
  await open(file.name, new Uint8Array(await file.arrayBuffer()));
}

function wireFileInput() {
  elements.fileInput.addEventListener('change', () => {
    const [file] = elements.fileInput.files;
    // El campo se vacía enseguida: si conserva la ruta, volver a elegir el mismo
    // archivo no dispara ningún evento y la pantalla se queda con el error anterior.
    elements.fileInput.value = '';
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
  elements.openCopy.addEventListener('click', chooseFile);

  elements.example.addEventListener('click', openExample);
}

async function openExample() {
  setStatus('status.reading');
  try {
    const response = await fetch(EXAMPLE_FILE);
    if (!response.ok) throw new Error(t('error.httpStatus', { status: response.status }));
    await open(EXAMPLE_NAME, new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    showFailure(error.message);
  }
}

function wireTheme() {
  applyTheme(getTheme());
  elements.themeToggle.addEventListener('click', () => {
    toggleTheme();
    if (state.kind === 'network') paintNetwork();
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
    delete document.body.dataset.loaded;
    delete document.body.dataset.view;
    elements.fileName.textContent = '';
    clearStage();
    elements.rail.replaceChildren();
    elements.panel.replaceChildren();
    elements.fileInput.value = '';
    history.replaceState(null, '', location.pathname);
    setStatus('status.idle');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.exportDialog.open) clearSelection();
  });
}

async function start() {
  translateDocument();
  wireLanguage();
  wireTheme();
  wireFileInput();
  wireActions();
  wireExportDialog({ elements, state, setStatus });
  setStatus('status.idle');

  let source = null;
  try {
    source = await readSourceFromLocation();
    if (source) await open(source.name, source.bytes);
  } catch (error) {
    setStatus('status.linkFailed', { reason: error.message }, 'error');
    return;
  }
  // Un `?src=` explícito manda: la ruta sólo abre el ejemplo cuando no se pidió otra cosa.
  if (!source && DEMO_PATH.test(location.pathname)) await openExample();
}

start();
