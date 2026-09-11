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
 * `lines` respeta los saltos de renglón, para lo que es una lista y no un valor suelto.
 */
/**
 * Red de seguridad: una tabla que no entre se desplaza dentro de su propio recuadro en vez
 * de estirar el panel entero. Sin esto, un solo nombre largo mandaba a desplazarse de
 * costado a todo lo que hay al lado, incluido lo que sí entraba.
 */
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
      // `GigabitEthernet0/0.10` no tiene un lugar natural donde cortar y es lo más ancho de
      // la tabla: sin dejarlo partir, cuatro columnas no entran en el panel.
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

/**
 * Cada VLAN con su nombre y los puertos que la llevan. Se agrupa por VLAN y no por puerto
 * porque la pregunta es «qué VLAN hay y por dónde pasa», y un switch de veinticuatro bocas
 * contestada al revés son veinticuatro renglones para leer de a uno.
 */
function vlanTable(vlans) {
  // La columna de subinterfaces sólo existe en un router en un palo. En un switch sería
  // una columna de guiones, así que ahí directamente no está.
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

/** `RIP v2`, `OSPF 1`, `EIGRP 100`: el protocolo y lo que lo identifica en el equipo. */
function protocolLabel(entry) {
  const version = entry.version ? `v${entry.version}` : '';
  return [entry.protocol, entry.id, version].filter(Boolean).join(' ');
}

/**
 * Los protocolos de enrutamiento con las redes que anuncian. Lo que el protocolo termine
 * aprendiendo no está en el archivo: esto es lo que el equipo tiene configurado.
 */
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

/**
 * Las listas de acceso, con sus reglas en orden y dónde están aplicadas. Las dos cosas
 * hacen falta para saber qué filtra el equipo: una lista sin aplicar no filtra nada, y una
 * interfaz con `ip access-group` de una lista que no existe deja pasar todo.
 */
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

  if (device.routing.length > 0) {
    container.append(section(t('panel.routing'), routingTable(device.routing)));
  }

  if (device.accessLists.length > 0) {
    container.append(section(t('panel.accessLists'), accessListTable(device.accessLists)));
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
