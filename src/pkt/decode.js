import { t } from '../i18n.js';
import { decryptTwofishEax } from './eax.js';

const FILE_KEY = new Uint8Array(16).fill(137);
const FILE_NONCE = new Uint8Array(16).fill(16);

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  try {
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

// Los archivos anteriores a Packet Tracer 6.2 no llevan capa de cifrado.
async function decodeLegacy(bytes) {
  return inflateWithSizeHeader(deobfuscateInner(bytes));
}

export async function decodePacketTracerFile(bytes) {
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
