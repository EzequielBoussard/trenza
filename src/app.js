import { countOf, getLanguage, setLanguage, t, translateDocument, withLanguage } from './i18n.js';
import { decodePacketTracerFile } from './pkt/decode.js';
import { buildNetworkModel } from './pkt/model.js';
import { decodeCapture } from './pcap/decode.js';
import { dissectPacket } from './pcap/dissect.js';
import { TopologyView } from './view/topology.js';
import { renderDeviceInspector, renderNetworkSummary } from './view/inspector.js';
import { PacketTableView, renderPacketInspector, renderCaptureSummary } from './view/packets.js';
import { toCsv, toPcap } from './pcap/encode.js';
import { readSourceFromLocation } from './share.js';
import {
  DEFAULT_PAPER,
  DEFAULT_RESOLUTION,
  SIZE_LABELS,
  VECTOR_FORMATS,
  exportNetwork,
  offeredSizes,
  renderNetworkPreview,
  suggestExportName,
} from './view/export.js';
import { download } from './download.js';
import { applyTheme, currentTheme, getTheme, toggleTheme } from './theme.js';

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

const EXAMPLE_FILE = './showcase/Entrega Redes Ansian.pkt';
const EXAMPLE_NAME = 'Entrega Redes Ansian.pkt';

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

function paintNetwork() {
  elements.stage.replaceChildren();
  const canvas = createElement('div', 'stage__canvas');
  elements.stage.append(canvas);

  state.topology = new TopologyView(canvas, { onSelect: selectDevice, onClear: clearSelection });
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

  elements.stage.replaceChildren();
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
  elements.stage.replaceChildren(createElement('p', 'empty-note', message));
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

  elements.example.addEventListener('click', async () => {
    setStatus('status.reading');
    try {
      const response = await fetch(EXAMPLE_FILE);
      if (!response.ok) throw new Error(t('error.httpStatus', { status: response.status }));
      await open(EXAMPLE_NAME, new Uint8Array(await response.arrayBuffer()));
    } catch (error) {
      showFailure(error.message);
    }
  });
}

const CAPTURE_NOTES = { csv: 'export.csvNote', pcap: 'export.pcapNote' };

function wireExport() {
  // Cada tipo de archivo ofrece sus formatos: de una captura no sale un diagrama, y
  // de una topología no sale una tabla de paquetes.
  const updateFormatFields = () => {
    const capture = state.kind === 'capture';
    const fields = elements.exportForm.elements;

    for (const option of elements.exportForm.querySelectorAll('.choice__option')) {
      option.hidden = option.dataset.for !== state.kind;
    }
    if (elements.exportForm.querySelector('.choice__option[hidden] input:checked')) {
      elements.exportForm.querySelector('.choice__option:not([hidden]) input').checked = true;
    }

    const format = fields.format.value;
    const vector = VECTOR_FORMATS.includes(format);

    elements.transparentField.hidden = capture || format === 'jpg' || format === 'pdf';
    elements.sizeField.hidden = capture || vector;
    if (!capture && !vector) updateSizeOptions();

    // El idioma alcanza a todo lo que lleve texto; el tema, sólo a lo que se dibuja. Un
    // pcap no tiene ni una cosa ni la otra.
    elements.languageField.hidden = format === 'pcap';
    elements.themeField.hidden = capture;
    elements.scopeField.hidden = !capture || state.packetSelection.length === 0;
    elements.exportNote.textContent = capture ? t(CAPTURE_NOTES[format] ?? '')
      : vector ? t('export.svgNote')
        : format === 'pdf' ? t('export.pdfNote') : '';

    schedulePreview();
  };

  // Ancho al que se dibuja la vista previa. Va al doble de lo que ocupa en pantalla para
  // que se vea nítida en pantallas densas, y aun así cuesta una fracción de la salida real.
  const PREVIEW_WIDTH = 1800;
  const PREVIEW_DELAY = 120;

  // Ancho de la lupa, hasta dónde puede achicarse en un diálogo angosto, y su proporción.
  const LENS_SIZE = 440;
  const MIN_LENS_SIZE = 240;
  const LENS_ASPECT = 0.66;
  const LENS_ROOM = 1.5;

  let previewTimer = 0;
  let previewToken = 0;
  let lens = null;

  const exportRequest = () => {
    const fields = elements.exportForm.elements;
    return {
      format: fields.format.value,
      name: fields.name.value.trim() || suggestExportName(state.file.name),
      size: fields.size.value,
      transparent: fields.transparent.checked,
      showInfrastructure: state.showInfrastructure,
      language: fields.language.value,
      theme: fields.theme.value,
    };
  };

  /**
   * Dibuja la salida tal como va a quedar. Dos resoluciones del mismo formato dan la misma
   * imagen —el reparto no depende de los píxeles, sólo la definición—, así que el pie de
   * la vista dice la medida real y cuántas etiquetas quedaron afuera, que es lo que cambia.
   */
  const drawPreview = async () => {
    const request = exportRequest();
    const token = ++previewToken;

    try {
      const result = await renderNetworkPreview(state.model, request, PREVIEW_WIDTH);
      if (token !== previewToken) return;

      elements.previewFrame.replaceChildren(result.canvas, elements.previewLens);
      elements.previewFrame.classList.toggle('preview--alpha', request.transparent && request.format === 'png');
      lens = { canvas: result.canvas, design: result.design, magnify: result.magnify };
      elements.previewLens.hidden = true;

      const measure = VECTOR_FORMATS.includes(request.format)
        ? `${Math.round(result.width)} × ${Math.round(result.height)}`
        : `${result.width} × ${result.height} px`;
      const paper = request.format === 'pdf' && SIZE_LABELS[request.size];
      const trimmed = result.hidden > 0
        ? t('export.previewTrimmed', { hidden: countOf('labels', result.hidden) })
        : '';

      elements.previewNote.textContent = [paper, measure, trimmed].filter(Boolean).join(' · ');
    } catch (error) {
      if (token !== previewToken) return;
      elements.previewFrame.replaceChildren();
      elements.previewNote.textContent = error.message;
    }
  };

  /**
   * La lupa dibuja el recorte a la escala real del archivo, no un aumento de la vista
   * previa: es la única forma de ver antes de bajar si los nombres y las direcciones se van
   * a leer. El punto del puntero se pasa a unidades de diseño, que es en las que piensa
   * el dibujo, y de ahí sale el centro del recorte.
   */
  const moveLens = (event) => {
    if (!lens) return;

    const frame = lens.canvas.getBoundingClientRect();
    const inside = event.clientX >= frame.left && event.clientX <= frame.right
      && event.clientY >= frame.top && event.clientY <= frame.bottom;
    elements.previewLens.hidden = !inside;
    if (!inside) return;

    const side = Math.min(LENS_SIZE, Math.max(MIN_LENS_SIZE, Math.round(frame.width / 1.9)));
    const tall = Math.round(side * LENS_ASPECT);

    // Una lupa que tapa media vista previa no aumenta nada: en un recuadro así de chico se
    // queda guardada y se mira el diagrama entero, que es lo que hay lugar para ver.
    if (frame.width < side * LENS_ROOM || frame.height < tall * LENS_ROOM) {
      elements.previewLens.hidden = true;
      return;
    }

    // Cambiar el tamaño del lienzo lo borra, así que sólo se toca cuando de verdad cambió.
    if (elements.previewLensCanvas.width !== side || elements.previewLensCanvas.height !== tall) {
      elements.previewLensCanvas.width = side;
      elements.previewLensCanvas.height = tall;
    }
    elements.previewLens.style.width = `${side}px`;
    elements.previewLens.style.height = `${tall}px`;

    // La lupa se queda dentro del recuadro aunque el puntero llegue al borde: el diálogo se
    // desplaza por dentro y lo que sobresalga queda cortado. El recorte sigue centrado en el
    // puntero de verdad, así que en los bordes la lupa se separa un poco pero no miente.
    const box = elements.previewFrame.getBoundingClientRect();
    const within = (value, span, edge) => Math.min(Math.max(value, edge / 2), span - edge / 2);
    elements.previewLens.style.left = `${within(event.clientX - box.left, box.width, side)}px`;
    elements.previewLens.style.top = `${within(event.clientY - box.top, box.height, tall)}px`;

    lens.magnify(elements.previewLensCanvas, {
      x: (event.clientX - frame.left) / frame.width * lens.design.width,
      y: (event.clientY - frame.top) / frame.height * lens.design.height,
    });
  };

  const schedulePreview = () => {
    const shows = state.kind === 'network';

    elements.previewPanel.hidden = !shows;
    elements.exportDialog.classList.toggle('dialog--wide', shows);
    if (!shows) return;

    clearTimeout(previewTimer);
    previewTimer = setTimeout(drawPreview, PREVIEW_DELAY);
  };

  const updateScopeOptions = () => {
    const [all, selection] = elements.exportForm.elements.scope.options;
    all.textContent = t('export.scopeAll', { count: state.packets.length });
    selection.textContent = t('export.scopeSelection', { count: state.packetSelection.length });
    elements.exportForm.elements.scope.value = state.packetSelection.length > 0 ? 'selection' : 'all';
  };

  // Una medida en la que el diagrama quedaría ilegible no se ofrece, y punto: una
  // opción tachada con su explicación es ruido que nadie va a elegir igual.
  const updateSizeOptions = () => {
    const format = elements.exportForm.elements.format.value;
    const paper = format === 'pdf';
    const offered = offeredSizes(state.model, { showInfrastructure: state.showInfrastructure, format });
    const select = elements.exportForm.elements.size;
    const chosen = select.value;

    elements.sizeLabel.textContent = t(paper ? 'export.paper' : 'export.resolution');
    select.replaceChildren(...offered.map((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name === 'fit' ? t('export.fit') : SIZE_LABELS[name];
      return option;
    }));

    // Cambiar de tema o de idioma vuelve a pasar por acá; si la medida elegida sigue
    // estando, se respeta en vez de saltar sola a la preferida.
    const preferred = paper ? DEFAULT_PAPER : DEFAULT_RESOLUTION;
    const wanted = [chosen, preferred].find((name) => offered.includes(name));
    select.value = wanted ?? offered[0];
  };

  elements.export.addEventListener('click', () => {
    if (!state.kind) return;
    const fields = elements.exportForm.elements;
    fields.name.value = suggestExportName(state.file.name);
    // El diálogo abre con lo que el usuario está mirando; cambiarlo acá no toca el visor.
    fields.language.value = getLanguage();
    fields.theme.value = currentTheme();
    if (state.kind === 'capture') updateScopeOptions();
    updateFormatFields();
    elements.exportDialog.showModal();
    fields.name.select();
  });

  elements.exportForm.addEventListener('change', updateFormatFields);
  elements.previewFrame.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') moveLens(event);
  });
  elements.previewFrame.addEventListener('pointerleave', () => { elements.previewLens.hidden = true; });
  elements.exportCancel.addEventListener('click', () => elements.exportDialog.close());

  elements.exportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = elements.exportForm.elements;
    const request = exportRequest();

    elements.exportDialog.close();
    setStatus('status.exporting');

    if (state.kind === 'capture') {
      exportCapture(request.name, fields.format.value, fields.scope.value, request.language);
      return;
    }

    try {
      const result = await exportNetwork(state.model, request);
      // Ni un vector ni una hoja se miden en píxeles; informarlos así haría creerlo.
      const message = VECTOR_FORMATS.includes(request.format) ? 'status.exportedVector'
        : result.paper ? 'status.exportedPaper'
          : request.format === 'pdf' ? 'status.exportedPlain'
            : result.hidden > 0 ? 'status.exportedTrimmed' : 'status.exported';

      setStatus(message, {
        file: result.fileName,
        width: result.width,
        height: result.height,
        paper: SIZE_LABELS[result.paper],
        size: Math.round(result.bytes / 1024),
        hidden: { key: 'unit.labels', values: { count: result.hidden } },
      }, 'ok');
    } catch (error) {
      setStatus('status.exportFailed', { reason: error.message }, 'error');
    }
  });
}

function wireTheme() {
  applyTheme(getTheme());
  elements.themeToggle.addEventListener('click', () => {
    toggleTheme();
    if (state.kind === 'network') paintNetwork();
  });

}

/** Vuelca la captura, entera o sólo el tramo elegido, a un formato que lea cualquiera. */
function exportCapture(name, format, scope, language) {
  const packets = scope === 'selection' && state.packetSelection.length > 0
    ? state.packetTable.getSelection()
    : state.packets;

  const origin = state.packets.length > 0 ? state.packets[0].timestamp : 0;
  // Sólo el CSV lleva texto, y va en el idioma elegido para exportar; el aviso de abajo
  // es del visor y se queda en el suyo.
  const { blob, written } = format === 'csv'
    ? { blob: withLanguage(language, () => toCsv(packets, { origin })), written: packets.length }
    : toPcap(packets);

  const fileName = `${name}.${format}`;
  download(blob, fileName);
  setStatus('status.exportedData', {
    file: fileName,
    packets: { key: 'unit.packets', values: { count: written } },
    size: Math.round(blob.size / 1024),
  }, 'ok');
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
    elements.stage.replaceChildren();
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
