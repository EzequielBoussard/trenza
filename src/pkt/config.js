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

/**
 * Las VLAN salen de dos lados y hay que cruzarlos: los bloques `vlan` dan el número y el
 * nombre, y los puertos dicen a cuál pertenecen. Una VLAN puede aparecer sólo en un puerto,
 * sin bloque propio que la declare, así que se define al vuelo.
 */
export function readVlans(configLines, interfaces) {
  const vlans = new Map();
  const define = (id) => {
    if (!vlans.has(id)) vlans.set(id, { id, name: '', ports: [], trunks: [] });
    return vlans.get(id);
  };

  let open = null;
  for (const raw of configLines) {
    const line = raw.trim();
    const header = line.match(/^vlan\s+(\d+)$/i);
    if (header) {
      open = define(header[1]);
      continue;
    }
    if (!open) continue;

    const named = line.match(/^name\s+(.+)$/i);
    if (named) open.name = named[1];
    else open = null;
  }

  for (const entry of interfaces) {
    if (entry.vlan) define(entry.vlan).ports.push(entry.name);
    for (const id of expandVlanList(entry.trunk)) define(id).trunks.push(entry.name);
  }

  return [...vlans.values()].sort((a, b) => Number(a.id) - Number(b.id));
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
