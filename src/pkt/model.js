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

// Con \b, para que "TabletPC" no caiga en infraestructura por "table".
const INFRASTRUCTURE = /power distribution|coaxial splitter|\b(rack|shelf|table)\b/i;

function childText(parent, tagName) {
  for (const child of parent.children) {
    if (child.tagName === tagName) return child.textContent.trim();
  }
  return '';
}

function childNamed(parent, tagName) {
  for (const child of parent.children) {
    if (child.tagName === tagName) return child;
  }
  return null;
}

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

// Si el switch se configuró desde la interfaz gráfica, las VLAN sólo están en el XML y no
// en la running-config.
function vlansFromEngine(engine) {
  const declared = childNamed(engine, 'VLANS');
  if (!declared) return [];

  return childrenNamed(declared, 'VLAN')
    .map((vlan) => ({ id: vlan.getAttribute('number') || '', name: vlan.getAttribute('name') || '' }))
    .filter((vlan) => vlan.id);
}

function interfacesFromPorts(engine) {
  // Hasta 5.x la puerta de enlace es del equipo y no de cada puerto.
  const deviceGateway = childText(engine, 'GATEWAY');
  const interfaces = [];
  for (const port of engine.getElementsByTagName('PORT')) {
    const ip = childText(port, 'IP');
    const mac = childText(port, 'MACADDRESS');
    if (!ip && !mac) continue;
    interfaces.push({
      name: '',
      addresses: ip ? [{ address: ip, mask: childText(port, 'SUBNET') }] : [],
      mac,
      gateway: childText(port, 'PORT_GATEWAY') || deviceGateway,
      description: '',
      enabled: true,
    });
  }
  return interfaces;
}

const PLACE_ROOT = '0';
const PLACE_DEVICE = '6';

// Cada nodo de la vista física por su UUID: ciudad, edificio, armario, rack, mesa, equipo.
function readPlaces(root) {
  const places = new Map();
  const workspace = root.getElementsByTagName('PHYSICALWORKSPACE')[0];
  if (!workspace) return places;
  for (const node of workspace.getElementsByTagName('NODE')) {
    const uuid = childText(node, 'UUID_STR');
    if (uuid) places.set(uuid, { type: childText(node, 'TYPE'), name: childText(node, 'NAME') });
  }
  return places;
}

// El equipo guarda la ruta de UUID desde Intercity hasta sí mismo; se nombra lo del medio.
export function locationOf(path, places) {
  return path.split(',')
    .map((uuid) => places.get(uuid.trim()))
    .filter((place) => place && place.type !== PLACE_ROOT && place.type !== PLACE_DEVICE)
    .map((place) => place.name);
}

// Hasta 5.x no hay SAVE_REF_ID: los enlaces nombran a cada equipo por su posición en la lista.
function readDevice(deviceNode, index, places) {
  const engine = childNamed(deviceNode, 'ENGINE');
  if (!engine) return null;

  const id = childText(engine, 'SAVE_REF_ID') || String(index);

  const typeNode = childNamed(engine, 'TYPE');
  const typeText = typeNode ? typeNode.textContent.trim() : '';
  const modelText = typeNode ? typeNode.getAttribute('model') || '' : '';
  const category = classify(typeText, modelText);

  const configNode = childNamed(engine, 'RUNNINGCONFIG');
  const configLines = configNode
    ? childrenNamed(configNode, 'LINE').map((line) => line.textContent.replace(/\r/g, ''))
    : [];

  // Todas, también las que no tienen IP: un puerto de acceso dice a qué VLAN pertenece.
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
    location: workspace ? locationOf(childText(workspace, 'PHYSICAL'), places) : [],
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
    // En metros; hasta 5.x viene en 0.
    length: Number(childText(cable, 'LENGTH')) || 0,
  };
}

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

  const places = readPlaces(root);
  const devices = devicesNode
    ? childrenNamed(devicesNode, 'DEVICE').map((node, index) => readDevice(node, index, places)).filter(Boolean)
    : [];
  const links = linksNode ? childrenNamed(linksNode, 'LINK').map(readLink).filter(Boolean) : [];

  const byId = new Map(devices.map((device) => [device.id, device]));
  const connected = links.filter((link) => byId.has(link.from) && byId.has(link.to));

  for (const link of connected) {
    const { length } = link;
    byId.get(link.from).links.push({ port: link.fromPort, peerId: link.to, peerPort: link.toPort, length });
    byId.get(link.to).links.push({ port: link.toPort, peerId: link.from, peerPort: link.fromPort, length });
  }

  return {
    version: childText(root, 'VERSION') || t('panel.unknownVersion'),
    description: childText(network, 'DESCRIPTION'),
    devices,
    links: connected,
  };
}
