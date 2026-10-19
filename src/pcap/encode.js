import { csvBlob } from '../download.js';
import { t } from '../i18n.js';

const PCAP_MAGIC = 0xa1b2c3d4;
const SNAPLEN = 65535;

export function toCsv(packets, { origin }) {
  const headers = ['table.number', 'table.time', 'panel.packet', 'table.source', 'table.destination',
    'table.protocol', 'table.length', 'table.detail'].map((key) => t(key));
  headers[2] = t('csv.timestamp');

  const rows = packets.map((packet) => [
    packet.index,
    (packet.timestamp - origin).toFixed(6),
    new Date(packet.timestamp * 1000).toISOString(),
    packet.source,
    packet.destination,
    packet.protocol,
    packet.originalLength,
    packet.summary,
  ]);

  return csvBlob([headers, ...rows]);
}

// Pcap clásico: alcanza con un tipo de enlace por paquete.
export function toPcap(packets) {
  const linkType = packets.length > 0 ? packets[0].linkType : 1;
  const usable = packets.filter((packet) => packet.linkType === linkType);

  const total = 24 + usable.reduce((sum, packet) => sum + 16 + packet.bytes.length, 0);
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(0, PCAP_MAGIC, true);
  view.setUint16(4, 2, true);
  view.setUint16(6, 4, true);
  view.setUint32(16, SNAPLEN, true);
  view.setUint32(20, linkType, true);

  let offset = 24;
  for (const packet of usable) {
    const seconds = Math.floor(packet.timestamp);
    view.setUint32(offset, seconds, true);
    view.setUint32(offset + 4, Math.round((packet.timestamp - seconds) * 1e6), true);
    view.setUint32(offset + 8, packet.bytes.length, true);
    view.setUint32(offset + 12, packet.originalLength, true);
    bytes.set(packet.bytes, offset + 16);
    offset += 16 + packet.bytes.length;
  }

  return { blob: new Blob([buffer], { type: 'application/vnd.tcpdump.pcap' }), written: usable.length };
}
