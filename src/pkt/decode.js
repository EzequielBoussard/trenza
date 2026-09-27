import { t } from '../i18n.js';
import { decryptTwofishEax } from './eax.js';

const FILE_KEY = new Uint8Array(16).fill(137);
const FILE_NONCE = new Uint8Array(16).fill(16);

async function inflate(data, format = 'deflate') {
  try {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    // El navegador reporta el error de zlib como error de red ("Failed to fetch").
    throw new Error(t('error.inflate'));
  }
}

// Packet Tracer antepone el tamaño descomprimido en 4 bytes big-endian.
async function inflateWithSizeHeader(data) {
  if (data.length < 5) throw new Error(t('error.truncated'));
  const expected = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
  const inflated = await inflate(data.subarray(4));
  if (expected >>> 0 !== inflated.length) {
    throw new Error(t('error.size', { actual: inflated.length, expected: expected >>> 0 }));
  }
  return inflated;
}

// Capa exterior: archivo invertido y XOR con un valor que depende de la posición y el
// largo. Se trunca a 8 bits, así que el desborde de 32 bits del original no importa.
function deobfuscateOuter(input) {
  const length = input.length;
  const output = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    output[i] = input[length - 1 - i] ^ (Math.imul(length, 1 - i) & 0xff);
  }
  return output;
}

// Capa interior, sobre el texto ya descifrado.
function deobfuscateInner(input) {
  const length = input.length;
  const output = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    output[i] = input[i] ^ ((length - i) & 0xff);
  }
  return output;
}

async function decodeModern(bytes) {
  const obfuscated = deobfuscateOuter(bytes);
  const decrypted = decryptTwofishEax(obfuscated, FILE_KEY, FILE_NONCE);
  return inflateWithSizeHeader(deobfuscateInner(decrypted));
}

// El formato más viejo no lleva la capa de cifrado. Un archivo de 5.3.3 ya viene cifrado.
async function decodeLegacy(bytes) {
  return inflateWithSizeHeader(deobfuscateInner(bytes));
}

const isPackage = (bytes) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;

// Un .pkz es un ZIP con el .pkt adentro, más los archivos que la red tenga incrustados.
// Se busca la primera entrada .pkt o .pka en el directorio central.
async function unpackPackage(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error(t('error.package'));

  let at = view.getUint32(end + 16, true);
  for (let entry = view.getUint16(end + 10, true); entry > 0; entry--) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));

    if (/\.pk[ta]$/i.test(name) && (method === 0 || method === 8)) {
      const local = view.getUint32(at + 42, true);
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      return method === 0 ? data : inflate(data, 'deflate-raw');
    }
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  throw new Error(t('error.package'));
}

export async function decodePacketTracerFile(input) {
  const bytes = isPackage(input) ? await unpackPackage(input) : input;
  const attempts = [
    { variant: 'modern', decode: decodeModern },
    { variant: 'legacy', decode: decodeLegacy },
  ];

  const failures = [];
  for (const attempt of attempts) {
    try {
      const xml = await attempt.decode(bytes);
      return { xml, variant: attempt.variant };
    } catch (error) {
      failures.push(`${attempt.variant}: ${error.message}`);
    }
  }

  console.warn('Trenza:', failures.join(' | '));
  throw new Error(t('error.decrypt'));
}
