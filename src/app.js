import { countOf, getLanguage, setLanguage, t, translateDocument } from './i18n.js';
import { decodePacketTracerFile } from './pkt/decode.js';
import { compareNetworks } from './pkt/compare.js';
import { buildNetworkModel } from './pkt/model.js';
import { inSubnet, macDigits, parseQuery, vlanMembers } from './pkt/query.js';
import { reviewNetwork } from './pkt/review.js';
import { decodeCapture } from './pcap/decode.js';
import { dissectPacket } from './pcap/dissect.js';
import { TopologyView } from './view/topology.js';
import { CATEGORY_ORDER, cablePath, labelFontsReady, selectVisible } from './view/graph.js';
import { categoryIcon, markScrollable, renderDeviceInspector, renderNetworkSummary } from './view/inspector.js';
import { PacketTableView, conversationKey, renderPacketInspector, renderCaptureSummary } from './view/packets.js';
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
  peek: document.querySelector('[data-peek]'),
  status: document.querySelector('[data-status]'),
  fileName: document.querySelector('[data-file-name]'),
  fileInput: document.querySelector('[data-file-input]'),
  reset: document.querySelector('[data-reset]'),
  home: document.querySelector('[data-home]'),
  open: document.querySelector('[data-open]'),
  openCopy: document.querySelector('[data-open-copy]'),
  themeToggle: document.querySelector('[data-theme-toggle]'),
  introTitle: document.querySelector('.intro__title'),
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
  exportCopy: document.querySelector('[data-export-copy]'),
  exportNote: document.querySelector('[data-export-note]'),
  transparentField: document.querySelector('[data-transparent-field]'),
  guideField: document.querySelector('[data-guide-field]'),
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

const canonical = document.querySelector('link[rel="canonical"]');

// La dirección sigue a lo abierto, y la canónica a la dirección: /demo es una página propia.
function go(path) {
  history.replaceState(null, '', path);
  canonical.href = new URL(location.pathname, canonical.href).href;
}

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
  // El tipo elegido en la guía del resumen; se traduce si cambia el idioma.
  categoryFilter: null,
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

// Por tipo, como la guía del resumen, y por nombre con los números como números: PC2 antes que PC10.
const names = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byKindAndName = (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  || names.compare(a.name, b.name);

function renderDeviceList(term = '') {
  elements.rail.replaceChildren();

  labelGrip('action.resizeList');
  const heading = createElement('div', 'rail__head');
  heading.append(railTitle('rail.devices'));

  const toggle = createElement('label', 'toggle');
  const checkbox = createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.showInfrastructure;
  // Sólo se redibuja la lista: rehacer la columna perdería la búsqueda y el foco de la casilla.
  checkbox.addEventListener('change', () => {
    state.showInfrastructure = checkbox.checked;
    const selected = state.devicesById.get(state.selectedDeviceId);
    if (!state.showInfrastructure && selected?.category === 'infrastructure') clearSelection();
    state.topology.render(state.model, { showInfrastructure: state.showInfrastructure });
    if (state.comparison) compareWith(state.comparison.before, state.comparison, true);
    state.review = reviewNetwork(selectVisible(state.model, state.showInfrastructure).devices);
    draw(search.value);
    // En la guía del resumen la infraestructura se puede elegir sólo si está a la vista.
    if (!state.selectedDeviceId) showNetworkSummary();
  });
  toggle.append(checkbox, createElement('span', null, t('rail.infrastructure')));
  heading.append(toggle);
  elements.rail.append(heading);

  const search = createElement('input', 'rail__search');
  search.type = 'search';
  search.placeholder = t('rail.searchDevices');
  search.setAttribute('aria-label', t('rail.searchDevices'));
  search.setAttribute('aria-keyshortcuts', '/');
  search.value = term;
  elements.rail.append(search);

  const list = createElement('ul', 'device-list');
  elements.rail.append(list);

  const draw = (term) => {
    list.replaceChildren();
    const query = parseQuery(term);
    const filtering = query.kind !== 'text' || query.needle !== '';
    const digits = query.kind === 'text' ? macDigits(query.needle) : '';
    const visible = state.showInfrastructure
      ? state.model.devices
      : state.model.devices.filter((device) => device.category !== 'infrastructure');
    const matches = visible.filter((device) => {
      const addresses = device.interfaces.flatMap((entry) => entry.addresses).map((entry) => entry.address);
      if (query.kind === 'subnet') return addresses.some((address) => inSubnet(address, query));
      if (query.kind === 'vlan') return Boolean(state.vlanMembers.get(query.id)?.has(device.id));
      if (!filtering) return true;
      if (digits && device.macs.some((mac) => mac.includes(digits))) return true;
      return `${device.name} ${t(`category.${device.category}`)} ${device.type} ${addresses.join(' ')}`.toLowerCase().includes(query.needle);
    });
    state.topology.markMatches(filtering ? new Set(matches.map((device) => device.id)) : null);

    for (const device of [...matches].sort(byKindAndName)) {
      const item = createElement('li');
      const button = createElement('button', `device-chip device-chip--${device.category}`);
      button.type = 'button';
      button.dataset.id = device.id;
      // Sin la coma oculta el lector junta los 2 textos sin pausa ("PC16Terminal").
      button.append(
        categoryIcon(device.category),
        createElement('span', 'device-chip__name', device.name),
        createElement('span', 'visually-hidden', ', '),
        createElement('span', 'device-chip__meta', t(`category.${device.category}`)),
      );
      button.addEventListener('click', () => selectDevice(device.id));
      item.append(button);
      list.append(item);
    }

    if (matches.length === 0) {
      list.append(createElement('li', 'empty-note', t('rail.noMatches')));
    }
    markChips(state.selectedDeviceId);
    return { shown: matches.length, total: visible.length };
  };

  // Una sola parada del tabulador, como el diagrama: 70 equipos no se recorren de a uno.
  list.addEventListener('keydown', (event) => {
    const chips = [...list.querySelectorAll('.device-chip')];
    const from = chips.indexOf(document.activeElement);
    const to = { ArrowDown: from + 1, ArrowUp: from - 1, Home: 0, End: chips.length - 1 }[event.key];
    if (from < 0 || !chips[to]) return;
    event.preventDefault();
    chips[from].tabIndex = -1;
    chips[to].tabIndex = 0;
    chips[to].focus();
  });

  const announcer = filterAnnouncer();
  elements.rail.append(announcer.region);
  search.addEventListener('input', () => {
    const { shown, total } = draw(search.value);
    markFilters(search.value);
    announcer.say(shown === 0 ? t('rail.noMatches') : t('rail.matches', { shown, total: countOf('devices', total) }));
  });
  draw(term);
}

// La lista cambia sin mover el foco del buscador: el lector oye cuántos quedan al dejar de tipear.
function filterAnnouncer() {
  const region = createElement('p', 'visually-hidden');
  region.setAttribute('role', 'status');
  let pending = 0;
  return {
    region,
    // Con el mismo texto la región no cambia y el lector calla: un espacio duro lo hace distinto.
    say(text) {
      clearTimeout(pending);
      pending = setTimeout(() => { region.textContent = region.textContent === text ? `${text}\u00a0` : text; }, 500);
    },
  };
}

function railTitle(key) {
  const title = createElement('h2', 'rail__title', t(key));
  title.id = 'rail-title';
  return title;
}

function labelGrip(key) {
  elements.railGrip.dataset.i18nLabel = key;
  elements.railGrip.setAttribute('aria-label', t(key));
}

function markChips(id) {
  const chips = [...elements.rail.querySelectorAll('.device-chip')];
  const stop = chips.find((chip) => chip.dataset.id === id) ?? chips[0];
  for (const chip of chips) {
    const own = chip.dataset.id === id;
    chip.classList.toggle('is-selected', own);
    if (own) chip.setAttribute('aria-current', 'true');
    else chip.removeAttribute('aria-current');
    chip.tabIndex = chip === stop ? 0 : -1;
  }
}

function selectDevice(id) {
  const device = state.devicesById.get(id);
  if (!device) return;
  if (id !== state.selectedDeviceId) choosePath(null);
  state.selectedDeviceId = id;
  state.topology.focus(id);
  renderDeviceInspector(elements.panel, device, state.devicesById, {
    onPick: pickPeer,
    canPick: (peer) => peer.category !== 'infrastructure' || state.showInfrastructure,
    change: changeOf(id),
    review: state.review.filter((finding) => finding.devices.includes(id)),
    path: {
      targets: selectVisible(state.model, state.showInfrastructure).devices.slice().sort(byKindAndName),
      chosen: state.pathTarget,
      pathTo: (target) => cablePath(state.devicesById, id, target),
      onChoose: choosePath,
    },
  });
  elements.panel.scrollTop = 0;
  markChips(id);
  linkDevice(device.name);
  elements.peek.textContent = t('panel.peek', { name: device.name });
  elements.peek.hidden = false;
}

// Apiladas, el panel queda debajo del diagrama, fuera de la pantalla: el botón lleva a su título.
function goToPanel() {
  const title = elements.panel.querySelector('.panel-head__title');
  title.tabIndex = -1;
  title.focus();
}

// Desde las conexiones del panel: el botón pulsado desaparece con el panel viejo, así que el
// foco pasa al título del equipo nuevo.
function pickPeer(id) {
  selectDevice(id);
  goToPanel();
}

// El camino sale del equipo elegido; cambiar de equipo o soltarlo lo borra.
function choosePath(target) {
  state.pathTarget = target;
  const steps = target ? cablePath(state.devicesById, state.selectedDeviceId, target) : null;
  state.topology?.showPath(steps ? steps.map((step) => step.id) : null);
}

function clearSelection() {
  if (state.kind !== 'network') return;
  choosePath(null);
  state.selectedDeviceId = null;
  state.topology.clearSelection();
  markChips(null);
  showNetworkSummary();
  linkDevice(null);
  elements.peek.hidden = true;
}

// Con /demo o ?src= la dirección se puede compartir, y el # nombra el equipo elegido:
// /demo#Router%20Principal abre el ejemplo con el router marcado.
function shareable() {
  return DEMO_PATH.test(location.pathname) || new URLSearchParams(location.search).has('src');
}

function linkDevice(name) {
  if (!shareable()) return;
  const hash = name ? `#${encodeURIComponent(name)}` : '';
  if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
}

function selectFromHash() {
  if (state.kind !== 'network' || !location.hash) return;
  let name;
  try {
    name = decodeURIComponent(location.hash.slice(1));
  } catch {
    return;
  }
  const device = state.model.devices.find((entry) => entry.name === name);
  if (!device || (device.category === 'infrastructure' && !state.showInfrastructure)) return;
  selectDevice(device.id);
}

// Desde la guía del resumen: escribe el tipo en el buscador, que es lo que filtra lista y
// diagrama. El mismo tipo otra vez lo borra.
function filterCategory(category) {
  const search = elements.rail.querySelector('.rail__search');
  if (!search) return;
  search.value = state.categoryFilter === category ? '' : t(`category.${category}`);
  search.dispatchEvent(new Event('input'));
}

function filterSubnet(cidr) {
  const search = elements.rail.querySelector('.rail__search');
  if (!search) return;
  search.value = search.value.trim().toLowerCase() === cidr ? '' : cidr;
  search.dispatchEvent(new Event('input'));
}

// Escribir a mano el nombre de un tipo o una red también la marca en el resumen.
function markFilters(term) {
  const needle = term.trim().toLowerCase();
  for (const button of elements.panel.querySelectorAll('[data-subnet]')) {
    button.setAttribute('aria-pressed', String(button.dataset.subnet === needle));
  }
  const categories = new Set(state.model.devices.map((device) => device.category));
  state.categoryFilter = [...categories].find((category) => needle && t(`category.${category}`).toLowerCase() === needle) ?? null;
  for (const button of elements.panel.querySelectorAll('[data-category]')) {
    button.setAttribute('aria-pressed', String(button.dataset.category === state.categoryFilter));
  }
}

function showNetworkSummary() {
  renderNetworkSummary(elements.panel, state.model, {
    fileName: state.file.name,
    variant: state.variant,
    onDownload: () => download(new Blob([state.file.bytes]), state.file.name),
    onFilter: filterCategory,
    filtering: state.categoryFilter,
    onSubnet: filterSubnet,
    subnetFilter: elements.rail.querySelector('.rail__search')?.value.trim().toLowerCase(),
    hidden: (category) => category === 'infrastructure' && !state.showInfrastructure,
    review: {
      findings: state.review,
      onPick: pickPeer,
      canPick: (peer) => peer.category !== 'infrastructure' || state.showInfrastructure,
    },
    compare: {
      result: state.comparison?.result,
      label: state.comparison && (state.comparison.file ?? t('panel.initialNetwork')),
      onCompareFile: () => elements.compareInput.click(),
      onCompareInitial: () => compareWith(state.model.initial, { file: null }),
      onStop: stopComparing,
      onPick: pickPeer,
      canPick: (peer) => peer.category !== 'infrastructure' || state.showInfrastructure,
    },
  });
}

// El archivo abierto es el de después, con los mismos equipos a la vista que el diagrama. `file`
// en null es la red inicial de la actividad, que se nombra en el idioma de la interfaz.
function compareWith(before, { file }, quiet = false) {
  const result = compareNetworks(selectVisible(before, state.showInfrastructure), selectVisible(state.model, state.showInfrastructure));
  state.comparison = { file, before, result };
  state.topology.markChanges({ changed: new Set(result.changed.keys()), added: new Set(result.added.map((device) => device.id)) });
  if (quiet) return;
  setStatus('status.compared', {
    name: file ?? t('panel.initialNetwork'),
    devices: { key: 'unit.devices', values: { count: result.changed.size + result.added.length } },
  }, 'ok');
  refreshPanel();
  // El botón pulsado ya no está: el foco va al título de la sección, que sigue con el resultado.
  const heading = elements.panel.querySelector('.compare')?.closest('section')?.querySelector('h3');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}

function stopComparing() {
  state.comparison = null;
  state.topology.markChanges(null);
  refreshPanel();
  elements.panel.querySelector('.compare button')?.focus();
}

function refreshPanel() {
  if (state.selectedDeviceId) selectDevice(state.selectedDeviceId);
  else showNetworkSummary();
}

function changeOf(id) {
  const result = state.comparison?.result;
  if (!result) return null;
  if (result.added.some((device) => device.id === id)) return { added: true, renamed: '', config: [], addresses: [] };
  return result.changed.get(id) ?? null;
}

async function compareFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (looksLikeCapture(file.name, bytes)) {
    setStatus('error.compareCapture', null, 'error');
    return;
  }
  setStatus('status.reading');
  try {
    const decoded = await decodePacketTracerFile(bytes);
    compareWith(buildNetworkModel(new TextDecoder().decode(decoded.xml)), { file: file.name });
  } catch (error) {
    setStatus('status.compareFailed', { reason: error.message }, 'error');
  }
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
  showNetworkSummary();
}

// En otro idioma el diagrama sale igual: la vista, la búsqueda y el filtro de cables siguen.
function translateNetwork() {
  const term = state.categoryFilter
    ? t(`category.${state.categoryFilter}`)
    : elements.rail.querySelector('.rail__search')?.value;
  state.topology.render(state.model, { showInfrastructure: state.showInfrastructure, keepView: true });
  renderDeviceList(term);
  if (state.selectedDeviceId) selectDevice(state.selectedDeviceId);
  else showNetworkSummary();
}

async function showNetwork(bytes) {
  // El reparto mide los nombres: con la tipografía todavía en camino habría que repartir 2 veces.
  const fonts = labelFontsReady();
  const decoded = await decodePacketTracerFile(bytes);
  const model = buildNetworkModel(new TextDecoder().decode(decoded.xml));
  await fonts;

  state.kind = 'network';
  document.body.dataset.view = 'network';
  labelExport('action.export');
  state.model = model;
  state.variant = decoded.variant;
  state.devicesById = new Map(model.devices.map((device) => [device.id, device]));
  state.vlanMembers = vlanMembers(model);
  state.review = reviewNetwork(selectVisible(model, state.showInfrastructure).devices);
  state.selectedDeviceId = null;
  state.categoryFilter = null;
  state.comparison = null;

  paintNetwork();
  // Los equipos de red: una regleta o un rack no cuentan, igual que en el diagrama.
  const network = selectVisible(model, false);
  setStatus('status.network', {
    devices: { key: 'unit.devices', values: { count: network.devices.length } },
    links: { key: 'unit.links', values: { count: network.links.length } },
  }, 'ok');
}

// `keep`: al cambiar de idioma los resúmenes se traducen, pero el filtro y el orden siguen.
function paintCapture(keep = false) {
  const filter = keep ? elements.rail.querySelector('.rail__search')?.value ?? '' : '';
  const sort = keep ? state.packetTable.sort : null;
  state.packets = state.capture.packets.map(dissectPacket);

  clearStage();
  const table = createElement('div', 'stage__table');
  elements.stage.append(table);

  state.packetTable = new PacketTableView(table, { onSelect: showPacketSelection });
  state.packetTable.load(state.packets, { filter, sort });
  if (state.packetSelection.length > 0) state.packetTable.select(state.packetSelection);

  elements.rail.replaceChildren();
  labelGrip('action.resizeFilter');
  const heading = createElement('div', 'rail__head');
  heading.append(railTitle('rail.filter'));
  elements.rail.append(heading);

  const search = createElement('input', 'rail__search');
  search.type = 'search';
  search.placeholder = t('rail.searchPackets');
  search.setAttribute('aria-label', t('rail.searchPackets'));
  search.setAttribute('aria-keyshortcuts', '/');
  search.value = filter;
  const announcer = filterAnnouncer();
  search.addEventListener('input', () => {
    state.packetTable.setFilter(search.value);
    const { shown, total } = state.packetTable.count();
    announcer.say(shown === 0 ? t('table.noPackets') : t('rail.matches', { shown, total: countOf('packets', total) }));
  });
  elements.rail.append(
    search,
    createElement('p', 'rail__hint', t('rail.filterHint')),
    createElement('p', 'rail__hint', t('rail.multiselect')),
    announcer.region,
  );

  showPacketSelection(state.packetTable.getSelection(), null);
}

function showPacketSelection(selection, last) {
  state.packetSelection = selection.map((packet) => packet.index);
  const pair = state.packetTable.conversation;
  const conversation = { onConversation: showConversation, activeConversation: pair ? conversationKey(pair) : null };

  if (selection.length === 1 || (last && selection.length === 0)) {
    renderPacketInspector(elements.panel, last ?? selection[0], conversation);
  } else if (selection.length > 1) {
    renderCaptureSummary(elements.panel, state.capture, selection, { title: t('panel.selection'), ...conversation });
  } else {
    renderCaptureSummary(elements.panel, state.capture, state.packets, conversation);
  }
}

// Como si se hubiera escrito el par; la misma del resumen otra vez lo borra. El panel se rehace:
// el foco vuelve al mismo botón y, desde un paquete, ese paquete sigue elegido.
function showConversation(ends, packet) {
  const search = elements.rail.querySelector('.rail__search');
  const pair = state.packetTable.conversation;
  const again = !packet && pair && conversationKey(pair) === conversationKey(ends);
  search.value = again ? '' : ends.join(' ');
  search.dispatchEvent(new Event('input'));
  if (packet) {
    state.packetTable.select([packet.index]);
    showPacketSelection([packet], packet);
  }
  const key = ends.join(' ');
  [...elements.panel.querySelectorAll('[data-conversation]')].find((button) => button.dataset.conversation === key)?.focus();
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
  const trigger = document.activeElement;
  state.file = { name, bytes };
  state.kind = null;
  state.model = null;
  state.comparison = null;
  state.capture = null;
  delete document.body.dataset.view;
  elements.peek.hidden = true;
  elements.fileName.textContent = name;
  refreshTitle();
  document.documentElement.dataset.loaded = 'true';
  rescueFocus(trigger, elements.fileName);
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
  readGrips();
}

// El botón que abrió o cerró el archivo puede haber desaparecido y el foco caería en cualquier
// lado. Al cargar la página no había foco que perder.
function rescueFocus(trigger, target) {
  if (!trigger || trigger === document.body) return;
  const focused = document.activeElement;
  if (focused && focused !== document.body && focused.getClientRects().length > 0) return;
  target.focus();
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

// Un archivo propio no tiene dirección: si quedara /demo, recargar abriría el ejemplo.
async function openFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  go('/');
  await open(file.name, bytes);
}

// Un selector aparte: el de abrir reemplazaría la red que se está mirando.
function wireCompareInput() {
  const input = document.createElement('input');
  input.type = 'file';
  input.hidden = true;
  input.dataset.compareInput = '';
  input.accept = elements.fileInput.getAttribute('accept') ?? '';
  input.addEventListener('change', () => {
    const [file] = input.files;
    input.value = '';
    if (file && state.kind === 'network') compareFile(file);
  });
  document.body.append(input);
  elements.compareInput = input;
}

function wireFileInput() {
  // iPhone y iPad no conocen .pkt ni .pcap y pueden dejarlos en gris en el selector; igual se
  // revisa el contenido al abrir. Un iPad se presenta como Macintosh, pero con pantalla táctil.
  if (/iPhone|iPad|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) {
    elements.fileInput.removeAttribute('accept');
  }

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

// La red de ejemplo vive en /demo, así recargar o compartir la dirección la vuelve a abrir.
async function openExample(kind = 'network') {
  const path = EXAMPLES[kind];
  const there = kind === 'network' ? DEMO_PATH.test(location.pathname) : location.pathname === '/';
  if (!there) go(kind === 'network' ? '/demo' : '/');
  setStatus('status.reading');
  // En /demo el guion de la cabecera ya pidió la red, en paralelo con los módulos.
  const early = kind === 'network' ? window.pendingExample : null;
  window.pendingExample = null;
  try {
    const response = await (early ?? fetch(path));
    if (!response.ok) throw new Error(t('error.httpStatus', { status: response.status }));
    await open(path.split('/').pop(), new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    showFailure(error.message);
  }
}

// El idioma cambia con un fundido corto; el tema nuevo se abre en círculo desde `origin`. Sin
// View Transitions, o con movimiento reducido, el cambio es inmediato.
function crossfade(change, origin) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    change();
    return;
  }
  const root = document.documentElement;
  root.classList.toggle('is-revealing', Boolean(origin));
  const transition = document.startViewTransition(change);
  const done = () => root.classList.remove('is-revealing');
  transition.finished.then(done, done);
  if (!origin) return;

  transition.ready.then(() => {
    const box = origin.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}

// "Tema claro, presionado": el lector dice cuál está puesto, cosa que el icono sólo muestra.
function markTheme() {
  elements.themeToggle.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'light'));
}

function wireTheme() {
  applyTheme(getTheme());
  markTheme();
  // El diagrama toma los colores de variables CSS: cambiar el tema no lo rehace ni pierde la vista.
  elements.themeToggle.addEventListener('click', () => crossfade(() => {
    toggleTheme();
    markTheme();
  }, elements.themeToggle));
}

// Un separador que recibe foco tiene que decir su medida desde el principio. Se mide al abrir y
// al cambiar la ventana: un ResizeObserver sobre las columnas choca en Safari con el del diagrama.
const gripReaders = [];

function readGrips() {
  requestAnimationFrame(() => gripReaders.forEach((read) => read()));
}

// Columnas que se estiran desde su borde (la lista, a lo alto si van apiladas); doble clic vuelve
// a la medida de fábrica. `sign` es 1 con el borde a la derecha de la columna y -1 a la izquierda.
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
  gripReaders.push(show);
  const resize = (dimension, value) => {
    const [low, high] = limits(dimension);
    if (value === null) delete sizes[dimension];
    else sizes[dimension] = Math.round(Math.min(high, Math.max(low, value)));
    if (sizes[dimension]) document.documentElement.style.setProperty(`--${name}-${dimension}`, `${sizes[dimension]}px`);
    else document.documentElement.style.removeProperty(`--${name}-${dimension}`);
    show();
    markScrollable(elements.panel);
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
    if (state.kind === 'network') translateNetwork();
    if (state.kind === 'capture') paintCapture(true);
  }));
}

function closeFile() {
  const trigger = document.activeElement;
  state.file = null;
  state.kind = null;
  state.model = null;
  state.comparison = null;
  state.capture = null;
  state.selectedDeviceId = null;
  state.categoryFilter = null;
  elements.peek.hidden = true;
  delete document.documentElement.dataset.loaded;
  delete document.body.dataset.view;
  elements.fileName.textContent = '';
  clearStage();
  elements.rail.replaceChildren();
  elements.panel.replaceChildren();
  elements.fileInput.value = '';
  // A la raíz: si quedara /demo, recargar volvería a abrir el ejemplo.
  go('/');
  refreshTitle();
  setStatus('status.idle');
  rescueFocus(trigger, elements.introTitle);
}

function wireActions() {
  elements.reset.addEventListener('click', closeFile);
  elements.peek.addEventListener('click', goToPanel);

  // El logo es un enlace a / para que funcione sin JavaScript y en otra pestaña.
  elements.home.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    weave(elements.home);
    closeFile();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.exportDialog.open) clearSelection();

    // "/" lleva al buscador de la columna, salvo mientras se escribe en otro campo.
    const typing = event.target.closest?.('input, select, textarea, [contenteditable]');
    const search = elements.rail.querySelector('.rail__search');
    if (event.key === '/' && search && !typing && !event.ctrlKey && !event.metaKey && !event.altKey
      && !elements.exportDialog.open) {
      event.preventDefault();
      search.focus();
    }
  });
}

async function start() {
  translateDocument();
  wireLanguage();
  wireTheme();
  wireFileInput();
  wireCompareInput();
  wireActions();
  wireGrip(elements.railGrip, elements.rail, 'rail', 1, [200, 480]);
  wireGrip(elements.panelGrip, elements.panel, 'panel', -1, [280, 600]);
  window.addEventListener('resize', readGrips);
  window.addEventListener('resize', () => markScrollable(elements.panel));
  wireExportDialog({ elements, state, setStatus });
  setStatus('status.idle');

  go(`${DEMO_PATH.test(location.pathname) ? '/demo' : '/'}${location.search}${location.hash}`);

  let source = null;
  try {
    source = await readSourceFromLocation();
    if (source) await open(source.name, source.bytes);
    if (!source && DEMO_PATH.test(location.pathname)) await openExample();
    selectFromHash();
  } catch (error) {
    setStatus('status.linkFailed', { reason: error.message }, 'error');
  }
  // El guion de la cabecera ya mostró el visor; si no se abrió nada, vuelve la portada.
  if (!state.file) delete document.documentElement.dataset.loaded;
  window.addEventListener('hashchange', selectFromHash);

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
