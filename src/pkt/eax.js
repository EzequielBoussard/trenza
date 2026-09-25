import { t } from '../i18n.js';
import { Twofish } from './twofish.js';

const BLOCK_SIZE = 16;

function shiftLeftOne(block) {
  const shifted = new Uint8Array(BLOCK_SIZE);
  let carry = 0;
  for (let i = BLOCK_SIZE - 1; i >= 0; i--) {
    shifted[i] = ((block[i] << 1) | carry) & 0xff;
    carry = block[i] >>> 7;
  }
  if (carry) shifted[BLOCK_SIZE - 1] ^= 0x87;
  return shifted;
}

function cmacSubkeys(cipher) {
  const zero = new Uint8Array(BLOCK_SIZE);
  const l = cipher.encryptBlock(zero, new Uint8Array(BLOCK_SIZE));
  const k1 = shiftLeftOne(l);
  return [k1, shiftLeftOne(k1)];
}

function cmac(cipher, subkeys, message) {
  const [k1, k2] = subkeys;
  const state = new Uint8Array(BLOCK_SIZE);
  const scratch = new Uint8Array(BLOCK_SIZE);
  const complete = message.length > 0 && message.length % BLOCK_SIZE === 0;
  const fullBlocks = complete ? message.length / BLOCK_SIZE - 1 : Math.floor(message.length / BLOCK_SIZE);

  for (let block = 0; block < fullBlocks; block++) {
    const offset = block * BLOCK_SIZE;
    for (let i = 0; i < BLOCK_SIZE; i++) state[i] ^= message[offset + i];
    cipher.encryptBlock(state, scratch);
    state.set(scratch);
  }

  const tailOffset = fullBlocks * BLOCK_SIZE;
  const tailLength = message.length - tailOffset;
  const last = new Uint8Array(BLOCK_SIZE);
  last.set(message.subarray(tailOffset, tailOffset + tailLength));
  if (!complete) last[tailLength] = 0x80;
  const pad = complete ? k1 : k2;

  for (let i = 0; i < BLOCK_SIZE; i++) state[i] ^= last[i] ^ pad[i];
  cipher.encryptBlock(state, scratch);
  return scratch.slice();
}

// OMAC^t: CMAC del mensaje precedido por t codificado en un bloque big-endian.
function omac(cipher, subkeys, tag, message) {
  const prefixed = new Uint8Array(BLOCK_SIZE + message.length);
  prefixed[BLOCK_SIZE - 1] = tag;
  prefixed.set(message, BLOCK_SIZE);
  return cmac(cipher, subkeys, prefixed);
}

function incrementCounter(counter) {
  for (let i = BLOCK_SIZE - 1; i >= 0; i--) {
    if (++counter[i] !== 0x100) return;
    counter[i] = 0;
  }
}

function applyCtr(cipher, initialCounter, data) {
  const output = new Uint8Array(data.length);
  const counter = initialCounter.slice();
  const keystream = new Uint8Array(BLOCK_SIZE);
  for (let offset = 0; offset < data.length; offset += BLOCK_SIZE) {
    cipher.encryptBlock(counter, keystream);
    const span = Math.min(BLOCK_SIZE, data.length - offset);
    for (let i = 0; i < span; i++) output[offset + i] = data[offset + i] ^ keystream[i];
    incrementCounter(counter);
  }
  return output;
}

function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

// El tag va al final del mensaje, como lo deja Crypto++ (con lo que Packet Tracer cifra).
export function decryptTwofishEax(payload, key, nonce, { verifyTag = true } = {}) {
  if (payload.length < BLOCK_SIZE) {
    throw new Error(t('error.eaxShort'));
  }

  const cipher = new Twofish(key);
  const subkeys = cmacSubkeys(cipher);
  const ciphertext = payload.subarray(0, payload.length - BLOCK_SIZE);
  const tag = payload.subarray(payload.length - BLOCK_SIZE);

  const nonceMac = omac(cipher, subkeys, 0, nonce);
  const plaintext = applyCtr(cipher, nonceMac, ciphertext);

  if (verifyTag) {
    const headerMac = omac(cipher, subkeys, 1, new Uint8Array(0));
    const ciphertextMac = omac(cipher, subkeys, 2, ciphertext);
    const expected = new Uint8Array(BLOCK_SIZE);
    for (let i = 0; i < BLOCK_SIZE; i++) expected[i] = nonceMac[i] ^ headerMac[i] ^ ciphertextMac[i];
    if (!constantTimeEquals(expected, tag)) {
      throw new Error(t('error.eaxTag'));
    }
  }

  return plaintext;
}
