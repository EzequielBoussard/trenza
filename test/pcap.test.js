import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLanguage } from '../src/i18n.js';
import { decodeCapture } from '../src/pcap/decode.js';
import { dissectPacket } from '../src/pcap/dissect.js';

// Los mensajes que se comparan abajo son los del idioma por defecto.
setLanguage('en');

function ethernet(destination, source, etherType) {
  const header = Buffer.alloc(14);
  Buffer.from(destination).copy(header, 0);
  Buffer.from(source).copy(header, 6);
  header.writeUInt16BE(etherType, 12);
  return header;
}

function ipv4(protocol, source, destination, payload) {
  const header = Buffer.alloc(20);
  header[0] = 0x45;
  header.writeUInt16BE(20 + payload.length, 2);
  header[8] = 64;
  header[9] = protocol;
  Buffer.from(source.split('.').map(Number)).copy(header, 12);
  Buffer.from(destination.split('.').map(Number)).copy(header, 16);
  return Buffer.concat([header, payload]);
}

function buildCapture(frames, linkType = 1) {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(0xa1b2c3d4, 0);
  header.writeUInt16LE(2, 4);
  header.writeUInt16LE(4, 6);
  header.writeUInt32LE(65535, 16);
  header.writeUInt32LE(linkType, 20);

  const parts = [header];
  frames.forEach((frame, index) => {
    const record = Buffer.alloc(16);
    record.writeUInt32LE(1700000000 + index, 0);
    record.writeUInt32LE(index * 250000, 4);
    record.writeUInt32LE(frame.length, 8);
    record.writeUInt32LE(frame.length, 12);
    parts.push(record, frame);
  });
  return new Uint8Array(Buffer.concat(parts));
}

/** Un bloque de pcapng: tipo, largo total, cuerpo con relleno a cuatro, y el largo otra vez. */
function block(type, body) {
  const padding = (4 - (body.length % 4)) % 4;
  const total = 12 + body.length + padding;
  const head = Buffer.alloc(8);
  head.writeUInt32LE(type, 0);
  head.writeUInt32LE(total, 4);

  const tail = Buffer.alloc(4);
  tail.writeUInt32LE(total, 0);
  return Buffer.concat([head, body, Buffer.alloc(padding), tail]);
}

function sectionHeader() {
  const body = Buffer.alloc(16);
  body.writeUInt32LE(0x1a2b3c4d, 0);
  body.writeUInt16LE(1, 4);
  body.writeBigInt64LE(-1n, 8);
  return block(0x0a0d0d0a, body);
}

function interfaceDescription(linkType) {
  const body = Buffer.alloc(8);
  body.writeUInt16LE(linkType, 0);
  body.writeUInt32LE(65535, 4);
  return block(0x00000001, body);
}

function enhancedPacket(interfaceId, frame) {
  const head = Buffer.alloc(20);
  head.writeUInt32LE(interfaceId, 0);
  head.writeUInt32LE(frame.length, 12);
  head.writeUInt32LE(frame.length, 16);
  return block(0x00000006, Buffer.concat([head, frame]));
}

const MAC_CLIENT = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05];
const MAC_ROUTER = [0x00, 0xaa, 0xbb, 0xcc, 0xdd, 0xee];

test('lee una captura pcap y disecta TCP sobre IPv4', () => {
  const tcp = Buffer.alloc(20);
  tcp.writeUInt16BE(51000, 0);
  tcp.writeUInt16BE(443, 2);
  tcp[12] = 0x50;
  tcp[13] = 0x02;

  const capture = decodeCapture(buildCapture([
    Buffer.concat([ethernet(MAC_ROUTER, MAC_CLIENT, 0x0800), ipv4(6, '192.168.1.10', '93.184.216.34', tcp)]),
  ]));

  assert.equal(capture.container, 'pcap');
  assert.equal(capture.packets.length, 1);

  const packet = dissectPacket(capture.packets[0]);
  assert.equal(packet.source, '192.168.1.10');
  assert.equal(packet.destination, '93.184.216.34');
  assert.equal(packet.protocol, 'HTTPS');
  assert.deepEqual(packet.layers.map((layer) => layer.name), ['Ethernet', 'IPv4', 'TCP']);
  assert.match(packet.summary, /SYN/);
});

test('marca el tiempo relativo entre paquetes', () => {
  const frame = Buffer.concat([ethernet(MAC_ROUTER, MAC_CLIENT, 0x0800), ipv4(1, '10.0.0.1', '10.0.0.2', Buffer.alloc(8))]);
  const capture = decodeCapture(buildCapture([frame, frame]));

  const delta = capture.packets[1].timestamp - capture.packets[0].timestamp;
  assert.ok(Math.abs(delta - 1.25) < 1e-6, `diferencia inesperada: ${delta}`);
});

test('no acepta archivos con otra firma', () => {
  assert.throws(() => decodeCapture(new Uint8Array(64)), /neither pcap nor pcapng/);
});

test('los campos de cada capa se arman recién cuando se piden', () => {
  const tcp = Buffer.alloc(20);
  tcp[12] = 0x50;
  const capture = decodeCapture(buildCapture([
    Buffer.concat([ethernet(MAC_ROUTER, MAC_CLIENT, 0x0800), ipv4(6, '10.0.0.1', '10.0.0.2', tcp)]),
  ]));

  const [ethernetLayer] = dissectPacket(capture.packets[0]).layers;
  assert.equal(typeof ethernetLayer.fields, 'function', 'los campos se armaron de entrada');

  // Las MAC siguen estando, sólo que se formatean al pedirlas: en una captura grande son
  // dos cadenas por paquete que nadie mira.
  const fields = new Map(ethernetLayer.fields());
  assert.equal(fields.get('Source MAC'), '00:01:02:03:04:05');
  assert.equal(fields.get('Destination MAC'), '00:aa:bb:cc:dd:ee');
});

test('sin capa de red, el origen y el destino son las MAC', () => {
  const capture = decodeCapture(buildCapture([
    Buffer.concat([ethernet(MAC_ROUTER, MAC_CLIENT, 0x8899), Buffer.alloc(4)]),
  ]));

  const packet = dissectPacket(capture.packets[0]);
  assert.equal(packet.source, '00:01:02:03:04:05');
  assert.equal(packet.destination, '00:aa:bb:cc:dd:ee');
  assert.equal(packet.protocol, '0x8899');
  assert.match(packet.summary, /not dissected/);
});

test('una captura entera no se declara cortada, y una cortada sí', () => {
  const frame = Buffer.concat([ethernet(MAC_ROUTER, MAC_CLIENT, 0x0800), ipv4(1, '10.0.0.1', '10.0.0.2', Buffer.alloc(8))]);
  const entera = buildCapture([frame, frame]);

  assert.equal(decodeCapture(entera).truncated, 0);

  const cortada = decodeCapture(entera.slice(0, entera.length - 12));
  assert.equal(cortada.packets.length, 1, 'el paquete entero se pierde');
  assert.ok(cortada.truncated > 0, 'el corte no se detectó');
});

test('sobrevive a un paquete truncado', () => {
  const capture = decodeCapture(buildCapture([Buffer.from([0x00, 0x01, 0x02])]));
  const packet = dissectPacket(capture.packets[0]);
  assert.equal(packet.layers.length, 0);
});

test('cada sección de un pcapng trae sus propias interfaces', () => {
  // Un pcapng puede ser la concatenación de dos capturas distintas. La segunda vuelve a
  // numerar sus interfaces desde cero: si se siguiera usando la lista de la primera, este
  // paquete se leería como Ethernet y el desglose saldría corrido.
  const ethernetFrame = Buffer.concat([
    ethernet(MAC_ROUTER, MAC_CLIENT, 0x0800),
    ipv4(1, '10.0.0.1', '10.0.0.2', Buffer.alloc(8)),
  ]);
  const rawFrame = ipv4(1, '172.16.0.1', '172.16.0.2', Buffer.alloc(8));

  const capture = decodeCapture(new Uint8Array(Buffer.concat([
    sectionHeader(), interfaceDescription(1), enhancedPacket(0, ethernetFrame),
    sectionHeader(), interfaceDescription(101), enhancedPacket(0, rawFrame),
  ])));

  assert.equal(capture.container, 'pcapng');
  assert.equal(capture.truncated, 0);
  assert.deepEqual(capture.packets.map((packet) => packet.linkType), [1, 101]);

  const [primero, segundo] = capture.packets.map(dissectPacket);
  assert.deepEqual(primero.layers.map((layer) => layer.name), ['Ethernet', 'IPv4', 'ICMP']);
  assert.deepEqual(segundo.layers.map((layer) => layer.name), ['IPv4', 'ICMP']);
  assert.equal(segundo.source, '172.16.0.1');
});

test('lee el encabezado que pone Linux al capturar de todas las interfaces', () => {
  const cooked = Buffer.alloc(16);
  cooked.writeUInt16BE(0x0800, 14);
  const capture = decodeCapture(buildCapture([
    Buffer.concat([cooked, ipv4(1, '10.1.1.1', '10.1.1.2', Buffer.alloc(8))]),
  ], 113));

  const packet = dissectPacket(capture.packets[0]);
  assert.deepEqual(packet.layers.map((layer) => layer.name), ['Linux cooked', 'IPv4', 'ICMP']);
  assert.equal(packet.source, '10.1.1.1');
});

test('lee un enlace serie con encapsulado Cisco HDLC', () => {
  const hdlc = Buffer.from([0x0f, 0x00, 0x08, 0x00]);
  const capture = decodeCapture(buildCapture([
    Buffer.concat([hdlc, ipv4(1, '192.168.3.1', '192.168.3.2', Buffer.alloc(8))]),
  ], 104));

  const packet = dissectPacket(capture.packets[0]);
  assert.deepEqual(packet.layers.map((layer) => layer.name), ['Cisco HDLC', 'IPv4', 'ICMP']);
  assert.equal(packet.destination, '192.168.3.2');
});

test('el bucle local de BSD se resuelve por la versión del paquete, no por la familia', () => {
  const capture = decodeCapture(buildCapture([
    Buffer.concat([Buffer.from([2, 0, 0, 0]), ipv4(1, '127.0.0.1', '127.0.0.1', Buffer.alloc(8))]),
  ], 0));

  const packet = dissectPacket(capture.packets[0]);
  assert.deepEqual(packet.layers.map((layer) => layer.name), ['Loopback', 'IPv4', 'ICMP']);
});

test('un enlace que el visor no sabe leer se nombra en vez de quedar en blanco', () => {
  const capture = decodeCapture(buildCapture([Buffer.alloc(32)], 195));
  const packet = dissectPacket(capture.packets[0]);

  assert.equal(packet.layers.length, 0);
  assert.equal(packet.protocol, 'Link type 195');
  assert.match(packet.summary, /not dissected/);
});
