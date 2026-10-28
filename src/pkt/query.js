// Lo que se escribe en los buscadores. En el de equipos: una subred (192.168.1.0/24, 2001:db8::/32),
// una VLAN ("vlan 10"), una MAC o texto; en el de paquetes, además, una conversación.

function parseIPv4(text) {
  const parts = text.split('.');
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return null;
  return { width: 32, value: parts.reduce((total, part) => (total << 8n) | BigInt(part), 0n) };
}

function parseIPv6(text) {
  const halves = text.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const groups = halves.map((half) => (half ? half.split(':') : []));
  const missing = 8 - groups.reduce((total, half) => total + half.length, 0);
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const all = halves.length === 2 ? [...groups[0], ...Array(missing).fill('0'), ...groups[1]] : groups[0];
  if (!all.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  return { width: 128, value: all.reduce((total, group) => (total << 16n) | BigInt(`0x${group}`), 0n) };
}

// IOS guarda la de IPv6 con su prefijo ("2001:DB8::1/64") y a veces con "link-local" detrás.
export function parseAddress(text) {
  const bare = String(text).trim().split(/[\s/]/)[0];
  return bare.includes(':') ? parseIPv6(bare) : parseIPv4(bare);
}

export function parseQuery(text) {
  const term = text.trim();
  const vlan = term.match(/^vlan\s*(\d{1,4})$/i);
  if (vlan) return { kind: 'vlan', id: String(Number(vlan[1])) };

  const subnet = term.match(/^([0-9a-f.:]+)\/(\d{1,3})$/i);
  const network = subnet && parseAddress(subnet[1]);
  if (network && Number(subnet[2]) <= network.width) {
    const shift = BigInt(network.width - Number(subnet[2]));
    return { kind: 'subnet', width: network.width, shift, prefix: network.value >> shift };
  }

  return { kind: 'text', needle: term.toLowerCase() };
}

// La MAC como la muestra una captura (00:01:63:43:a2:b1), como la guarda IOS (0001.6343.a2b1) o
// pegada, entera o un pedazo. Devuelve sólo los dígitos, que es como la guarda el modelo.
const MAC_FORMATS = [
  /^[0-9a-f]{2}(?:[:-][0-9a-f]{2}){1,5}[:-]?[0-9a-f]?$/,
  /^[0-9a-f]{4}(?:\.[0-9a-f]{1,4}){1,2}\.?$/,
  /^[0-9a-f]{12}$/,
];

export function macDigits(needle) {
  return MAC_FORMATS.some((format) => format.test(needle)) ? needle.replace(/[^0-9a-f]/g, '') : '';
}

const CAPTURED_MAC = /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/;

// 2 direcciones separadas por un espacio: los paquetes entre ellas, en los 2 sentidos.
export function parseConversation(text) {
  const ends = text.trim().toLowerCase().split(/\s+/);
  if (ends.length !== 2) return null;
  return ends.every((end) => CAPTURED_MAC.test(end) || (!end.includes('/') && parseAddress(end))) ? ends : null;
}

const IPV4_ALL = (1n << 32n) - 1n;

function maskLength(mask) {
  const parsed = parseIPv4(mask);
  if (!parsed) return null;
  for (let length = 0; length <= 32; length++) {
    if (parsed.value === (IPV4_ALL ^ ((1n << BigInt(32 - length)) - 1n))) return length;
  }
  return null;
}

// En minúscula y con el tramo de ceros más largo como "::", como pide el RFC 5952.
function formatIPv6(value) {
  const groups = Array.from({ length: 8 }, (_, index) => Number((value >> BigInt(112 - index * 16)) & 0xffffn));
  let best = { at: -1, length: 1 };
  for (let at = 0; at < 8; at++) {
    let length = 0;
    while (at + length < 8 && groups[at + length] === 0) length++;
    if (length > best.length) best = { at, length };
  }
  const hex = groups.map((group) => group.toString(16));
  if (best.at < 0) return hex.join(':');
  return `${hex.slice(0, best.at).join(':')}::${hex.slice(best.at + best.length).join(':')}`;
}

function formatAddress(value, width) {
  if (width === 128) return formatIPv6(value);
  return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 255n)).join('.');
}

// La de enlace local (fe80::/10) la tiene cada interfaz con IPv6 y 0.0.0.0 es la de quien espera
// DHCP: ninguna dice cómo está armada la red.
export function networkOf({ address, mask }) {
  const parsed = parseAddress(address);
  if (!parsed || parsed.value === 0n) return null;
  let length;
  if (parsed.width === 32) {
    length = maskLength(mask);
  } else {
    const prefix = String(address).match(/\/(\d{1,3})/);
    length = prefix && Number(prefix[1]) <= 128 && parsed.value >> 118n !== 0x3fan ? Number(prefix[1]) : null;
  }
  if (length === null) return null;
  const shift = BigInt(parsed.width - length);
  const value = (parsed.value >> shift) << shift;
  return { width: parsed.width, value, length, cidr: `${formatAddress(value, parsed.width)}/${length}` };
}

// Las redes IP que aparecen en las interfaces y cuántos equipos tienen una dirección en cada una,
// IPv4 primero y en orden numérico. El texto de cada una, escrito en el buscador, las filtra.
export function subnetsOf(devices) {
  const subnets = new Map();
  for (const device of devices) {
    const own = new Set();
    for (const entry of device.interfaces.flatMap((item) => item.addresses)) {
      const network = networkOf(entry);
      if (!network || own.has(network.cidr)) continue;
      own.add(network.cidr);
      if (!subnets.has(network.cidr)) subnets.set(network.cidr, { ...network, count: 0 });
      subnets.get(network.cidr).count++;
    }
  }
  return [...subnets.values()]
    .sort((a, b) => a.width - b.width || (a.value === b.value ? a.length - b.length : a.value < b.value ? -1 : 1))
    .map(({ cidr, count }) => ({ cidr, count }));
}

export function inSubnet(address, query) {
  const parsed = parseAddress(address);
  return Boolean(parsed) && parsed.width === query.width && parsed.value >> query.shift === query.prefix;
}

// Quién está en cada VLAN: los equipos que la configuran (switches y routers con subinterfaces) y
// los que están enchufados a un puerto de acceso o de voz de esa VLAN, que es lo que se busca.
export function vlanMembers(model) {
  const members = new Map();
  const add = (id, deviceId) => {
    if (!members.has(id)) members.set(id, new Set());
    members.get(id).add(deviceId);
  };

  for (const device of model.devices) {
    const peerOn = new Map(device.links.map((link) => [link.port.toLowerCase(), link.peerId]));
    for (const vlan of device.vlans) {
      add(vlan.id, device.id);
      for (const port of [...vlan.ports, ...vlan.voice]) {
        const peer = peerOn.get(port.toLowerCase());
        if (peer) add(vlan.id, peer);
      }
    }
  }
  return members;
}
