// Errores de configuración que se ven en el archivo sin simular la red. No depende del DOM, así se
// prueba con node.
import { networkOf, parseAddress } from './query.js';

const KINDS = ['duplicate', 'subnets', 'shutdown', 'gateway', 'automatic'];
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

function duplicates(devices) {
  const owners = new Map();
  for (const device of devices) {
    for (const { address } of device.interfaces.flatMap((entry) => entry.addresses)) {
      const parsed = parseAddress(address);
      if (!parsed || parsed.value === 0n || isAutomatic(parsed) || isLinkLocal(parsed)) continue;
      const key = `${parsed.width}:${parsed.value}`;
      if (!owners.has(key)) owners.set(key, { address: bare(address), ids: new Set() });
      owners.get(key).ids.add(device.id);
    }
  }
  return [...owners.values()]
    .filter(({ ids }) => ids.size > 1)
    .map(({ address, ids }) => ({ kind: 'duplicate', devices: [...ids], address }));
}

// Sólo con máscara: sin ella no se sabe cuál es la red del equipo.
function gateways(devices) {
  const findings = [];
  for (const device of devices) {
    const gateway = device.interfaces.map((entry) => entry.gateway).find(Boolean);
    const parsed = gateway && parseAddress(gateway);
    if (!parsed || parsed.width !== 32 || parsed.value === 0n) continue;
    const networks = device.interfaces.flatMap(ipv4Of).map(({ network }) => network)
      .filter((network) => !isAutomatic(network));
    if (networks.length === 0 || networks.some((network) => contains(network, gateway))) continue;
    findings.push({ kind: 'gateway', devices: [device.id], gateway: bare(gateway), network: networks[0].cidr });
  }
  return findings;
}

// Cada cable se mira una vez, desde el equipo con el identificador menor.
function cables(devices) {
  const byId = new Map(devices.map((device) => [device.id, device]));
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
  return [...duplicates(devices), ...cables(devices), ...gateways(devices), ...automatic(devices)]
    .sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
}
