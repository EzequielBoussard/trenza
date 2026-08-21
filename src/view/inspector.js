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
      row.append(
        createElement('td', 'table__mono', entry.name || entry.mac || '—'),
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

  container.append(
    section(t('panel.identity'), definitionList([
      [t('panel.type'), device.type || '—'],
      [t('panel.model'), device.model || '—'],
      [t('panel.links'), String(device.links.length)],
    ])),
  );

  if (device.interfaces.length > 0) {
    container.append(section(t('panel.interfaces'), interfaceTable(device.interfaces)));
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

export function renderNetworkSummary(container, model, { fileName, onDownload } = {}) {
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

  const file = document.createElement('div');
  file.append(definitionList([
    [t('panel.version'), model.version],
    [t('panel.devices'), String(model.devices.length)],
    [t('panel.links'), String(model.links.length)],
  ]));

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
