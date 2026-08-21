import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { setLanguage } from '../src/i18n.js';
import { decodePacketTracerFile } from '../src/pkt/decode.js';

// Los mensajes que se comparan abajo son los del idioma por defecto.
setLanguage('en');

// Construye un archivo con el formato anterior a Packet Tracer 6.2, que es el
// único que se puede generar sin implementar también el cifrado.
function buildLegacyFile(xml) {
  const payload = deflateSync(Buffer.from(xml, 'utf8'));
  const withHeader = Buffer.alloc(4 + payload.length);
  withHeader.writeUInt32BE(Buffer.byteLength(xml, 'utf8'), 0);
  payload.copy(withHeader, 4);

  const output = new Uint8Array(withHeader.length);
  for (let i = 0; i < withHeader.length; i++) {
    output[i] = withHeader[i] ^ ((withHeader.length - i) & 0xff);
  }
  return output;
}

test('lee un archivo con el formato heredado', async () => {
  const xml = '<PACKETTRACER5><VERSION>5.3.3</VERSION></PACKETTRACER5>';
  const decoded = await decodePacketTracerFile(buildLegacyFile(xml));

  assert.equal(decoded.variant, 'legacy');
  assert.equal(new TextDecoder().decode(decoded.xml), xml);
});

test('rechaza un archivo que no es de Packet Tracer', async () => {
  const noise = new Uint8Array(512).map((_, index) => (index * 37) % 256);
  await assert.rejects(decodePacketTracerFile(noise), /could not be decrypted/);
});

test('detecta un archivo truncado', async () => {
  const truncated = buildLegacyFile('<PACKETTRACER5/>').subarray(0, 3);
  await assert.rejects(decodePacketTracerFile(truncated), /could not be decrypted/);
});
