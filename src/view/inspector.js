import { countOf, getLocale, t } from '../i18n.js';
import { CATEGORY_GLYPHS, CATEGORY_ORDER, CATEGORY_THREADS, selectVisible } from './graph.js';
import { renderRichText } from './rich-text.js';
import { subnetsOf } from '../pkt/query.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createElement(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

// El mismo símbolo y el mismo color que el equipo tiene en el diagrama.
export function categoryIcon(category) {
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('class', 'glyph');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.style.setProperty('stroke', `var(--${(CATEGORY_THREADS[category] ?? CATEGORY_THREADS.other)[0]})`);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', CATEGORY_GLYPHS[category] ?? CATEGORY_GLYPHS.other);
  icon.append(path);
  return icon;
}

function definitionList(entries) {
  const list = createElement('dl', 'facts');
  for (const [term, value] of entries) {
    list.append(createElement('dt', null, term), createElement('dd', null, value));
  }
  return list;
}

// Una tabla que no entra se desplaza en su recuadro en vez de ensanchar el panel.
function scrollable(table) {
  const wrapper = createElement('div', 'table-scroller');
  wrapper.append(table);
  return wrapper;
}

// GigabitEthernet0/0.10 no tiene dónde cortar: se corta antes del número, nunca en la palabra.
function withPortBreaks(text) {
  return text.split(/(?<=[a-z]{3})(?=[0-9])/i)
    .flatMap((part, index) => (index === 0 ? [part] : [document.createElement('wbr'), part]));
}

function dataTable(headings, rows) {
  const table = createElement('table', 'table');
  const headRow = createElement('tr');
  for (const key of headings) headRow.append(createElement('th', null, t(key)));

  const head = createElement('thead');
  head.append(headRow);

  const body = createElement('tbody');
  for (const cells of rows) {
    const row = createElement('tr');
    for (const { text, sub, mono, wrap, lines } of cells) {
      const className = [mono && 'table__mono', wrap && 'table__wrap', lines && 'table__lines']
        .filter(Boolean).join(' ');
      const cell = createElement('td', className || null);
      if (wrap) cell.append(...withPortBreaks(text));
      else cell.textContent = text;
      if (sub) cell.append(createElement('span', 'table__sub', sub));
      row.append(cell);
    }
    body.append(row);
  }

  table.append(head, body);
  return scrollable(table);
}

// La máscara va debajo de la dirección y más tenue: en una columna aparte la tabla no entra en
// el panel, y para quien sólo quiere saber la dirección es un dato secundario.
function addressCell({ address, mask }) {
  const cell = createElement('td', 'table__mono', address);
  if (mask) cell.append(createElement('span', 'table__sub', mask));
  return cell;
}

function interfaceTable(interfaces) {
  const table = createElement('table', 'table');
  const head = createElement('thead');
  const headRow = createElement('tr');
  for (const key of ['table.interface', 'table.address', 'table.state']) {
    headRow.append(createElement('th', null, t(key)));
  }
  head.append(headRow);

  const body = createElement('tbody');
  for (const entry of interfaces) {
    const addresses = entry.addresses.length > 0 ? entry.addresses : [{ address: '-' }];
    for (const address of addresses) {
      const row = createElement('tr');
      const name = createElement('td', 'table__mono');
      name.append(...withPortBreaks(entry.name || entry.mac || '-'));
      if (entry.description) name.title = entry.description;

      row.append(
        name,
        addressCell(address),
        createElement('td', null, t(entry.enabled ? 'table.up' : 'table.down')),
      );
      body.append(row);
    }
  }

  table.append(head, body);
  return scrollable(table);
}

// Las abreviaturas de `show vlan brief`: con los nombres enteros la tabla no entra en el panel.
const PORT_ABBREVIATIONS = [
  [/^TenGigabitEthernet/i, 'Te'], [/^GigabitEthernet/i, 'Gi'], [/^FastEthernet/i, 'Fa'],
  [/^Ethernet/i, 'Et'], [/^Serial/i, 'Se'], [/^Port-channel/i, 'Po'],
];

function shortPort(name) {
  for (const [long, short] of PORT_ABBREVIATIONS) if (long.test(name)) return name.replace(long, short);
  return name;
}

// Agrupada por VLAN: por puerto, un switch de 24 bocas serían 24 renglones.
function vlanTable(vlans) {
  // Las columnas de voz y de subinterfaces sólo aparecen si algún puerto las usa.
  const voice = vlans.some((vlan) => vlan.voice.length > 0);
  const routed = vlans.some((vlan) => vlan.routed.length > 0);
  const headings = ['table.vlan', 'table.accessPorts'];
  if (voice) headings.push('table.voicePorts');
  headings.push('table.trunkPorts');
  if (routed) headings.push('table.routedPorts');
  const list = (names) => names.map(shortPort).join(', ') || '-';
  const trunk = (vlan, name) => (vlan.native.includes(name) ? `${name} (${t('table.native')})` : name);

  return dataTable(headings, vlans.map((vlan) => {
    const cells = [
      { text: vlan.id, sub: vlan.name, mono: true },
      { text: list(vlan.ports), mono: true, wrap: true },
    ];
    if (voice) cells.push({ text: list(vlan.voice), mono: true, wrap: true });
    cells.push({ text: list(vlan.trunks.map((name) => trunk(vlan, name))), mono: true, wrap: true });
    if (routed) cells.push({ text: list(vlan.routed), mono: true, wrap: true });
    return cells;
  }));
}

function routeTable(routes) {
  return dataTable(
    ['table.destination', 'table.mask', 'table.via'],
    routes.map((route) => [
      { text: route.destination, mono: true },
      { text: route.mask || '-', mono: true },
      { text: route.via, mono: true },
    ]),
  );
}

// "RIP v2", "OSPF 1", "EIGRP 100"
function protocolLabel(entry) {
  const version = entry.version ? `v${entry.version}` : '';
  return [entry.protocol, entry.id, version].filter(Boolean).join(' ');
}

function routingTable(routing) {
  const passive = routing.some((entry) => entry.passive.length > 0);
  const headings = ['table.protocol', 'table.networks'];
  if (passive) headings.push('table.passive');

  return dataTable(headings, routing.map((entry) => {
    const label = [protocolLabel(entry), entry.routerId && `router-id ${entry.routerId}`].filter(Boolean);
    const cells = [
      { text: label.join('\n'), lines: true },
      { text: entry.networks.join('\n') || '-', mono: true, lines: true, wrap: true },
    ];
    if (passive) cells.push({ text: entry.passive.join('\n') || '-', mono: true, lines: true, wrap: true });
    return cells;
  }));
}

function accessListTable(lists) {
  const applied = (entry) => [
    ...entry.inbound.map((name) => `${name} in`),
    ...entry.outbound.map((name) => `${name} out`),
  ];

  return dataTable(
    ['table.accessList', 'table.aclRules', 'table.aclApplied'],
    lists.map((entry) => [
      { text: entry.id, mono: true },
      { text: entry.rules.join('\n') || '-', mono: true, lines: true, wrap: true },
      { text: applied(entry).join('\n') || '-', mono: true, lines: true, wrap: true },
    ]),
  );
}

// El lector de pantalla dice "conectado a" en vez de nombrar la flecha.
function arrow() {
  const node = createElement('span', 'connections__arrow');
  const glyph = createElement('span', null, '↔');
  glyph.setAttribute('aria-hidden', 'true');
  node.append(glyph, createElement('span', 'visually-hidden', t('panel.connectedTo')));
  return node;
}

// El vecino es un botón que lo elige: así se recorre la red cable por cable desde el panel.
function peerName(peer, { onPick, canPick } = {}) {
  if (!peer) return createElement('span', 'connections__peer', t('panel.unknownPeer'));
  if (!onPick || !canPick?.(peer)) return createElement('span', 'connections__peer', peer.name);
  const button = createElement('button', 'connections__peer connections__peer--pick', peer.name);
  button.type = 'button';
  button.addEventListener('click', () => onPick(peer.id));
  return button;
}

// El resultado cambia en su lugar: rehacer el panel le sacaría el foco al selector.
function pathSection(device, devicesById, picking) {
  const { targets, chosen, pathTo, onChoose } = picking.path;
  const wrapper = createElement('div', 'path');
  const label = createElement('label', 'field');
  label.append(createElement('span', 'panel-text', t('panel.pathAbout')));
  const select = createElement('select', 'field__input');
  select.append(new Option(t('panel.pathPick'), ''));
  for (const target of targets) if (target.id !== device.id) select.append(new Option(target.name, target.id));
  select.value = chosen ?? '';
  label.append(select);

  const result = createElement('div', 'path__result');
  result.setAttribute('aria-live', 'polite');
  // Fuera de la región que se anuncia: si no, el lector leería el botón como parte del camino.
  const clear = createElement('button', 'button button--quiet button--small', t('panel.pathClear'));
  clear.type = 'button';
  clear.addEventListener('click', () => {
    select.value = '';
    onChoose(null);
    show(null);
    select.focus();
  });
  const show = (targetId) => {
    result.replaceChildren();
    clear.hidden = !targetId;
    if (!targetId) return;
    const steps = pathTo(targetId);
    if (!steps) {
      result.append(createElement('p', 'panel-text', t('panel.pathNone')));
      return;
    }
    const list = createElement('ol', 'path__steps');
    for (const step of steps) {
      const item = createElement('li', 'path__step');
      const ports = [step.in && t('panel.pathIn', { port: step.in }), step.out && t('panel.pathOut', { port: step.out })];
      // El espacio duro sobrevive al armado del nombre; uno común se pierde y queda "PC1sale".
      item.append(
        step.id === device.id ? createElement('span', 'connections__peer', device.name) : peerName(devicesById.get(step.id), picking),
        createElement('span', 'visually-hidden', ',\u00a0'),
        createElement('span', 'path__ports', ports.filter(Boolean).join(' · ')),
      );
      list.append(item);
    }
    result.append(createElement('p', 'panel-text', t('panel.pathFound', { links: countOf('links', steps.length - 1) })), list);
  };

  select.addEventListener('change', () => {
    onChoose(select.value || null);
    show(select.value);
  });
  show(chosen);
  wrapper.append(label, result, clear);
  return wrapper;
}

function connectionList(device, devicesById, picking) {
  const meters = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 });
  const list = createElement('ul', 'connections');
  for (const connection of device.links) {
    const item = createElement('li', 'connections__item');
    item.append(
      createElement('span', 'connections__port', connection.port || t('panel.unnamedPort')),
      arrow(),
      peerName(devicesById.get(connection.peerId), picking),
      createElement('span', 'connections__peer-port', connection.peerPort || ''),
    );
    if (connection.length > 0) {
      item.append(createElement('span', 'connections__length', `${meters.format(connection.length)} m`));
    }
    list.append(item);
  }
  return list;
}

function section(title, content, action) {
  const wrapper = createElement('section', 'panel-section');
  const heading = createElement('h3', 'panel-section__title', title);
  if (action) {
    const head = createElement('div', 'panel-section__head');
    head.append(heading, action);
    wrapper.append(head, content);
  } else {
    wrapper.append(heading, content);
  }
  return wrapper;
}

// Seleccionar a mano una configuración larga en un teléfono es casi imposible.
function copyButton(text) {
  if (!navigator.clipboard) return null;
  const wrapper = createElement('span');
  const button = createElement('button', 'button button--quiet button--small', t('panel.copy'));
  button.type = 'button';
  button.setAttribute('aria-label', t('panel.copyConfig'));
  const said = createElement('span', 'visually-hidden');
  said.setAttribute('role', 'status');
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = t('panel.copied');
      said.textContent = t('panel.copiedConfig');
    } catch {
      // Sin permiso para el portapapeles el botón queda como estaba.
    }
  });
  wrapper.append(button, said);
  return wrapper;
}

export function renderDeviceInspector(container, device, devicesById, picking) {
  container.replaceChildren();

  const header = createElement('header', 'panel-head');
  const kind = createElement('p', 'panel-head__kind panel-head__kind--typed');
  kind.append(categoryIcon(device.category), t(`category.${device.category}`));
  header.append(
    kind,
    createElement('h2', 'panel-head__title', device.name),
    createElement('p', 'panel-head__about', t(`category.${device.category}.about`)),
  );
  container.append(header);

  const gateway = device.interfaces.map((entry) => entry.gateway).find(Boolean);
  const identity = [
    [t('panel.type'), device.type || '-'],
    [t('panel.model'), device.model || '-'],
    [t('panel.links'), String(device.links.length)],
  ];
  if (gateway) identity.push([t('panel.gateway'), gateway]);
  if (device.location.length > 0) identity.push([t('panel.location'), device.location.join(' › ')]);

  if (picking?.change) container.append(section(t('panel.changes'), changeSection(picking.change)));
  container.append(section(t('panel.identity'), definitionList(identity)));

  if (device.interfaces.length > 0) {
    container.append(section(t('panel.interfaces'), interfaceTable(device.interfaces)));
  }

  if (device.vlans.length > 0) {
    container.append(section(t('panel.vlans'), vlanTable(device.vlans)));
  }

  if (device.routes.length > 0) {
    container.append(section(t('panel.routes'), routeTable(device.routes)));
  }

  if (device.routing.length > 0) {
    container.append(section(t('panel.routing'), routingTable(device.routing)));
  }

  if (device.accessLists.length > 0) {
    container.append(section(t('panel.accessLists'), accessListTable(device.accessLists)));
  }

  if (device.links.length > 0) {
    container.append(section(t('panel.connections'), connectionList(device, devicesById, picking)));
    if (picking?.path) container.append(section(t('panel.path'), pathSection(device, devicesById, picking)));
  }

  if (device.runningConfig.length > 0) {
    const text = device.runningConfig.join('\n');
    const code = createElement('pre', 'code-block');
    code.textContent = text;
    container.append(section('running-config', code, copyButton(text)));
  }
  markScrollable(container);
}

// Lo que se desplaza tiene que poder recorrerse con el teclado: sólo eso es una parada del
// tabulador, con el nombre de su sección. Hay que volver a medir si el panel cambia de ancho.
export function markScrollable(container) {
  for (const box of container.querySelectorAll('.table-scroller, .code-block')) {
    const scrolls = box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1;
    if (scrolls === box.hasAttribute('tabindex')) continue;
    if (scrolls) {
      box.tabIndex = 0;
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', box.closest('section')?.querySelector('h3')?.textContent ?? '');
    } else {
      for (const name of ['tabindex', 'role', 'aria-label']) box.removeAttribute(name);
    }
  }
}

// Qué tipos de equipo hay, con su símbolo y para qué sirven. Elegir uno deja a la vista sólo
// esos; los que están ocultos (la infraestructura, por omisión) quedan como texto.
function categoryKey(devices, { onFilter, filtering, hidden }) {
  const counts = new Map();
  for (const device of devices) counts.set(device.category, (counts.get(device.category) ?? 0) + 1);

  const list = createElement('ul', 'key');
  for (const category of CATEGORY_ORDER.filter((entry) => counts.has(entry))) {
    const item = createElement('li', 'key__item');
    const about = createElement('p', 'key__about', t(`category.${category}.about`));
    about.id = `key-about-${category}`;

    const pickable = onFilter && !hidden?.(category);
    const row = createElement(pickable ? 'button' : 'div', 'key__row');
    row.append(
      categoryIcon(category),
      createElement('span', 'key__name', t(`category.${category}`)),
      createElement('span', 'visually-hidden', ', '),
      createElement('span', 'key__count', String(counts.get(category))),
    );
    if (pickable) {
      row.type = 'button';
      row.dataset.category = category;
      row.setAttribute('aria-pressed', String(category === filtering));
      row.setAttribute('aria-describedby', about.id);
      row.addEventListener('click', () => onFilter(category));
    }
    item.append(row, about);
    list.append(item);
  }
  return list;
}

const AUTOMATIC_IPV4 = '169.254.0.0/16';

function subnetList(subnets, { onSubnet, subnetFilter }) {
  const list = createElement('ul', 'pick-list');
  for (const { cidr, count } of subnets) {
    const row = createElement(onSubnet ? 'button' : 'span', 'pick-list__pick');
    row.append(createElement('span', 'pick-list__text', cidr));
    // La que el equipo se pone solo cuando el DHCP no le contesta: casi siempre es un error.
    if (cidr === AUTOMATIC_IPV4) {
      row.append(createElement('span', 'visually-hidden', ',\u00a0'), createElement('span', 'pick-list__note', t('panel.subnetAutomatic')));
    }
    row.append(
      createElement('span', 'visually-hidden', ',\u00a0'),
      createElement('span', 'pick-list__count', countOf('devices', count)),
    );
    if (onSubnet) {
      row.type = 'button';
      row.dataset.subnet = cidr;
      row.setAttribute('aria-pressed', String(cidr === subnetFilter));
      row.addEventListener('click', () => onSubnet(cidr));
    }
    const item = createElement('li');
    item.append(row);
    list.append(item);
  }
  return list;
}

// Las marcas + y - van escritas, además del color. NVDA no lee el guion, así que lo agregado y lo
// quitado van en ins y del, que sí anuncia.
const MARKS = { added: '+ ', removed: '- ', context: '  ' };
const DIFF_TAGS = { added: 'ins', removed: 'del', context: 'span' };

function changeSection(change) {
  const wrapper = createElement('div', 'change');
  if (change.added) wrapper.append(createElement('p', 'panel-text', t('panel.changeNew')));
  if (change.renamed) wrapper.append(createElement('p', 'panel-text', t('panel.renamed', { name: change.renamed })));

  if (change.addresses.length > 0) {
    const list = createElement('ul', 'change__addresses');
    for (const entry of change.addresses) {
      const text = entry.gateway
        ? `${t('panel.gateway')}: ${entry.gateway}`
        : [entry.port, entry.address, entry.mask].filter(Boolean).join(' ');
      const item = createElement('li');
      item.append(createElement(DIFF_TAGS[entry.type], `diff__${entry.type}`, MARKS[entry.type] + text));
      list.append(item);
    }
    wrapper.append(list);
  }

  if (change.config.length > 0) {
    const code = createElement('pre', 'code-block diff');
    code.append(...change.config.map((entry) => createElement(DIFF_TAGS[entry.type], `diff__${entry.type}`, `${MARKS[entry.type]}${entry.text}\n`)));
    wrapper.append(code);
  }
  return wrapper;
}

function compareSection(model, compare) {
  const wrapper = createElement('div', 'compare');
  const button = (label, action) => {
    const node = createElement('button', 'button button--quiet', label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  };

  if (!compare.result) {
    const actions = createElement('div', 'compare__actions');
    actions.append(button(t('panel.compareFile'), compare.onCompareFile));
    if (model.initial) actions.append(button(t('panel.compareInitial'), compare.onCompareInitial));
    wrapper.append(createElement('p', 'panel-text', t('panel.compareAbout')), actions);
    return section(t('panel.compare'), wrapper);
  }

  const { result } = compare;
  wrapper.append(createElement('p', 'panel-text', t('panel.comparedWith', { name: compare.label })));
  wrapper.append(definitionList([
    [t('panel.changedDevices'), String(result.changed.size)],
    [t('panel.addedDevices'), String(result.added.length)],
    [t('panel.removedDevices'), String(result.removed.length)],
    [t('panel.addedLinks'), String(result.linksAdded.length)],
    [t('panel.removedLinks'), String(result.linksRemoved.length)],
    ...(result.linksMoved.length > 0 ? [[t('panel.movedLinks'), String(result.linksMoved.length)]] : []),
  ]));

  const touched = [
    ...model.devices.filter((device) => result.changed.has(device.id)).map((device) => [device, 'panel.tagChanged']),
    ...result.added.map((device) => [device, 'panel.tagNew']),
  ];
  if (touched.length + result.removed.length + result.linksAdded.length + result.linksRemoved.length + result.linksMoved.length === 0) {
    wrapper.append(createElement('p', 'panel-text', t('panel.noChanges')));
  } else {
    wrapper.append(createElement('p', 'panel-text', t('panel.compareLegend')));
    const list = createElement('ul', 'compare__list');
    for (const [device, tag] of touched) {
      const item = createElement('li');
      item.append(peerName(device, compare), createElement('span', 'compare__tag', t(tag)));
      list.append(item);
    }
    for (const device of result.removed) {
      const item = createElement('li');
      item.append(createElement('span', 'connections__peer', device.name), createElement('span', 'compare__tag', t('panel.tagRemoved')));
      list.append(item);
    }
    wrapper.append(list);
  }
  wrapper.append(button(t('panel.stopComparing'), compare.onStop));
  return section(t('panel.compare'), wrapper);
}

// Puede ser texto o HTML de Qt, que vacío igual trae su marcado.
function descriptionOf(text) {
  if (!text.trim()) return null;
  if (!/^\s*<(!doctype|html)/i.test(text)) return createElement('p', 'panel-text panel-text--lines', text);
  const { content } = renderRichText([text]);
  return content.textContent.trim() ? content : null;
}

// Cerradas de entrada: son varias pantallas de texto.
function activitySection(pages) {
  const { title, content } = renderRichText(pages);
  const wrapper = createElement('div');
  if (title) {
    const heading = createElement('p', 'activity__title', title);
    if (content.lang) heading.lang = content.lang;
    wrapper.append(heading);
  }
  const toggle = createElement('details', 'activity__toggle');
  toggle.append(createElement('summary', null, t('panel.readInstructions')), content);
  toggle.addEventListener('toggle', () => markScrollable(toggle));
  wrapper.append(toggle);
  return section(t('panel.activity'), wrapper);
}

export function renderNetworkSummary(container, model, { fileName, variant, onDownload, compare, ...filter } = {}) {
  container.replaceChildren();

  const header = createElement('header', 'panel-head');
  header.append(
    createElement('p', 'panel-head__kind', t('panel.summary')),
    createElement('h2', 'panel-head__title', t('panel.topology')),
  );
  container.append(header);
  if (model.instructions.length > 0) container.append(activitySection(model.instructions));
  if (compare) container.append(compareSection(model, compare));
  container.append(section(t('panel.inventory'), categoryKey(model.devices, filter)));
  const subnets = subnetsOf(model.devices.filter((device) => !filter.hidden?.(device.category)));
  if (subnets.length > 0) container.append(section(t('panel.subnets'), subnetList(subnets, filter)));

  const description = descriptionOf(model.description);
  if (description) container.append(section(t('panel.description'), description));
  container.append(section(t('panel.howTo'), createElement('p', 'panel-text', t('panel.howToText'))));

  const network = selectVisible(model, false);
  const facts = [
    [t('panel.version'), model.version],
    [t('panel.devices'), String(network.devices.length)],
    [t('panel.links'), String(network.links.length)],
  ];
  if (variant) facts.splice(1, 0, [t('panel.variant'), t(`variant.${variant}`)]);

  const file = document.createElement('div');
  file.append(definitionList(facts));

  if (onDownload) {
    const button = createElement('button', 'button button--wide', t('panel.downloadFile'));
    button.type = 'button';
    button.title = fileName || '';
    button.addEventListener('click', onDownload);
    file.append(button);
  }

  container.append(section(t('panel.file'), file));
  markScrollable(container);
}
