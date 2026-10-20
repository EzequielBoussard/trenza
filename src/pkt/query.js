// Lo que se escribe en el buscador de equipos: una subred (192.168.1.0/24, 2001:db8::/32), una
// VLAN ("vlan 10") o texto. No depende del DOM, así se prueba con node.

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
