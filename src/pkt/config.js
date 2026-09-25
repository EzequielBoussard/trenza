// Parsers de la running-config (texto IOS). No dependen del DOM, así se prueban con node.

// El XML guarda las direcciones de los puertos pero no sus nombres; los nombres salen de acá.
export function readInterfaces(configLines) {
  const interfaces = [];
  let current = null;

  for (const raw of configLines) {
    const line = raw.trim();
    const opened = line.match(/^interface\s+(\S+)/i);
    if (opened) {
      current = { name: opened[1], addresses: [], description: '', enabled: true, accessGroups: [] };
      interfaces.push(current);
      continue;
    }
    if (!current) continue;
    if (line === '!' || /^(line|router|ip route)\b/i.test(line)) {
      current = null;
      continue;
    }

    const ipv4 = line.match(/^ip address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/i);
    if (ipv4) current.addresses.push({ address: ipv4[1], mask: ipv4[2] });

    const ipv6 = line.match(/^ipv6 address\s+(\S+)/i);
    if (ipv6) current.addresses.push({ address: ipv6[1], mask: '' });

    const description = line.match(/^description\s+(.+)/i);
    if (description) current.description = description[1];

    const access = line.match(/^switchport access vlan\s+(\d+)/i);
    if (access) current.vlan = access[1];

    // Router-on-a-stick: la VLAN la da la encapsulación, no el nombre de la subinterfaz.
    const tagged = line.match(/^encapsulation\s+dot1q\s+(\d+)/i);
    if (tagged) current.dot1q = tagged[1];

    const group = line.match(/^ip access-group\s+(\S+)\s+(in|out)\b/i);
    if (group) current.accessGroups.push({ id: group[1], direction: group[2].toLowerCase() });

    // Un trunk sin "allowed vlan" las lleva todas.
    if (/^switchport mode trunk$/i.test(line)) current.trunkAll = true;

    const trunk = line.match(/^switchport trunk allowed vlan\s+(?:add\s+)?(\S+)/i);
    if (trunk) current.trunk = current.trunk ? `${current.trunk},${trunk[1]}` : trunk[1];

    if (/^shutdown$/i.test(line)) current.enabled = false;
  }

  return interfaces;
}

// "10,20,30-32"
function expandVlanList(list) {
  if (!list) return [];

  const ids = [];
  for (const part of list.split(',')) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      for (let id = Number(range[1]); id <= Number(range[2]); id++) ids.push(String(id));
    } else if (/^\d+$/.test(part)) {
      ids.push(part);
    }
  }
  return ids;
}

// Existen en todo switch; sólo se muestran si algún puerto las usa.
const DEFAULT_VLANS = new Set(['1', '1002', '1003', '1004', '1005']);

// Cruza las VLAN del XML (`declared`: número y nombre) con la running-config, que dice qué
// puerto pertenece a cuál.
export function readVlans(configLines, interfaces, declared = []) {
  const vlans = new Map();
  const named = new Set();
  const define = (id) => {
    if (!vlans.has(id)) vlans.set(id, { id, name: '', ports: [], trunks: [], routed: [] });
    return vlans.get(id);
  };

  for (const vlan of declared) define(vlan.id).name = vlan.name;

  let open = null;
  for (const raw of configLines) {
    const line = raw.trim();
    const header = line.match(/^vlan\s+(\d+)$/i);
    if (header) {
      open = define(header[1]);
      continue;
    }
    if (!open) continue;

    const label = line.match(/^name\s+(.+)$/i);
    if (label) open.name = label[1];
    else open = null;
  }

  for (const entry of interfaces) {
    if (entry.vlan) {
      define(entry.vlan).ports.push(entry.name);
      named.add(entry.vlan);
    }
    if (entry.dot1q) {
      define(entry.dot1q).routed.push(entry.name);
      named.add(entry.dot1q);
    }
    for (const id of expandVlanList(entry.trunk)) {
      define(id).trunks.push(entry.name);
      named.add(id);
    }
  }

  // Los trunks sin lista se resuelven al final, cuando ya se conocen todas las VLAN.
  for (const entry of interfaces) {
    if (!entry.trunkAll) continue;
    for (const vlan of vlans.values()) {
      if (!vlan.trunks.includes(entry.name)) vlan.trunks.push(entry.name);
    }
  }

  return [...vlans.values()]
    .filter((vlan) => !DEFAULT_VLANS.has(vlan.id) || named.has(vlan.id))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

// Sólo rutas estáticas: las aprendidas no están en la configuración.
export function readRoutes(configLines) {
  const routes = [];

  for (const raw of configLines) {
    const line = raw.trim();

    const ipv4 = line.match(/^ip route\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\S+)/i);
    if (ipv4) routes.push({ destination: ipv4[1], mask: ipv4[2], via: ipv4[3] });

    const ipv6 = line.match(/^ipv6 route\s+(\S+\/\d+)\s+(\S+)/i);
    if (ipv6) routes.push({ destination: ipv6[1], mask: '', via: ipv6[2] });
  }

  return routes;
}

// Las reglas conservan su orden (gana la primera que coincide) y cada lista sabe en qué
// interfaces está aplicada.
export function readAccessLists(configLines, interfaces = []) {
  const lists = new Map();
  const define = (id) => {
    if (!lists.has(id)) lists.set(id, { id, rules: [], inbound: [], outbound: [] });
    return lists.get(id);
  };

  let open = null;
  for (const raw of configLines) {
    const line = raw.trim();

    // Numeradas: una regla por línea. Nombradas: un bloque que termina en la primera línea
    // que no es regla.
    const numbered = line.match(/^access-list\s+(\S+)\s+(.+)$/i);
    if (numbered) {
      define(numbered[1]).rules.push(numbered[2].trim());
      open = null;
      continue;
    }

    const named = line.match(/^ip(?:v6)? access-list\s+(?:(?:standard|extended)\s+)?(\S+)/i);
    if (named) {
      open = define(named[1]);
      continue;
    }

    if (!open) continue;
    if (/^(permit|deny|remark)\b/i.test(line)) open.rules.push(line);
    else open = null;
  }

  for (const entry of interfaces) {
    for (const applied of entry.accessGroups || []) {
      define(applied.id)[applied.direction === 'in' ? 'inbound' : 'outbound'].push(entry.name);
    }
  }

  return [...lists.values()];
}

// Las sentencias `network` quedan como texto: cada protocolo tiene su propia sintaxis.
export function readRoutingProtocols(configLines) {
  const protocols = [];
  let open = null;

  for (const raw of configLines) {
    const line = raw.trim();

    const header = line.match(/^router\s+([a-z0-9]+)\s*(\S*)/i);
    if (header) {
      open = { protocol: header[1].toUpperCase(), id: header[2], version: '', networks: [], passive: [] };
      protocols.push(open);
      continue;
    }
    if (!open) continue;
    if (line === '!' || /^(interface|line|ip route|access-list)\b/i.test(line)) {
      open = null;
      continue;
    }

    const version = line.match(/^version\s+(\S+)/i);
    if (version) open.version = version[1];

    const network = line.match(/^network\s+(.+)$/i);
    if (network) open.networks.push(network[1].trim().replace(/\s+/g, ' '));

    const passive = line.match(/^passive-interface\s+(\S+)/i);
    if (passive) open.passive.push(passive[1]);
  }

  return protocols;
}
