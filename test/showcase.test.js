import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePacketTracerFile } from '../src/pkt/decode.js';
import { decodeCapture } from '../src/pcap/decode.js';
import { dissectPacket } from '../src/pcap/dissect.js';

const showcase = (name) => new Uint8Array(readFileSync(new URL(`../showcase/${name}`, import.meta.url)));

// Es el único archivo real cifrado de las pruebas: el resto usa el formato heredado.
test('descifra la red de ejemplo', async () => {
  const { xml, variant } = await decodePacketTracerFile(showcase('red-supermercado-2023.pkt'));
  const text = new TextDecoder().decode(xml);

  assert.equal(variant, 'modern');
  assert.match(text, /<VERSION>7\.3\.1/);
  // 71 equipos y una regleta, que el visor esconde como infraestructura.
  assert.equal(text.match(/<DEVICE>/g).length, 72);
});

test('la captura de ejemplo se lee entera', () => {
  const capture = decodeCapture(showcase('captura-ejemplo.pcap'));
  const protocols = new Set(capture.packets.map((packet) => dissectPacket(packet).protocol));

  assert.equal(capture.truncated, 0);
  assert.equal(capture.packets.length, 30);
  assert.deepEqual([...protocols].sort(), ['ARP', 'DHCP', 'DNS', 'HTTP', 'ICMP', 'NTP']);
});
