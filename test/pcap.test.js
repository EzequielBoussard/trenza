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

function buildCapture(frames) {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(0xa1b2c3d4, 0);
  header.writeUInt16LE(2, 4);
  header.writeUInt16LE(4, 6);
  header.writeUInt32LE(65535, 16);
  header.writeUInt32LE(1, 20);

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

test('sobrevive a un paquete truncado', () => {
  const capture = decodeCapture(buildCapture([Buffer.from([0x00, 0x01, 0x02])]));
  const packet = dissectPacket(capture.packets[0]);
  assert.equal(packet.layers.length, 0);
});
