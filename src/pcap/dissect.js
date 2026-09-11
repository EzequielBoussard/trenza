import { t } from '../i18n.js';

const ETHERTYPES = {
  0x0800: 'IPv4',
  0x0806: 'ARP',
  0x86dd: 'IPv6',
  0x8100: '802.1Q',
  0x88a8: '802.1ad',
  0x8847: 'MPLS',
  0x8863: 'PPPoE Discovery',
  0x8864: 'PPPoE Session',
};

const IP_PROTOCOLS = {
  1: 'ICMP',
  2: 'IGMP',
  6: 'TCP',
  17: 'UDP',
  41: 'IPv6',
  47: 'GRE',
  50: 'ESP',
  58: 'ICMPv6',
  89: 'OSPF',
  103: 'PIM',
  132: 'SCTP',
};

const WELL_KNOWN_PORTS = {
  20: 'FTP-DATA',
  21: 'FTP',
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  53: 'DNS',
  67: 'DHCP',
  68: 'DHCP',
  69: 'TFTP',
  80: 'HTTP',
  110: 'POP3',
  123: 'NTP',
  143: 'IMAP',
  161: 'SNMP',
  179: 'BGP',
  443: 'HTTPS',
  445: 'SMB',
  514: 'Syslog',
  520: 'RIP',
  3389: 'RDP',
  8080: 'HTTP',
};

const ICMPV4_TYPES = {
  0: 'icmp.echoReply',
  3: 'icmp.unreachable',
  5: 'icmp.redirect',
  8: 'icmp.echoRequest',
  11: 'icmp.ttlExceeded',
};

const ICMPV6_TYPES = {
  128: 'icmp.echoRequest',
  129: 'icmp.echoReply',
  135: 'icmp.neighborSolicitation',
  136: 'icmp.neighborAdvertisement',
};

const TCP_FLAG_NAMES = ['FIN', 'SYN', 'RST', 'PSH', 'ACK', 'URG', 'ECE', 'CWR'];

// Los enlaces que sabe leer el visor. Ethernet es casi todo lo que se captura, pero un
// `tcpdump -i any` da «Linux cooked», la interfaz de bucle de macOS da «loopback», y un
// enlace serie entre routers —lo que arma medio curso de redes— da Cisco HDLC.
const LINK_TYPES = {
  0: 'Loopback',
  1: 'Ethernet',
  9: 'PPP',
  101: 'Raw IP',
  104: 'Cisco HDLC',
  113: 'Linux cooked',
  228: 'Raw IPv4',
  229: 'Raw IPv6',
  276: 'Linux cooked v2',
};

const hex2 = (value) => value.toString(16).padStart(2, '0');

function formatMac(bytes, offset) {
  return Array.from(bytes.subarray(offset, offset + 6)).map(hex2).join(':');
}

function formatIPv4(bytes, offset) {
  return `${bytes[offset]}.${bytes[offset + 1]}.${bytes[offset + 2]}.${bytes[offset + 3]}`;
}

function formatIPv6(bytes, offset) {
  const groups = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(((bytes[offset + i] << 8) | bytes[offset + i + 1]).toString(16));
  }
  const compact = groups.join(':').replace(/\b(?:0(?::0)+)\b/, '::');
  return compact.replace(/:{3,}/, '::');
}

function serviceName(port) {
  return WELL_KNOWN_PORTS[port] || '';
}

function describePort(port) {
  const service = serviceName(port);
  return service ? `${port} (${service})` : String(port);
}

function dissectTcp(bytes, offset, length) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const source = view.getUint16(offset, false);
  const destination = view.getUint16(offset + 2, false);
  const dataOffset = (bytes[offset + 12] >> 4) * 4;
  const flagBits = bytes[offset + 13];
  const flags = TCP_FLAG_NAMES.filter((_, bit) => flagBits & (1 << bit));

  return {
    name: 'TCP',
    fields: () => [
      [t('field.sourcePort'), describePort(source)],
      [t('field.destinationPort'), describePort(destination)],
      [t('field.sequence'), view.getUint32(offset + 4, false)],
      [t('field.acknowledgement'), view.getUint32(offset + 8, false)],
      [t('field.flags'), flags.join(', ') || t('field.noFlags')],
      [t('field.window'), view.getUint16(offset + 14, false)],
    ],
    service: serviceName(destination) || serviceName(source),
    summary: t('packet.tcp', {
      source,
      destination,
      flags: flags.join(', '),
      length: Math.max(0, length - dataOffset),
    }),
  };
}

function dissectUdp(bytes, offset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const source = view.getUint16(offset, false);
  const destination = view.getUint16(offset + 2, false);
  const length = view.getUint16(offset + 4, false);

  return {
    name: 'UDP',
    fields: () => [
      [t('field.sourcePort'), describePort(source)],
      [t('field.destinationPort'), describePort(destination)],
      [t('field.length'), length],
    ],
    service: serviceName(destination) || serviceName(source),
    summary: t('packet.lengths', { source, destination, length: Math.max(0, length - 8) }),
  };
}

function dissectIcmp(bytes, offset, version) {
  const type = bytes[offset];
  const code = bytes[offset + 1];
  const key = version === 6 ? ICMPV6_TYPES[type] : ICMPV4_TYPES[type];
  const name = key ? t(key) : '';

  return {
    name: version === 6 ? 'ICMPv6' : 'ICMP',
    fields: () => [
      [t('field.type'), name ? `${type} (${name})` : String(type)],
      [t('field.code'), code],
    ],
    summary: name || t('packet.icmpGeneric', { type, code }),
  };
}

function dissectArp(bytes, offset) {
  const operation = (bytes[offset + 6] << 8) | bytes[offset + 7];
  const senderMac = formatMac(bytes, offset + 8);
  const senderIp = formatIPv4(bytes, offset + 14);
  const targetIp = formatIPv4(bytes, offset + 24);

  return {
    name: 'ARP',
    fields: () => [
      [t('field.operation'), `${operation} (${t(operation === 1 ? 'field.request' : 'field.reply')})`],
      [t('field.sourceMac'), senderMac],
      [t('field.sourceIp'), senderIp],
      [t('field.destinationMac'), formatMac(bytes, offset + 18)],
      [t('field.destinationIp'), targetIp],
    ],
    source: senderIp,
    destination: targetIp,
    summary: operation === 1
      ? t('packet.arpRequest', { target: targetIp, sender: senderIp })
      : t('packet.arpReply', { sender: senderIp, mac: senderMac }),
  };
}

function dissectIPv4(bytes, offset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = (bytes[offset] & 0x0f) * 4;
  const totalLength = view.getUint16(offset + 2, false);
  const protocol = bytes[offset + 9];
  const source = formatIPv4(bytes, offset + 12);
  const destination = formatIPv4(bytes, offset + 16);

  return {
    layer: {
      name: 'IPv4',
      fields: () => [
        [t('field.source'), source],
        [t('field.destination'), destination],
        [t('field.protocol'), IP_PROTOCOLS[protocol] ? `${protocol} (${IP_PROTOCOLS[protocol]})` : String(protocol)],
        [t('field.ttl'), bytes[offset + 8]],
        [t('field.totalLength'), totalLength],
      ],
      source,
      destination,
    },
    protocol,
    next: offset + headerLength,
    payloadLength: totalLength - headerLength,
  };
}

function dissectIPv6(bytes, offset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payloadLength = view.getUint16(offset + 4, false);
  const protocol = bytes[offset + 6];
  const source = formatIPv6(bytes, offset + 8);
  const destination = formatIPv6(bytes, offset + 24);

  return {
    layer: {
      name: 'IPv6',
      fields: () => [
        [t('field.source'), source],
        [t('field.destination'), destination],
        [t('field.nextHeader'), IP_PROTOCOLS[protocol] ? `${protocol} (${IP_PROTOCOLS[protocol]})` : String(protocol)],
        [t('field.hopLimit'), bytes[offset + 7]],
      ],
      source,
      destination,
    },
    protocol,
    next: offset + 40,
    payloadLength,
  };
}

/** Cómo se llama el enlace del que salió la captura, para el resumen del archivo. */
export function linkTypeName(linkType) {
  return LINK_TYPES[linkType] || t('packet.linkType', { type: linkType });
}

/** El nibble de versión dice si lo que empieza en `offset` es IPv4, IPv6 o ninguna cosa. */
function ipEtherType(bytes, offset) {
  const version = bytes[offset] >> 4;
  if (version === 4) return 0x0800;
  if (version === 6) return 0x86dd;
  return null;
}

function etherTypeLabel(value) {
  const hex = `0x${value.toString(16).padStart(4, '0')}`;
  return ETHERTYPES[value] ? `${hex} (${ETHERTYPES[value]})` : hex;
}

/**
 * La capa de enlace: qué encabezado trae el paquete, cuánto mide y qué lleva adentro. El
 * tipo no lo dice el paquete sino la captura, y de él depende dónde empieza todo lo
 * demás: leer un «Linux cooked» como si fuera Ethernet corre las direcciones dos bytes y
 * el desglose sale entero pero mal.
 */
function dissectLink(linkType, bytes) {
  const layers = [];
  const named = (fields) => layers.push({ name: LINK_TYPES[linkType], fields });

  if (linkType === 1) {
    if (bytes.length < 14) return { layers, offset: 0, etherType: null, macs: false };

    let etherType = (bytes[12] << 8) | bytes[13];
    const carried = etherType;
    layers.push({
      name: 'Ethernet',
      fields: () => [
        [t('field.sourceMac'), formatMac(bytes, 6)],
        [t('field.destinationMac'), formatMac(bytes, 0)],
        [t('field.etherType'), etherTypeLabel(carried)],
      ],
    });

    let offset = 14;
    while (etherType === 0x8100 || etherType === 0x88a8) {
      const vlanId = ((bytes[offset] << 8) | bytes[offset + 1]) & 0x0fff;
      etherType = (bytes[offset + 2] << 8) | bytes[offset + 3];
      layers.push({ name: 'VLAN 802.1Q', fields: () => [[t('field.vlan'), vlanId]] });
      offset += 4;
    }

    return { layers, offset, etherType, macs: true };
  }

  // Sin encabezado: el paquete IP arranca en el primer byte.
  if (linkType === 101 || linkType === 228 || linkType === 229) {
    return { layers, offset: 0, etherType: ipEtherType(bytes, 0), macs: false };
  }

  // Bucle local de BSD y macOS: cuatro bytes con la familia de direcciones, en el orden de
  // bytes del equipo que capturó y con un valor distinto por sistema para IPv6. Mirar la
  // versión del paquete que sigue contesta lo mismo sin depender de nada de eso.
  if (linkType === 0) {
    const etherType = ipEtherType(bytes, 4);
    named(() => [[t('field.protocol'), etherType ? ETHERTYPES[etherType] : t('field.unknown')]]);
    return { layers, offset: 4, etherType, macs: false };
  }

  if (linkType === 9) {
    const start = bytes[0] === 0xff && bytes[1] === 0x03 ? 2 : 0;
    const carried = (bytes[start] << 8) | bytes[start + 1];
    const etherType = carried === 0x0021 ? 0x0800 : carried === 0x0057 ? 0x86dd : null;
    named(() => [[t('field.protocol'), `0x${carried.toString(16).padStart(4, '0')}`]]);
    return { layers, offset: start + 2, etherType, macs: false };
  }

  // Cisco HDLC: dirección, control y un EtherType. Es lo que sale de un enlace serie.
  if (linkType === 104) {
    const etherType = (bytes[2] << 8) | bytes[3];
    named(() => [
      [t('field.address'), `0x${bytes[0].toString(16).padStart(2, '0')}`],
      [t('field.etherType'), etherTypeLabel(etherType)],
    ]);
    return { layers, offset: 4, etherType, macs: false };
  }

  // Las dos formas del encabezado que pone Linux cuando se captura de todas las interfaces
  // a la vez: el EtherType está al final en la primera y al principio en la segunda.
  if (linkType === 113 || linkType === 276) {
    const at = linkType === 113 ? 14 : 0;
    const etherType = (bytes[at] << 8) | bytes[at + 1];
    named(() => [[t('field.etherType'), etherTypeLabel(etherType)]]);
    return { layers, offset: linkType === 113 ? 16 : 20, etherType, macs: false };
  }

  return { layers, offset: 0, etherType: null, macs: false };
}

/**
 * Descompone un paquete en capas legibles. Se detiene con lo que haya podido leer
 * cuando la captura está truncada, en vez de descartar el paquete entero.
 *
 * Los campos de cada capa se arman recién cuando alguien los pide, porque sólo se ven los
 * del paquete elegido. Armándolos de entrada, una captura de cien mil paquetes construía
 * 1,17 millones de pares de etiqueta y valor traducidos que nadie iba a leer: 1441 ms de
 * pantalla congelada, contra 101 ms que cuesta recorrer los bytes.
 */
export function dissectPacket(packet) {
  const bytes = packet.bytes;
  const layers = [];
  let source = '';
  let destination = '';
  // Un paquete que el visor no sabe desarmar igual dice de qué enlace salió, que es más
  // de lo que dice un guión.
  let protocol = linkTypeName(packet.linkType);
  let summary = '';
  let ethernet = false;

  try {
    const link = dissectLink(packet.linkType, bytes);
    const offset = link.offset;
    const etherType = link.etherType;
    layers.push(...link.layers);
    ethernet = link.macs;
    if (etherType !== null) protocol = ETHERTYPES[etherType] || `0x${etherType.toString(16)}`;

    if (etherType === 0x0806) {
      const arp = dissectArp(bytes, offset);
      layers.push(arp);
      source = arp.source;
      destination = arp.destination;
      protocol = 'ARP';
      summary = arp.summary;
    } else if (etherType === 0x0800 || etherType === 0x86dd) {
      const network = etherType === 0x0800 ? dissectIPv4(bytes, offset) : dissectIPv6(bytes, offset);
      layers.push(network.layer);
      source = network.layer.source;
      destination = network.layer.destination;
      protocol = IP_PROTOCOLS[network.protocol] || `IP/${network.protocol}`;
      summary = t('packet.ipSummary', { protocol, bytes: network.payloadLength });

      if (network.protocol === 6) {
        const tcp = dissectTcp(bytes, network.next, network.payloadLength);
        layers.push(tcp);
        protocol = tcp.service || 'TCP';
        summary = tcp.summary;
      } else if (network.protocol === 17) {
        const udp = dissectUdp(bytes, network.next);
        layers.push(udp);
        protocol = udp.service || 'UDP';
        summary = udp.summary;
      } else if (network.protocol === 1 || network.protocol === 58) {
        const icmp = dissectIcmp(bytes, network.next, network.protocol === 58 ? 6 : 4);
        layers.push(icmp);
        protocol = icmp.name;
        summary = icmp.summary;
      }
    }
  } catch {
    summary = t('packet.truncated');
  }

  // Las MAC valen como origen y destino sólo cuando ninguna capa de red puso direcciones.
  // Formatearlas cuesta treinta veces más que leer una IP —seis bytes a hexadecimal, con
  // sus relleno y su unión— y en tráfico IP, que es casi todo, se descartarían las dos.
  if (!source && ethernet) {
    source = formatMac(bytes, 6);
    destination = formatMac(bytes, 0);
  }

  return {
    ...packet,
    layers,
    source,
    destination,
    protocol,
    // El texto de reserva se arma sólo si no hubo otro: interpolarlo para después pisarlo
    // es una traducción por paquete tirada a la basura.
    summary: summary || t('packet.undissected', { bytes: packet.capturedLength }),
  };
}

export function toHexDump(bytes) {
  const lines = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const slice = bytes.subarray(offset, offset + 16);
    const hex = Array.from(slice).map(hex2).join(' ').padEnd(47, ' ');
    const ascii = Array.from(slice)
      .map((byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.'))
      .join('');
    lines.push(`${offset.toString(16).padStart(4, '0')}  ${hex}  ${ascii}`);
  }
  return lines.join('\n');
}
