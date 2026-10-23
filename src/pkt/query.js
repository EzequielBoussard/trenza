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
