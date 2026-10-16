import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, deflateSync } from 'node:zlib';
import { setLanguage } from '../src/i18n.js';
import { decodePacketTracerFile } from '../src/pkt/decode.js';
import { locationOf, withoutUnread } from '../src/pkt/model.js';

// Los mensajes que se comparan abajo son los del idioma por defecto.
setLanguage('en');

// El formato heredado no lleva Twofish: se puede generar acá.
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

// Un ZIP mínimo con una sola entrada comprimida, como el .pkz que guarda Packet Tracer.
function buildPackage(name, content) {
  const data = deflateRawSync(content);
  const fileName = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  const directoryStart = local.length + fileName.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(directoryStart, 16);
  return new Uint8Array(Buffer.concat([local, fileName, data, central, fileName, end]));
}

test('abre un paquete .pkz', async () => {
  const xml = '<PACKETTRACER5><VERSION>8.1.0</VERSION></PACKETTRACER5>';
  const decoded = await decodePacketTracerFile(buildPackage('red.pkt', buildLegacyFile(xml)));
  assert.equal(new TextDecoder().decode(decoded.xml), xml);
});

test('un .pkz sin .pkt adentro lo dice', async () => {
  await assert.rejects(decodePacketTracerFile(buildPackage('foto.png', new Uint8Array(40))), /does not contain/);
});

test('rechaza un archivo que no es de Packet Tracer', async () => {
  const noise = new Uint8Array(512).map((_, index) => (index * 37) % 256);
  await assert.rejects(decodePacketTracerFile(noise), /not a Packet Tracer/);
});

test('detecta un archivo truncado', async () => {
  const truncated = buildLegacyFile('<PACKETTRACER5/>').subarray(0, 3);
  await assert.rejects(decodePacketTracerFile(truncated), /not a Packet Tracer/);
});

test('la ubicación física nombra lo que hay entre Intercity y el equipo', () => {
  const places = new Map([
    ['{a}', { type: '0', name: 'Intercity' }],
    ['{b}', { type: '1', name: 'Montevideo' }],
    ['{c}', { type: '2', name: 'Sede' }],
    ['{d}', { type: '4', name: 'Rack' }],
    ['{e}', { type: '6', name: 'R1' }],
  ]);
  assert.deepEqual(locationOf('{a},{b},{c},{d},{e}', places), ['Montevideo', 'Sede', 'Rack']);
  assert.deepEqual(locationOf('', places), []);
});

test('antes de armar el árbol se sacan las partes que el visor no lee', () => {
  const xml = '<PACKETTRACER5><NETWORK><DEVICE><ENGINE><NAME>R1</NAME>'
    + '<FILE_MANAGER><FILE><FILE_MANAGER>anidado</FILE_MANAGER></FILE></FILE_MANAGER>'
    + '<THING_MODEL/><PORT><IP>10.0.0.1</IP></PORT></ENGINE></DEVICE></NETWORK>'
    + '<PHYSICALWORKSPACE><ENVIRONMENT id="1"><THING_MODEL>x</THING_MODEL></ENVIRONMENT>'
    + '<ENVIRONMENT_OPTIONS>sigue</ENVIRONMENT_OPTIONS></PHYSICALWORKSPACE></PACKETTRACER5>';

  assert.equal(withoutUnread(xml), '<PACKETTRACER5><NETWORK><DEVICE><ENGINE><NAME>R1</NAME>'
    + '<THING_MODEL/><PORT><IP>10.0.0.1</IP></PORT></ENGINE></DEVICE></NETWORK>'
    + '<PHYSICALWORKSPACE><ENVIRONMENT_OPTIONS>sigue</ENVIRONMENT_OPTIONS></PHYSICALWORKSPACE></PACKETTRACER5>');

  // Si algo no cierra, el texto vuelve entero para que el parser dé el error.
  const broken = '<A><FILE_MANAGER><FILE_MANAGER></FILE_MANAGER></A>';
  assert.equal(withoutUnread(broken), broken);
});
