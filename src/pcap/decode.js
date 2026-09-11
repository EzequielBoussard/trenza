import { t } from '../i18n.js';

const PCAP_MAGICS = {
  0xa1b2c3d4: { littleEndian: false, precision: 1e6 },
  0xd4c3b2a1: { littleEndian: true, precision: 1e6 },
  0xa1b23c4d: { littleEndian: false, precision: 1e9 },
  0x4d3cb2a1: { littleEndian: true, precision: 1e9 },
};

const PCAPNG_SECTION_HEADER = 0x0a0d0d0a;
const PCAPNG_INTERFACE_DESCRIPTION = 0x00000001;
const PCAPNG_SIMPLE_PACKET = 0x00000003;
const PCAPNG_ENHANCED_PACKET = 0x00000006;

function readPcap(view, bytes) {
  const magic = view.getUint32(0, false);
  const format = PCAP_MAGICS[magic];
  const little = format.littleEndian;
  const linkType = view.getUint32(20, little);

  const packets = [];
  let offset = 24;
  while (offset + 16 <= bytes.length) {
    const seconds = view.getUint32(offset, little);
    const fraction = view.getUint32(offset + 4, little);
    const capturedLength = view.getUint32(offset + 8, little);
    const originalLength = view.getUint32(offset + 12, little);
    offset += 16;
    if (capturedLength > bytes.length - offset) break;

    packets.push({
      index: packets.length + 1,
      timestamp: seconds + fraction / format.precision,
      capturedLength,
      originalLength,
      linkType,
      bytes: bytes.subarray(offset, offset + capturedLength),
    });
    offset += capturedLength;
  }

  // Lo que sobra al final es un registro que quedó a medias: la captura se cortó. Sin
  // guardarlo, un archivo truncado justo después de la cabecera dice «0 paquetes» y
  // parece que el visor no supo leerlo.
  return { container: 'pcap', linkType, packets, truncated: bytes.length - offset };
}

function readOptionTimestampResolution(view, bytes, start, end, little) {
  let offset = start;
  while (offset + 4 <= end) {
    const code = view.getUint16(offset, little);
    const length = view.getUint16(offset + 2, little);
    if (code === 0) break;
    if (code === 9 && length >= 1) return bytes[offset + 4];
    offset += 4 + length + ((4 - (length % 4)) % 4);
  }
  return 6;
}

function readPcapng(view, bytes) {
  let little = view.getUint32(8, false) !== 0x1a2b3c4d;
  let interfaces = [];
  let firstLinkType = null;
  const packets = [];
  let offset = 0;

  while (offset + 12 <= bytes.length) {
    const blockType = view.getUint32(offset, little);

    // Un pcapng puede ser la concatenación de varias capturas, y cada sección abre con su
    // propia cabecera: la numeración de interfaces vuelve a empezar y el orden de bytes
    // puede ser otro. Sin reiniciar la lista, un paquete de la segunda sección se lee con
    // el tipo de enlace y la resolución de tiempo de la primera.
    if (blockType === PCAPNG_SECTION_HEADER) {
      little = view.getUint32(offset + 8, false) !== 0x1a2b3c4d;
      interfaces = [];
    }

    const blockLength = view.getUint32(offset + 4, little);
    if (blockLength < 12 || offset + blockLength > bytes.length) break;
    const body = offset + 8;

    if (blockType === PCAPNG_INTERFACE_DESCRIPTION) {
      if (firstLinkType === null) firstLinkType = view.getUint16(body, little);
      interfaces.push({
        linkType: view.getUint16(body, little),
        resolution: readOptionTimestampResolution(view, bytes, body + 8, offset + blockLength - 4, little),
      });
    } else if (blockType === PCAPNG_ENHANCED_PACKET) {
      const interfaceId = view.getUint32(body, little);
      const high = view.getUint32(body + 4, little);
      const low = view.getUint32(body + 8, little);
      const capturedLength = view.getUint32(body + 12, little);
      const originalLength = view.getUint32(body + 16, little);
      const descriptor = interfaces[interfaceId] || { linkType: 1, resolution: 6 };
      const divisor = descriptor.resolution & 0x80
        ? 2 ** (descriptor.resolution & 0x7f)
        : 10 ** descriptor.resolution;

      packets.push({
        index: packets.length + 1,
        timestamp: (high * 2 ** 32 + low) / divisor,
        capturedLength,
        originalLength,
        linkType: descriptor.linkType,
        bytes: bytes.subarray(body + 20, body + 20 + capturedLength),
      });
    } else if (blockType === PCAPNG_SIMPLE_PACKET) {
      const originalLength = view.getUint32(body, little);
      const descriptor = interfaces[0] || { linkType: 1 };
      const capturedLength = Math.min(originalLength, blockLength - 16);
      packets.push({
        index: packets.length + 1,
        timestamp: 0,
        capturedLength,
        originalLength,
        linkType: descriptor.linkType,
        bytes: bytes.subarray(body + 4, body + 4 + capturedLength),
      });
    }

    offset += blockLength;
  }

  return {
    container: 'pcapng',
    linkType: firstLinkType ?? 1,
    packets,
    truncated: bytes.length - offset,
  };
}

/** Lee una captura en formato pcap clásico o pcapng y devuelve sus paquetes crudos. */
export function decodeCapture(bytes) {
  if (bytes.length < 24) throw new Error(t('error.captureShort'));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, false);

  if (magic === PCAPNG_SECTION_HEADER) return readPcapng(view, bytes);
  if (PCAP_MAGICS[magic]) return readPcap(view, bytes);

  throw new Error(t('error.captureMagic'));
}
