// Qué cambió entre 2 versiones de una red: equipos agregados y quitados, cambios de configuración
// y de direcciones, y conexiones agregadas y quitadas. No depende del DOM, así se prueba con node.

// Lo que IOS reescribe solo al guardar no cuenta como cambio.
const NOISE = /^(!|end|Building configuration|Current configuration)/i;

const configLines = (device) => device.runningConfig
  .map((line) => line.replace(/\s+$/, ''))
  .filter((line) => line.trim() && !NOISE.test(line.trim()));

// Más allá de esto la tabla de la subsecuencia común pesa demasiado; se compara como conjuntos.
const MAX_CELLS = 4e6;

// Lo igual al principio y al final se aparta antes: en una configuración sin cambios no queda nada
// para la tabla, y con miles de equipos eso es casi todo.
function lineDiff(before, after) {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head
    && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  const same = (lines) => lines.map((text) => ({ type: 'same', text }));
  return [
    ...same(before.slice(0, head)),
    ...middleDiff(before.slice(head, before.length - tail), after.slice(head, after.length - tail)),
    ...same(before.slice(before.length - tail)),
  ];
}

function middleDiff(before, after) {
  const n = before.length;
  const m = after.length;
  if (n * m > MAX_CELLS) {
    const kept = new Set(before);
    const old = new Set(after);
    return [
      ...before.map((text) => ({ type: old.has(text) ? 'same' : 'removed', text })),
      ...after.filter((text) => !kept.has(text)).map((text) => ({ type: 'added', text })),
    ];
  }

  const common = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      common[i][j] = before[i] === after[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const diff = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      diff.push({ type: 'same', text: before[i] });
      i++;
      j++;
    } else if (common[i + 1][j] >= common[i][j + 1]) {
      diff.push({ type: 'removed', text: before[i++] });
    } else {
      diff.push({ type: 'added', text: after[j++] });
    }
  }
  while (i < n) diff.push({ type: 'removed', text: before[i++] });
  while (j < m) diff.push({ type: 'added', text: after[j++] });
  return diff;
}

// Cada cambio con la sección de IOS a la que pertenece ("interface Fa0/1"), como hace git diff.
export function configChanges(before, after) {
  const changes = [];
  let header = null;
  let shown = null;
  for (const entry of lineDiff(configLines(before), configLines(after))) {
    const nested = /^\s/.test(entry.text);
    if (!nested) header = entry;
    if (entry.type === 'same') continue;
    if (nested && header && shown !== header) {
      if (header.type === 'same') changes.push({ type: 'context', text: header.text });
      shown = header;
    }
    if (!nested) shown = entry;
    changes.push(entry);
  }
  return changes;
}

const addressLines = (device) => new Set(device.interfaces.flatMap((entry) =>
  entry.addresses.map((address) => `${entry.name || entry.mac}|${address.address}|${address.mask}`)));

// Sólo para los equipos sin running-config (computadoras, servidores): en los demás las
// direcciones ya aparecen en los cambios de configuración.
function addressChanges(before, after) {
  if (before.runningConfig.length > 0 || after.runningConfig.length > 0) return [];
  const old = addressLines(before);
  const now = addressLines(after);
  const parse = (type) => (line) => {
    const [port, address, mask] = line.split('|');
    return { type, port, address, mask };
  };
  const changes = [...[...old].filter((line) => !now.has(line)).map(parse('removed')),
    ...[...now].filter((line) => !old.has(line)).map(parse('added'))];
  const gateway = (device) => device.interfaces.map((entry) => entry.gateway).find(Boolean) || '';
  if (gateway(before) !== gateway(after)) {
    if (gateway(before)) changes.push({ type: 'removed', gateway: gateway(before) });
    if (gateway(after)) changes.push({ type: 'added', gateway: gateway(after) });
  }
  return changes;
}

// Primero por identificador, que Packet Tracer conserva entre guardados; si no, por nombre.
function matchDevices(before, after) {
  const byId = new Map(before.devices.map((device) => [device.id, device]));
  const byName = new Map(before.devices.map((device) => [device.name, device]));
  const matched = new Map();
  for (const device of after.devices) {
    const old = byId.get(device.id) ?? byName.get(device.name);
    if (old && !matched.has(old)) matched.set(old, device);
  }
  return matched;
}

export function compareNetworks(before, after) {
  const matched = matchDevices(before, after);
  const counterpart = new Map([...matched].map(([old, now]) => [now, old]));

  const changed = new Map();
  for (const [old, now] of matched) {
    const change = {
      renamed: old.name !== now.name ? old.name : '',
      config: configChanges(old, now),
      addresses: addressChanges(old, now),
    };
    if (change.renamed || change.config.length > 0 || change.addresses.length > 0) changed.set(now.id, change);
  }

  return {
    added: after.devices.filter((device) => !counterpart.has(device)),
    removed: before.devices.filter((device) => !matched.has(device)),
    changed,
    ...compareLinks(before, after, new Map([...matched].map(([old, now]) => [old.id, now.id]))),
  };
}

// Una conexión es la misma si une los mismos 2 equipos. Si cambió de puerto se cuenta aparte:
// también pasa cuando una versión de Packet Tracer nombra distinto el mismo puerto.
function compareLinks(before, after, afterId) {
  const oldById = new Map(before.devices.map((device) => [device.id, device]));
  const ends = (link) => [afterId.get(link.from) ?? `-${link.from}`, afterId.get(link.to) ?? `-${link.to}`];
  const pairOf = ([a, b]) => [a, b].sort().join('--');
  const portsOf = ([a, b], link) => [`${a}|${link.fromPort}`, `${b}|${link.toPort}`].sort().join('--');
  const byPair = (links, endsOf) => {
    const groups = new Map();
    for (const link of links) {
      const key = pairOf(endsOf(link));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ link, ports: portsOf(endsOf(link), link) });
    }
    return groups;
  };
  const olds = byPair(before.links, ends);
  const news = byPair(after.links, (link) => [link.from, link.to]);

  const linksAdded = [];
  const linksRemoved = [];
  const linksMoved = [];
  for (const key of new Set([...olds.keys(), ...news.keys()])) {
    const now = [...(news.get(key) ?? [])];
    const left = (olds.get(key) ?? []).filter((old) => {
      const same = now.findIndex((entry) => entry.ports === old.ports);
      if (same < 0) return true;
      now.splice(same, 1);
      return false;
    });
    while (left.length > 0 && now.length > 0) linksMoved.push({ before: left.shift().link, after: now.shift().link });
    linksAdded.push(...now.map((entry) => entry.link));
    linksRemoved.push(...left.map(({ link }) => ({ ...link, fromName: oldById.get(link.from)?.name ?? '', toName: oldById.get(link.to)?.name ?? '' })));
  }
  return { linksAdded, linksRemoved, linksMoved };
}
