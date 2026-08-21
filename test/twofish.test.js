import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Twofish } from '../src/pkt/twofish.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex').toUpperCase();
const bytes = (hexString) => Uint8Array.from(Buffer.from(hexString, 'hex'));

// Vectores del apéndice del paper de Twofish (ECB, un solo bloque).
const VECTORS = [
  { key: '00000000000000000000000000000000', plain: '00000000000000000000000000000000', cipher: '9F589F5CF6122C32B6BFEC2F2AE8C35A' },
  { key: '0123456789ABCDEFFEDCBA98765432100011223344556677', plain: '00000000000000000000000000000000', cipher: 'CFD1D2E5A9BE9CDF501F13B892BD2248' },
  { key: '0123456789ABCDEFFEDCBA987654321000112233445566778899AABBCCDDEEFF', plain: '00000000000000000000000000000000', cipher: '37527BE0052334B89F0CFCCAE87CFA20' },
];

test('vectores conocidos de Twofish', () => {
  for (const vector of VECTORS) {
    const cipher = new Twofish(bytes(vector.key));
    const output = new Uint8Array(16);
    cipher.encryptBlock(bytes(vector.plain), output);
    assert.equal(hex(output), vector.cipher);
  }
});
