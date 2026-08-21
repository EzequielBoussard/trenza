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
    fields: [
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
    fields: [
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
    fields: [
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
  const action = t(operation === 1 ? 'field.request' : 'field.reply');

  return {
    name: 'ARP',
    fields: [
      [t('field.operation'), `${operation} (${action})`],
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
      fields: [
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
      fields: [
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

/**
 * Descompone un paquete en capas legibles. Se detiene con lo que haya podido leer
 * cuando la captura está truncada, en vez de descartar el paquete entero.
 */
export function dissectPacket(packet) {
  const bytes = packet.bytes;
  const layers = [];
  let source = '';
  let destination = '';
  let protocol = '—';
  let summary = t('packet.undissected', { bytes: packet.capturedLength });

  try {
    let offset = 0;
    let etherType = null;

    if (packet.linkType === 1 && bytes.length >= 14) {
      etherType = (bytes[12] << 8) | bytes[13];
      source = formatMac(bytes, 6);
      destination = formatMac(bytes, 0);
      const label = `0x${etherType.toString(16).padStart(4, '0')}`;
      layers.push({
        name: 'Ethernet',
        fields: [
          [t('field.sourceMac'), source],
          [t('field.destinationMac'), destination],
          [t('field.etherType'), ETHERTYPES[etherType] ? `${label} (${ETHERTYPES[etherType]})` : label],
        ],
      });
      offset = 14;

      while (etherType === 0x8100 || etherType === 0x88a8) {
        const vlanId = ((bytes[offset] << 8) | bytes[offset + 1]) & 0x0fff;
        etherType = (bytes[offset + 2] << 8) | bytes[offset + 3];
        layers.push({ name: 'VLAN 802.1Q', fields: [[t('field.vlan'), vlanId]] });
        offset += 4;
      }
      protocol = ETHERTYPES[etherType] || `0x${etherType.toString(16)}`;
    } else if (packet.linkType === 101) {
      etherType = (bytes[0] >> 4) === 6 ? 0x86dd : 0x0800;
      protocol = ETHERTYPES[etherType];
    }

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

  return { ...packet, layers, source, destination, protocol, summary };
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
