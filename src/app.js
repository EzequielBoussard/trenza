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
import { weave } from './logo.js';

const elements = {
  stage: document.querySelector('[data-stage]'),
  rail: document.querySelector('[data-rail]'),
  railGrip: document.querySelector('[data-rail-grip]'),
  panelGrip: document.querySelector('[data-panel-grip]'),
  panel: document.querySelector('[data-panel]'),
  status: document.querySelector('[data-status]'),
  fileName: document.querySelector('[data-file-name]'),
  fileInput: document.querySelector('[data-file-input]'),
  reset: document.querySelector('[data-reset]'),
  home: document.querySelector('[data-home]'),
  open: document.querySelector('[data-open]'),
  openCopy: document.querySelector('[data-open-copy]'),
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

const EXAMPLES = {
  network: '/showcase/red-supermercado-2023.pkt',
  capture: '/showcase/captura-ejemplo.pcap',
};

// Pages devuelve el index para cualquier ruta, así que /demo llega acá y abre el ejemplo.
// Cualquier otra ruta se muestra como "/", conservando ?src=.
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

// Los valores { key } se traducen al pintar, para que el mensaje siga al cambio de idioma.
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

// Por data-i18n, para que el cambio de idioma lo vuelva a traducir.
function labelExport(key) {
  elements.export.dataset.i18n = key;
  elements.export.textContent = t(key);
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
  // Sólo se redibuja la lista: rehacer la columna borraba la búsqueda y el foco de la casilla.
  checkbox.addEventListener('change', () => {
    state.showInfrastructure = checkbox.checked;
    const selected = state.devicesById.get(state.selectedDeviceId);
    if (!state.showInfrastructure && selected?.category === 'infrastructure') clearSelection();
    state.topology.render(state.model, { showInfrastructure: state.showInfrastructure });
    draw(search.value);
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

  const draw = (term) => {
    list.replaceChildren();
    const needle = term.trim().toLowerCase();
    const visible = state.showInfrastructure
      ? state.model.devices
      : state.model.devices.filter((device) => device.category !== 'infrastructure');
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

// La vista de topología se destruye antes: si no, su ResizeObserver vuelve a dibujar encima.
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
  labelExport('action.export');
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
  labelExport('action.exportCapture');
  state.capture = decodeCapture(bytes);
  state.packetSelection = [];

  paintCapture();

  // Una captura truncada se muestra igual, pero con aviso.
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
  refreshTitle();
  document.body.dataset.loaded = 'true';
  setStatus('status.reading');

  try {
    if (looksLikeCapture(name, bytes)) {
      showCapture(bytes);
    } else {
      // Sólo el .pkt necesita DecompressionStream; las capturas abren igual.
      if (typeof DecompressionStream !== 'function') throw new Error(t('error.oldBrowser'));
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
    // Si no se vacía, elegir el mismo archivo otra vez no dispara `change`.
    elements.fileInput.value = '';
    if (file) openFile(file);
  });

  // Sólo lo que trae archivos: arrastrar texto de la propia página no tiene que abrir nada.
  const carriesFiles = (event) => Boolean(event.dataTransfer?.types.includes('Files'));
  let dragDepth = 0;
  window.addEventListener('dragenter', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    document.body.dataset.dragging = 'true';
  });
  window.addEventListener('dragover', (event) => {
    if (carriesFiles(event)) event.preventDefault();
  });
  window.addEventListener('dragleave', (event) => {
    if (!carriesFiles(event)) return;
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

  // La imagen de la portada es un enlace a /demo (sirve para abrir en otra pestaña); el
  // clic común abre el ejemplo sin recargar.
  for (const trigger of document.querySelectorAll('[data-example]')) {
    trigger.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      openExample(trigger.dataset.example);
    });
  }
}

async function openExample(kind = 'network') {
  const path = EXAMPLES[kind];
  setStatus('status.reading');
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(t('error.httpStatus', { status: response.status }));
    await open(path.split('/').pop(), new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    showFailure(error.message);
  }
}

// Tema e idioma cambian con un fundido corto de la página entera. Sin View Transitions, o con
// movimiento reducido, el cambio es inmediato.
function crossfade(change) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) change();
  else document.startViewTransition(change);
}

function wireTheme() {
  applyTheme(getTheme());
  elements.themeToggle.addEventListener('click', () => crossfade(() => {
    toggleTheme();
    if (state.kind === 'network') paintNetwork();
  }));
}

// Las columnas se estiran desde su borde: a lo ancho en escritorio y, la lista, a lo alto cuando
// las zonas van apiladas. Cada eje guarda su medida; doble clic vuelve a la de fábrica.
// `sign` es 1 si el borde queda a la derecha de la columna y -1 si queda a la izquierda.
function wireGrip(grip, pane, name, sign, widths) {
  const key = `trenza.${name}`;
  const stacked = matchMedia('(max-width: 1180px)');
  const axis = () => (stacked.matches ? 'height' : 'width');
  const limits = (dimension) => (dimension === 'width' ? widths : [120, Math.round(innerHeight * 0.7)]);
  let sizes = {};
  try {
    sizes = JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    // Sin almacenamiento la medida dura lo que la pestaña.
  }

  const show = () => {
    const dimension = axis();
    const [low, high] = limits(dimension);
    grip.setAttribute('aria-orientation', dimension === 'width' ? 'vertical' : 'horizontal');
    grip.setAttribute('aria-valuemin', low);
    grip.setAttribute('aria-valuemax', high);
    grip.setAttribute('aria-valuenow', Math.round(pane.getBoundingClientRect()[dimension]));
  };
  const resize = (dimension, value) => {
    const [low, high] = limits(dimension);
    if (value === null) delete sizes[dimension];
    else sizes[dimension] = Math.round(Math.min(high, Math.max(low, value)));
    if (sizes[dimension]) document.documentElement.style.setProperty(`--${name}-${dimension}`, `${sizes[dimension]}px`);
    else document.documentElement.style.removeProperty(`--${name}-${dimension}`);
    show();
  };
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify(sizes));
    } catch {
      // Sin almacenamiento la medida no se guarda.
    }
  };

  for (const dimension of ['width', 'height']) if (sizes[dimension]) resize(dimension, sizes[dimension]);
  stacked.addEventListener('change', show);
  grip.addEventListener('focus', show);

  grip.addEventListener('pointerdown', (event) => {
    const dimension = axis();
    const start = pane.getBoundingClientRect()[dimension];
    const from = dimension === 'width' ? event.clientX : event.clientY;
    const move = (moved) => resize(dimension, start + sign * ((dimension === 'width' ? moved.clientX : moved.clientY) - from));
    grip.setPointerCapture(event.pointerId);
    grip.classList.add('is-dragging');
    grip.addEventListener('pointermove', move);
    grip.addEventListener('lostpointercapture', () => {
      grip.removeEventListener('pointermove', move);
      grip.classList.remove('is-dragging');
      save();
    }, { once: true });
  });

  grip.addEventListener('keydown', (event) => {
    const dimension = axis();
    const step = { ArrowRight: 16, ArrowDown: 16, ArrowLeft: -16, ArrowUp: -16 }[event.key];
    if (!step) return;
    event.preventDefault();
    resize(dimension, pane.getBoundingClientRect()[dimension] + sign * step);
    save();
  });

  grip.addEventListener('dblclick', () => {
    resize(axis(), null);
    save();
  });
}

// Se llama después de translateDocument, que pisa el título.
function refreshTitle() {
  document.title = state.file ? `${state.file.name} · Trenza` : t('app.title');
}

function wireLanguage() {
  elements.language.value = getLanguage();
  elements.language.addEventListener('change', () => crossfade(() => {
    setLanguage(elements.language.value);
    translateDocument();
    refreshTitle();

    if (state.status.key) setStatus(state.status.key, state.status.values, state.status.tone);
    if (state.kind === 'network') paintNetwork();
    if (state.kind === 'capture') paintCapture();
  }));
}

function closeFile() {
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
  // A la raíz: si quedara /demo, recargar volvería a abrir el ejemplo.
  history.replaceState(null, '', '/');
  refreshTitle();
  setStatus('status.idle');
}

function wireActions() {
  elements.reset.addEventListener('click', closeFile);

  // El logo es un enlace a / para que funcione sin JavaScript y en otra pestaña.
  elements.home.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    weave(elements.home);
    closeFile();
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
  wireGrip(elements.railGrip, elements.rail, 'rail', 1, [200, 480]);
  wireGrip(elements.panelGrip, elements.panel, 'panel', -1, [280, 600]);
  wireExportDialog({ elements, state, setStatus });
  setStatus('status.idle');

  if (location.pathname !== '/' && !DEMO_PATH.test(location.pathname)) {
    history.replaceState(null, '', `/${location.search}${location.hash}`);
  }

  let source = null;
  try {
    source = await readSourceFromLocation();
    if (source) await open(source.name, source.bytes);
    if (!source && DEMO_PATH.test(location.pathname)) await openExample();
  } catch (error) {
    setStatus('status.linkFailed', { reason: error.message }, 'error');
  }

  acceptLaunchedFiles();
  keepOffline();
}

// Instalado como PWA, abrir un .pkt desde el sistema lo manda por launchQueue
// (file_handlers en el manifiesto). Sólo Chromium de escritorio lo soporta.
function acceptLaunchedFiles() {
  if (!('launchQueue' in window)) return;
  window.launchQueue.setConsumer(async ({ files }) => {
    const [handle] = files ?? [];
    if (handle) await openFile(await handle.getFile());
  });
}

// Se registra al final para que la descarga del shell no compita con la carga inicial.
function keepOffline() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

start();
