import { t } from '../i18n.js';

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

/**
 * Una tabla de encabezados traducidos y filas de celdas, que es lo que son casi todas.
 * `wrap` marca las celdas que pueden partirse por cualquier lado: una lista de veinticuatro
 * `GigabitEthernet0/n` no tiene un solo lugar donde cortar, y sin eso la tabla se lleva por
 * delante el ancho del panel. En una dirección IP no se usa, que partida no se lee.
 */
function dataTable(headings, rows) {
  const table = createElement('table', 'table');
  const headRow = createElement('tr');
  for (const key of headings) headRow.append(createElement('th', null, t(key)));

  const head = createElement('thead');
  head.append(headRow);

  const body = createElement('tbody');
  for (const cells of rows) {
    const row = createElement('tr');
    for (const { text, mono, wrap } of cells) {
      const className = [mono && 'table__mono', wrap && 'table__wrap'].filter(Boolean).join(' ');
      row.append(createElement('td', className || null, text));
    }
    body.append(row);
  }

  table.append(head, body);
  return table;
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
      const name = createElement('td', 'table__mono', entry.name || entry.mac || '—');
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
  return table;
}

/**
 * Cada VLAN con su nombre y los puertos que la llevan. Se agrupa por VLAN y no por puerto
 * porque la pregunta es «qué VLAN hay y por dónde pasa», y un switch de veinticuatro bocas
 * contestada al revés son veinticuatro renglones para leer de a uno.
 */
function vlanTable(vlans) {
  return dataTable(
    ['table.vlan', 'table.vlanName', 'table.accessPorts', 'table.trunkPorts'],
    vlans.map((vlan) => [
      { text: vlan.id, mono: true },
      { text: vlan.name || '—' },
      { text: vlan.ports.join(', ') || '—', mono: true, wrap: true },
      { text: vlan.trunks.join(', ') || '—', mono: true, wrap: true },
    ]),
  );
}

/** Las rutas escritas a mano, en el orden en que están en la configuración. */
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

function connectionList(device, devicesById) {
  const list = createElement('ul', 'connections');
  for (const connection of device.links) {
    const peer = devicesById.get(connection.peerId);
    const item = createElement('li', 'connections__item');
    item.append(
      createElement('span', 'connections__port', connection.port || t('panel.unnamedPort')),
      createElement('span', 'connections__arrow', '↔'),
      createElement('span', 'connections__peer', peer ? peer.name : t('panel.unknownPeer')),
      createElement('span', 'connections__peer-port', connection.peerPort || ''),
    );
    list.append(item);
  }
  return list;
}

function section(title, content) {
  const wrapper = createElement('section', 'panel-section');
  wrapper.append(createElement('h3', 'panel-section__title', title), content);
  return wrapper;
}

export function renderDeviceInspector(container, device, devicesById) {
  container.replaceChildren();

  const header = createElement('header', 'panel-head');
  header.append(
    createElement('p', 'panel-head__eyebrow', t(`category.${device.category}`)),
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

  if (device.links.length > 0) {
    container.append(section(t('panel.connections'), connectionList(device, devicesById)));
  }

  if (device.runningConfig.length > 0) {
    const code = createElement('pre', 'code-block');
    code.textContent = device.runningConfig.join('\n');
    container.append(section('running-config', code));
  }
}

export function renderNetworkSummary(container, model, { fileName, variant, onDownload } = {}) {
  container.replaceChildren();

  const header = createElement('header', 'panel-head');
  header.append(
    createElement('p', 'panel-head__eyebrow', t('panel.summary')),
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
