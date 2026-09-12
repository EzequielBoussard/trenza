import { t } from '../i18n.js';
import { readAccessLists, readInterfaces, readRoutes, readRoutingProtocols, readVlans } from './config.js';

const DEVICE_CATEGORIES = [
  { match: /router/i, category: 'router' },
  { match: /switch|bridge/i, category: 'switch' },
  { match: /access\s*point|wireless|wrt|wrs|repeater/i, category: 'wireless' },
  { match: /server/i, category: 'server' },
  { match: /laptop|tablet|pda|smartphone|phone/i, category: 'endpoint' },
  { match: /\bpc\b|desktop|printer|tv|thin\s*client/i, category: 'endpoint' },
  { match: /cloud|wan|dsl|cable\s*modem|modem/i, category: 'cloud' },
  { match: /firewall|asa/i, category: 'security' },
  { match: /\bmcu|\bsbc|\biot|sensor|actuator|smart/i, category: 'iot' },
];

// Los límites de palabra importan: sin ellos «TabletPC» cae en infraestructura por «table».
const INFRASTRUCTURE = /power distribution|coaxial splitter|\b(rack|shelf|table)\b/i;

function childText(parent, tagName) {
  for (const child of parent.children) {
    if (child.tagName === tagName) return child.textContent.trim();
  }
  return '';
}

/** El primero con ese nombre, o nada. Casi todas las etiquetas del árbol son únicas. */
function childNamed(parent, tagName) {
  for (const child of parent.children) {
    if (child.tagName === tagName) return child;
  }
  return null;
}

// De una pasada, sin copiar antes la lista entera de hijos: el nodo de un dispositivo tiene
// decenas y esto se pregunta varias veces por cada uno.
function childrenNamed(parent, tagName) {
  const found = [];
  for (const child of parent.children) {
    if (child.tagName === tagName) found.push(child);
  }
  return found;
}

function classify(typeText, modelText) {
  const subject = `${typeText} ${modelText}`;
  if (INFRASTRUCTURE.test(subject)) return 'infrastructure';
  for (const rule of DEVICE_CATEGORIES) {
    if (rule.match.test(subject)) return rule.category;
  }
  return 'other';
}

/**
 * La base de VLAN que el dispositivo guarda en el árbol, con su número y su nombre. Es la
 * única fuente cuando el switch se configuró desde la interfaz de Packet Tracer, que no
 * escribe nada de esto en la `running-config`.
 */
function vlansFromEngine(engine) {
  const declared = childNamed(engine, 'VLANS');
  if (!declared) return [];

  return childrenNamed(declared, 'VLAN')
    .map((vlan) => ({ id: vlan.getAttribute('number') || '', name: vlan.getAttribute('name') || '' }))
    .filter((vlan) => vlan.id);
}

function interfacesFromPorts(engine) {
  const interfaces = [];
  for (const port of engine.getElementsByTagName('PORT')) {
    const ip = childText(port, 'IP');
    const mac = childText(port, 'MACADDRESS');
    if (!ip && !mac) continue;
    interfaces.push({
      name: '',
      addresses: ip ? [{ address: ip, mask: childText(port, 'SUBNET') }] : [],
      mac,
      gateway: childText(port, 'PORT_GATEWAY'),
      description: '',
      enabled: true,
    });
  }
  return interfaces;
}

function readDevice(deviceNode) {
  const engine = childNamed(deviceNode, 'ENGINE');
  if (!engine) return null;

  const id = childText(engine, 'SAVE_REF_ID');
  if (!id) return null;

  const typeNode = childNamed(engine, 'TYPE');
  const typeText = typeNode ? typeNode.textContent.trim() : '';
  const modelText = typeNode ? typeNode.getAttribute('model') || '' : '';
  const category = classify(typeText, modelText);

  const configNode = childNamed(engine, 'RUNNINGCONFIG');
  const configLines = configNode
    ? childrenNamed(configNode, 'LINE').map((line) => line.textContent.replace(/\r/g, ''))
    : [];

  // Se parsean todas las interfaces, no sólo las que llevan dirección: un puerto de acceso
  // sin IP no dice nada por sí solo, pero es el que dice qué VLAN vive en ese cable.
  const configured = readInterfaces(configLines);
  const namedInterfaces = configured.filter((entry) => entry.addresses.length > 0 || entry.description);
  const workspace = childNamed(deviceNode, 'WORKSPACE');
  const logical = workspace ? childNamed(workspace, 'LOGICAL') : null;

  return {
    id,
    name: childText(engine, 'NAME') || childText(engine, 'SYS_NAME') || t('device.unnamed'),
    type: typeText,
    model: modelText,
    category,
    x: logical ? Number(childText(logical, 'X')) || 0 : 0,
    y: logical ? Number(childText(logical, 'Y')) || 0 : 0,
    interfaces: namedInterfaces.length > 0 ? namedInterfaces : interfacesFromPorts(engine),
    vlans: readVlans(configLines, configured, vlansFromEngine(engine)),
    routes: readRoutes(configLines),
    routing: readRoutingProtocols(configLines),
    accessLists: readAccessLists(configLines, configured),
    runningConfig: configLines,
    links: [],
  };
}

function readLink(linkNode) {
  const cable = childNamed(linkNode, 'CABLE');
  if (!cable) return null;

  const ports = childrenNamed(cable, 'PORT');
  return {
    from: childText(cable, 'FROM'),
    to: childText(cable, 'TO'),
    fromPort: ports[0] ? ports[0].textContent.trim() : '',
    toPort: ports[1] ? ports[1].textContent.trim() : '',
    media: childText(linkNode, 'TYPE'),
    wiring: childText(cable, 'TYPE'),
    functional: childText(cable, 'FUNCTIONAL') !== 'false',
  };
}

/**
 * Traduce el XML interno de Packet Tracer al modelo que consume la interfaz:
 * dispositivos con posición y direcciones, y los enlaces que los unen.
 */
export function buildNetworkModel(xmlText) {
  const document = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (document.querySelector('parsererror')) {
    throw new Error(t('error.xml'));
  }

  const root = document.documentElement;
  const network = root.getElementsByTagName('NETWORK')[0];
  if (!network) throw new Error(t('error.noTopology'));

  const devicesNode = childNamed(network, 'DEVICES');
  const linksNode = childNamed(network, 'LINKS');

  const devices = devicesNode
    ? childrenNamed(devicesNode, 'DEVICE').map(readDevice).filter(Boolean)
    : [];
  const links = linksNode ? childrenNamed(linksNode, 'LINK').map(readLink).filter(Boolean) : [];

  const byId = new Map(devices.map((device) => [device.id, device]));
  const connected = links.filter((link) => byId.has(link.from) && byId.has(link.to));

  for (const link of connected) {
    byId.get(link.from).links.push({ port: link.fromPort, peerId: link.to, peerPort: link.toPort });
    byId.get(link.to).links.push({ port: link.toPort, peerId: link.from, peerPort: link.fromPort });
  }

  return {
    version: childText(root, 'VERSION') || t('panel.unknownVersion'),
    description: childText(network, 'DESCRIPTION'),
    devices,
    links: connected,
  };
}
