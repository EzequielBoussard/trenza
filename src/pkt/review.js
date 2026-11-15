// Errores de configuración que se ven en el archivo sin simular la red. No depende del DOM, así se
// prueba con node.
import { networkOf, parseAddress } from './query.js';

const KINDS = ['duplicate', 'subnets', 'shutdown', 'gateway', 'gatewayMissing', 'automatic'];
const AUTOMATIC = { width: 32, shift: 16n, prefix: 0xa9fen };

const bare = (address) => String(address).trim().split(/[\s/]/)[0];
const isAutomatic = (parsed) => parsed.width === AUTOMATIC.width && parsed.value >> AUTOMATIC.shift === AUTOMATIC.prefix;
const isLinkLocal = (parsed) => parsed.width === 128 && parsed.value >> 118n === 0x3fan;

function contains(network, address) {
  const parsed = parseAddress(address);
  if (!parsed || parsed.width !== network.width) return false;
  const shift = BigInt(network.width - network.length);
  return parsed.value >> shift === network.value >> shift;
}

const portOf = (device, name) => {
  const wanted = String(name).toLowerCase();
  return device.interfaces.find((entry) => entry.name && entry.name.toLowerCase() === wanted);
};

// Las redes IPv4 de una interfaz, con la dirección que la define: "10.0.0.1/30".
const ipv4Of = (entry) => (entry?.addresses ?? [])
  .map((address) => ({ address, network: networkOf(address) }))
  .filter(({ network }) => network?.width === 32);

// Grupos de cosas unidas: join une 2 y find dice a qué grupo pertenece una.
function groups() {
  const parent = new Map();
  const find = (node) => {
    if (!parent.has(node)) parent.set(node, node);
    let root = node;
    while (parent.get(root) !== root) root = parent.get(root);
    parent.set(node, root);
    return root;
  };
  return { find, join: (a, b) => parent.set(find(a), find(b)) };
}

// Un switch, un hub o un access point sólo pasan la trama: todos sus puertos son el mismo segmento.
const FORWARDS = new Set(['switch', 'wireless', 'cloud']);
const endOf = (device, port) => (FORWARDS.has(device.category) ? device.id : `${device.id}|${String(port).toLowerCase()}`);

// Los segmentos de la red: lo que queda unido por cables sin un router ni un equipo final en el medio.
function segmentsOf(devices, byId) {
  const segments = groups();
  for (const device of devices) {
    for (const link of device.links) {
      const peer = byId.get(link.peerId);
      if (peer) segments.join(endOf(device, link.port), endOf(peer, link.peerPort));
    }
  }
  return segments;
}

// Dónde está enchufada una interfaz. Sin nombre no se sabe cuál de los cables es: valen todos.
function endsOf(device, entry) {
  if (FORWARDS.has(device.category)) return device.links.length > 0 ? [device.id] : [];
  const wanted = entry.name?.toLowerCase();
  return device.links.filter((link) => !wanted || String(link.port).toLowerCase() === wanted).map((link) => endOf(device, link.port));
}

// La misma dirección en 2 equipos choca si comparten segmento: repetida en redes separadas del
// mismo archivo, o a cada lado de un router, no molesta a nadie.
function duplicates(devices, byId) {
  const segments = segmentsOf(devices, byId);
  const owners = new Map();
  for (const device of devices) {
    for (const entry of device.interfaces) {
      for (const { address } of entry.addresses) {
        const parsed = parseAddress(address);
        if (!parsed || parsed.value === 0n || isAutomatic(parsed) || isLinkLocal(parsed)) continue;
        for (const end of endsOf(device, entry)) {
          const key = `${parsed.width}:${parsed.value}@${segments.find(end)}`;
          if (!owners.has(key)) owners.set(key, { address: bare(address), ids: new Set() });
          owners.get(key).ids.add(device.id);
        }
      }
    }
  }
  // Un equipo con 2 cables puede caer en 2 segmentos con el mismo choque: se cuenta una vez.
  const found = new Map();
  for (const { address, ids } of owners.values()) {
    if (ids.size > 1) found.set(`${address}|${[...ids].join()}`, { kind: 'duplicate', devices: [...ids], address });
  }
  return [...found.values()];
}

// Un router hogareño, un controlador o un módem guardan su dirección donde el visor no la lee:
// con uno en la red no se puede decir que a la puerta de enlace no la tenga nadie.
const OPAQUE = new Set(['wireless', 'cloud', 'security', 'other']);

function unknowableFor(devices, byId) {
  const networks = groups();
  for (const device of devices) {
    for (const link of device.links) if (byId.has(link.peerId)) networks.join(device.id, link.peerId);
  }
  const opaque = new Set(devices.filter((device) => OPAQUE.has(device.category) && !device.runningConfig?.length)
    .map((device) => networks.find(device.id)));
  return (device) => device.links.length === 0 || opaque.has(networks.find(device.id));
}

// Sólo con máscara: sin ella no se sabe cuál es la red del equipo. Una puerta de enlace en la red
// que ningún equipo tiene suele ser un número mal escrito; esas se juntan por dirección.
function gateways(devices, byId) {
  const findings = [];
  const owned = new Set(devices.flatMap((device) => device.interfaces.flatMap((entry) => entry.addresses))
    .map(({ address }) => parseAddress(address)).filter(Boolean).map(({ width, value }) => `${width}:${value}`));
  const unknowable = unknowableFor(devices, byId);
  const missing = new Map();
  for (const device of devices) {
    const gateway = device.interfaces.map((entry) => entry.gateway).find(Boolean);
    const parsed = gateway && parseAddress(gateway);
    if (!parsed || parsed.width !== 32 || parsed.value === 0n) continue;
    const networks = device.interfaces.flatMap(ipv4Of).map(({ network }) => network)
      .filter((network) => !isAutomatic(network));
    if (networks.length === 0) continue;
    if (!networks.some((network) => contains(network, gateway))) {
      findings.push({ kind: 'gateway', devices: [device.id], gateway: bare(gateway), network: networks[0].cidr });
    } else if (!owned.has(`32:${parsed.value}`) && !unknowable(device)) {
      const key = bare(gateway);
      if (!missing.has(key)) missing.set(key, { kind: 'gatewayMissing', devices: [], gateway: key });
      missing.get(key).devices.push(device.id);
    }
  }
  return [...findings, ...missing.values()];
}

// Cada cable se mira una vez, desde el equipo con el identificador menor.
function cables(devices, byId) {
  const findings = [];
  for (const device of devices) {
    for (const link of device.links) {
      const peer = byId.get(link.peerId);
      if (!peer) continue;
      const own = portOf(device, link.port);
      if (own && !own.enabled) {
        findings.push({ kind: 'shutdown', devices: [device.id, peer.id], port: own.name });
      }
      if (device.id > peer.id) continue;
      const near = ipv4Of(own);
      const far = ipv4Of(portOf(peer, link.peerPort));
      if (near.length === 0 || far.length === 0) continue;
      const shared = near.some((a) => far.some((b) => a.network.cidr === b.network.cidr));
      if (shared) continue;
      const shown = ({ address, network }) => `${bare(address.address)}/${network.length}`;
      findings.push({
        kind: 'subnets',
        devices: [device.id, peer.id],
        ports: [link.port, link.peerPort],
        addresses: [shown(near[0]), shown(far[0])],
      });
    }
  }
  return findings;
}

// Sólo si es lo único que tiene: una tablet anda por Wi-Fi y deja una 169.254 en la interfaz que no usa.
function automatic(devices) {
  const findings = [];
  for (const device of devices) {
    const ipv4 = device.interfaces.flatMap((entry) => entry.addresses)
      .map(({ address }) => ({ address, parsed: parseAddress(address) }))
      .filter((entry) => entry.parsed?.width === 32 && entry.parsed.value !== 0n);
    const fallback = ipv4.find((entry) => isAutomatic(entry.parsed));
    if (fallback && ipv4.every((entry) => isAutomatic(entry.parsed))) {
      findings.push({ kind: 'automatic', devices: [device.id], address: bare(fallback.address) });
    }
  }
  return findings;
}

// Lo de un mismo tipo junto, y en el orden en que conviene arreglarlo.
export function reviewNetwork(devices) {
  const byId = new Map(devices.map((device) => [device.id, device]));
  return [...duplicates(devices, byId), ...cables(devices, byId), ...gateways(devices, byId), ...automatic(devices)]
    .sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
}
