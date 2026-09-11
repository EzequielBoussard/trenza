/**
 * Lectura de la `running-config` que Packet Tracer guarda por dispositivo. Es texto de
 * Cisco IOS, no XML, y todo lo de acá trabaja sobre líneas sueltas: sirve para probarlo
 * sin navegador y deja a `model.js` con una sola tarea, traducir el árbol del archivo.
 */

/**
 * Las interfaces con nombre sólo aparecen acá; el árbol de puertos del XML guarda
 * direcciones pero no la nomenclatura que usa el equipo. Devuelve todas, incluso las que
 * no llevan dirección: un puerto de acceso sin IP no dice nada por sí solo, pero es el que
 * dice qué VLAN vive en ese cable.
 */
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

    // Router en un palo: la subinterfaz no es un puerto de acceso, es la puerta de enlace
    // de esa VLAN. El número lo lleva la encapsulación, no el nombre de la interfaz.
    const tagged = line.match(/^encapsulation\s+dot1q\s+(\d+)/i);
    if (tagged) current.dot1q = tagged[1];

    const group = line.match(/^ip access-group\s+(\S+)\s+(in|out)\b/i);
    if (group) current.accessGroups.push({ id: group[1], direction: group[2].toLowerCase() });

    // Un tronco sin lista de permitidas las lleva todas, que es lo que hace Cisco por
    // omisión y lo que escribe Packet Tracer cuando se configura por la interfaz.
    if (/^switchport mode trunk$/i.test(line)) current.trunkAll = true;

    // Un tronco puede declarar sus VLAN en varias líneas, con `add` en las siguientes.
    const trunk = line.match(/^switchport trunk allowed vlan\s+(?:add\s+)?(\S+)/i);
    if (trunk) current.trunk = current.trunk ? `${current.trunk},${trunk[1]}` : trunk[1];

    if (/^shutdown$/i.test(line)) current.enabled = false;
  }

  return interfaces;
}

/** Una lista de VLAN de tronco: números sueltos y rangos, `10,20,30-32`. */
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

// Packet Tracer crea estas en cada switch por su cuenta y nadie las toca. Aparecen siempre,
// así que listarlas sería una fila de ruido por dispositivo; se muestran sólo si algún
// puerto las nombra, que ahí sí alguien decidió algo.
const DEFAULT_VLANS = new Set(['1', '1002', '1003', '1004', '1005']);

/**
 * Las VLAN salen de dos lados del archivo y hay que cruzarlos. El árbol XML del dispositivo
 * trae la base con el número y el nombre —y es la única fuente cuando el switch se configuró
 * por la interfaz de Packet Tracer, que no escribe nada en la configuración—; la
 * configuración dice qué puerto pertenece a cuál, que el XML no guarda. `declared` son las
 * del XML; una VLAN que sólo aparezca en un puerto se define igual, al vuelo.
 */
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

  // Los troncos sin lista se resuelven al final, cuando ya se sabe qué VLAN hay.
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

/** Las rutas escritas a mano. Las que aprende un protocolo no están en la configuración. */
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

/**
 * Las listas de acceso, con las reglas en el orden en que están escritas: en una lista de
 * acceso el orden es la regla, porque se evalúa de arriba abajo y la primera que coincide
 * decide. Se cruzan con las interfaces para decir dónde está aplicada cada una, que es la
 * mitad del dato: una lista escrita y no aplicada no filtra nada.
 */
export function readAccessLists(configLines, interfaces = []) {
  const lists = new Map();
  const define = (id) => {
    if (!lists.has(id)) lists.set(id, { id, rules: [], inbound: [], outbound: [] });
    return lists.get(id);
  };

  let open = null;
  for (const raw of configLines) {
    const line = raw.trim();

    // Las numeradas van en una línea cada una; las nombradas abren un bloque con sus
    // reglas adentro, y el bloque termina en la primera línea que no es una regla.
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

/**
 * Los protocolos de enrutamiento dinámico. Las redes se guardan tal como están escritas
 * —`10.0.0.0 0.0.0.255 area 0`— en vez de despiezarlas: cada protocolo le da su propia
 * forma a esa línea y volver a armarla para mostrarla no agrega nada que el original no
 * diga. Las rutas que el protocolo aprende no están en el archivo; esto es la
 * configuración, no la tabla de enrutamiento.
 */
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
