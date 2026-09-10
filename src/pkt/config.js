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
      current = { name: opened[1], addresses: [], description: '', enabled: true };
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
    if (!vlans.has(id)) vlans.set(id, { id, name: '', ports: [], trunks: [] });
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
