import { getLocale, t } from '../i18n.js';

function createElement(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
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

function dataTable(headings, rows) {
  const table = createElement('table', 'table');
  const headRow = createElement('tr');
  for (const key of headings) headRow.append(createElement('th', null, t(key)));

  const head = createElement('thead');
  head.append(headRow);

  const body = createElement('tbody');
  for (const cells of rows) {
    const row = createElement('tr');
    for (const { text, mono, wrap, lines } of cells) {
      const className = [mono && 'table__mono', wrap && 'table__wrap', lines && 'table__lines']
        .filter(Boolean).join(' ');
      row.append(createElement('td', className || null, text));
    }
    body.append(row);
  }

  table.append(head, body);
  return scrollable(table);
}

function interfaceTable(interfaces) {
  const table = createElement('table', 'table');
  const head = createElement('thead');
  const headRow = createElement('tr');
  for (const key of ['table.interface', 'table.address', 'table.mask', 'table.state']) {
    headRow.append(createElement('th', null, t(key)));
  }
  head.append(headRow);

  const body = createElement('tbody');
  for (const entry of interfaces) {
    const addresses = entry.addresses.length > 0 ? entry.addresses : [{ address: '—', mask: '—' }];
    for (const address of addresses) {
      const row = createElement('tr');
      // Nombres como GigabitEthernet0/0.10 no tienen dónde cortar; se deja partirlos.
      const name = createElement('td', 'table__mono table__wrap', entry.name || entry.mac || '—');
      if (entry.description) name.title = entry.description;

      row.append(
        name,
        createElement('td', 'table__mono', address.address),
        createElement('td', 'table__mono', address.mask || '—'),
        createElement('td', null, t(entry.enabled ? 'table.up' : 'table.down')),
      );
      body.append(row);
    }
  }

  table.append(head, body);
  return scrollable(table);
}

// Agrupada por VLAN: por puerto, un switch de 24 bocas serían 24 renglones.
function vlanTable(vlans) {
  // La columna de subinterfaces sólo aparece en un router-on-a-stick.
  const routed = vlans.some((vlan) => vlan.routed.length > 0);
  const headings = ['table.vlan', 'table.vlanName', 'table.accessPorts', 'table.trunkPorts'];
  if (routed) headings.push('table.routedPorts');

  return dataTable(headings, vlans.map((vlan) => {
    const cells = [
      { text: vlan.id, mono: true },
      { text: vlan.name || '—' },
      { text: vlan.ports.join(', ') || '—', mono: true, wrap: true },
      { text: vlan.trunks.join(', ') || '—', mono: true, wrap: true },
    ];
    if (routed) cells.push({ text: vlan.routed.join(', ') || '—', mono: true, wrap: true });
    return cells;
  }));
}

function routeTable(routes) {
  return dataTable(
    ['table.destination', 'table.mask', 'table.via'],
    routes.map((route) => [
      { text: route.destination, mono: true },
      { text: route.mask || '—', mono: true },
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
    const cells = [
      { text: protocolLabel(entry) },
      { text: entry.networks.join('\n') || '—', mono: true, lines: true, wrap: true },
    ];
    if (passive) cells.push({ text: entry.passive.join('\n') || '—', mono: true, lines: true, wrap: true });
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
      { text: entry.rules.join('\n') || '—', mono: true, lines: true, wrap: true },
      { text: applied(entry).join('\n') || '—', mono: true, lines: true, wrap: true },
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
  header.append(
    createElement('p', 'panel-head__kind', t(`category.${device.category}`)),
    createElement('h2', 'panel-head__title', device.name),
  );
  container.append(header);

  const gateway = device.interfaces.map((entry) => entry.gateway).find(Boolean);
  const identity = [
    [t('panel.type'), device.type || '—'],
    [t('panel.model'), device.model || '—'],
    [t('panel.links'), String(device.links.length)],
  ];
  if (gateway) identity.push([t('panel.gateway'), gateway]);
  if (device.location.length > 0) identity.push([t('panel.location'), device.location.join(' › ')]);

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
  }

  if (device.runningConfig.length > 0) {
    const text = device.runningConfig.join('\n');
    const code = createElement('pre', 'code-block');
    code.textContent = text;
    container.append(section('running-config', code, copyButton(text)));
  }
}

export function renderNetworkSummary(container, model, { fileName, variant, onDownload } = {}) {
  container.replaceChildren();

  const header = createElement('header', 'panel-head');
  header.append(
    createElement('p', 'panel-head__kind', t('panel.summary')),
    createElement('h2', 'panel-head__title', t('panel.topology')),
  );
  container.append(header);

  const counts = new Map();
  for (const device of model.devices) {
    const label = t(`category.${device.category}`);
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  const facts = [
    [t('panel.version'), model.version],
    [t('panel.devices'), String(model.devices.length)],
    [t('panel.links'), String(model.links.length)],
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

  container.append(
    section(t('panel.file'), file),
    section(t('panel.inventory'), definitionList([...counts.entries()].map(([label, count]) => [label, String(count)]))),
  );

  if (model.description) {
    container.append(section(t('panel.description'), createElement('p', 'panel-text', model.description)));
  }

  container.append(
    section(t('panel.howTo'), createElement('p', 'panel-text', t('panel.howToText'))),
  );
}
