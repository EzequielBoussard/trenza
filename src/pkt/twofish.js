const Q0_TABLES = [
  [0x8, 0x1, 0x7, 0xd, 0x6, 0xf, 0x3, 0x2, 0x0, 0xb, 0x5, 0x9, 0xe, 0xc, 0xa, 0x4],
  [0xe, 0xc, 0xb, 0x8, 0x1, 0x2, 0x3, 0x5, 0xf, 0x4, 0xa, 0x6, 0x7, 0x0, 0x9, 0xd],
  [0xb, 0xa, 0x5, 0xe, 0x6, 0xd, 0x9, 0x0, 0xc, 0x8, 0xf, 0x3, 0x2, 0x4, 0x7, 0x1],
  [0xd, 0x7, 0xf, 0x4, 0x1, 0x2, 0x6, 0xe, 0x9, 0xb, 0x3, 0x0, 0x8, 0x5, 0xc, 0xa],
];

const Q1_TABLES = [
  [0x2, 0x8, 0xb, 0xd, 0xf, 0x7, 0x6, 0xe, 0x3, 0x1, 0x9, 0x4, 0x0, 0xa, 0xc, 0x5],
  [0x1, 0xe, 0x2, 0xb, 0x4, 0xc, 0x3, 0x7, 0x6, 0xd, 0xa, 0x5, 0xf, 0x9, 0x0, 0x8],
  [0x4, 0xc, 0x7, 0x5, 0x1, 0x6, 0x9, 0xa, 0x0, 0xe, 0xd, 0x8, 0x2, 0xb, 0x3, 0xf],
  [0xb, 0x9, 0x5, 0x1, 0xc, 0x3, 0xd, 0xe, 0x6, 0x4, 0x7, 0xf, 0x2, 0x0, 0x8, 0xa],
];

const MDS_MATRIX = [
  [0x01, 0xef, 0x5b, 0x5b],
  [0x5b, 0xef, 0xef, 0x01],
  [0xef, 0x5b, 0x01, 0xef],
  [0xef, 0x01, 0xef, 0x5b],
];

const RS_MATRIX = [
  [0x01, 0xa4, 0x55, 0x87, 0x5a, 0x58, 0xdb, 0x9e],
  [0xa4, 0x56, 0x82, 0xf3, 0x1e, 0xc6, 0x68, 0xe5],
  [0x02, 0xa1, 0xfc, 0xc1, 0x47, 0xae, 0x3d, 0x19],
  [0xa4, 0x55, 0x87, 0x5a, 0x58, 0xdb, 0x9e, 0x03],
];

const MDS_POLY = 0x69;
const RS_POLY = 0x4d;
const RHO = 0x01010101;

function gfMultiply(a, b, poly) {
  let product = 0;
  while (b) {
    if (b & 1) product ^= a;
    const overflow = a & 0x80;
    a = (a << 1) & 0xff;
    if (overflow) a ^= poly;
    b >>= 1;
  }
  return product;
}

function buildPermutation(tables) {
  const ror4 = (x) => ((x >> 1) | (x << 3)) & 0xf;
  const q = new Uint8Array(256);
  for (let x = 0; x < 256; x++) {
    const a0 = x >> 4;
    const b0 = x & 0xf;
    const a1 = a0 ^ b0;
    const b1 = (a0 ^ ror4(b0) ^ (a0 << 3)) & 0xf;
    const a2 = tables[0][a1];
    const b2 = tables[1][b1];
    const a3 = a2 ^ b2;
    const b3 = (a2 ^ ror4(b2) ^ (a2 << 3)) & 0xf;
    q[x] = (tables[3][b3] << 4) | tables[2][a3];
  }
  return q;
}

const Q0 = buildPermutation(Q0_TABLES);
const Q1 = buildPermutation(Q1_TABLES);

// Una tabla por columna de MDS: el producto matriz-vector se reduce a XOR de cuatro lecturas.
const MDS_TABLES = (() => {
  const tables = [];
  for (let column = 0; column < 4; column++) {
    const table = new Int32Array(256);
    for (let value = 0; value < 256; value++) {
      let word = 0;
      for (let row = 0; row < 4; row++) {
        word |= gfMultiply(MDS_MATRIX[row][column], value, MDS_POLY) << (row * 8);
      }
      table[value] = word;
    }
    tables.push(table);
  }
  return tables;
})();

const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;
const readWordLE = (bytes, offset) =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

function mds(y0, y1, y2, y3) {
  return (MDS_TABLES[0][y0] ^ MDS_TABLES[1][y1] ^ MDS_TABLES[2][y2] ^ MDS_TABLES[3][y3]) >>> 0;
}

// Función h del cifrador: capas de permutación mezcladas con las palabras de clave, luego MDS.
function h(x, keyWords) {
  const k = keyWords.length;
  let y0 = x & 0xff;
  let y1 = (x >>> 8) & 0xff;
  let y2 = (x >>> 16) & 0xff;
  let y3 = (x >>> 24) & 0xff;

  if (k === 4) {
    const l = keyWords[3];
    y0 = Q1[y0] ^ (l & 0xff);
    y1 = Q0[y1] ^ ((l >>> 8) & 0xff);
    y2 = Q0[y2] ^ ((l >>> 16) & 0xff);
    y3 = Q1[y3] ^ ((l >>> 24) & 0xff);
  }
  if (k >= 3) {
    const l = keyWords[2];
    y0 = Q1[y0] ^ (l & 0xff);
    y1 = Q1[y1] ^ ((l >>> 8) & 0xff);
    y2 = Q0[y2] ^ ((l >>> 16) & 0xff);
    y3 = Q0[y3] ^ ((l >>> 24) & 0xff);
  }

  const l1 = keyWords[1];
  const l0 = keyWords[0];
  y0 = Q1[Q0[Q0[y0] ^ (l1 & 0xff)] ^ (l0 & 0xff)];
  y1 = Q0[Q0[Q1[y1] ^ ((l1 >>> 8) & 0xff)] ^ ((l0 >>> 8) & 0xff)];
  y2 = Q1[Q1[Q0[y2] ^ ((l1 >>> 16) & 0xff)] ^ ((l0 >>> 16) & 0xff)];
  y3 = Q0[Q1[Q1[y3] ^ ((l1 >>> 24) & 0xff)] ^ ((l0 >>> 24) & 0xff)];

  return mds(y0, y1, y2, y3);
}

function reedSolomonWord(key, offset) {
  let word = 0;
  for (let row = 0; row < 4; row++) {
    let byte = 0;
    for (let column = 0; column < 8; column++) {
      byte ^= gfMultiply(RS_MATRIX[row][column], key[offset + column], RS_POLY);
    }
    word |= byte << (row * 8);
  }
  return word >>> 0;
}

// Sólo cifra bloques: EAX descifra con CTR, que no usa la operación inversa.
export class Twofish {
  constructor(key) {
    if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
      throw new Error(`Longitud de clave Twofish inválida: ${key.length}`);
    }

    const k = key.length / 8;
    const even = [];
    const odd = [];
    for (let i = 0; i < k; i++) {
      even.push(readWordLE(key, i * 8));
      odd.push(readWordLE(key, i * 8 + 4));
    }

    this.subkeys = new Int32Array(40);
    for (let i = 0; i < 20; i++) {
      const a = h(Math.imul(2 * i, RHO) >>> 0, even);
      const b = rotl(h(Math.imul(2 * i + 1, RHO) >>> 0, odd), 8);
      this.subkeys[2 * i] = (a + b) >>> 0;
      this.subkeys[2 * i + 1] = rotl((a + 2 * b) >>> 0, 9);
    }

    // Las palabras Reed-Solomon se usan en orden inverso al derivarlas de la clave.
    this.sboxKey = [];
    for (let i = k - 1; i >= 0; i--) {
      this.sboxKey.push(reedSolomonWord(key, i * 8));
    }
  }

  encryptBlock(input, output) {
    const s = this.sboxKey;
    const k = this.subkeys;

    let r0 = (readWordLE(input, 0) ^ k[0]) >>> 0;
    let r1 = (readWordLE(input, 4) ^ k[1]) >>> 0;
    let r2 = (readWordLE(input, 8) ^ k[2]) >>> 0;
    let r3 = (readWordLE(input, 12) ^ k[3]) >>> 0;

    for (let round = 0; round < 16; round++) {
      const t0 = h(r0, s);
      const t1 = h(rotl(r1, 8), s);
      const f0 = (t0 + t1 + k[2 * round + 8]) >>> 0;
      const f1 = (t0 + 2 * t1 + k[2 * round + 9]) >>> 0;
      const next2 = rotr((r2 ^ f0) >>> 0, 1);
      const next3 = (rotl(r3, 1) ^ f1) >>> 0;
      r2 = r0;
      r3 = r1;
      r0 = next2;
      r1 = next3;
    }

    const c = [(r2 ^ k[4]) >>> 0, (r3 ^ k[5]) >>> 0, (r0 ^ k[6]) >>> 0, (r1 ^ k[7]) >>> 0];
    for (let i = 0; i < 4; i++) {
      output[i * 4] = c[i] & 0xff;
      output[i * 4 + 1] = (c[i] >>> 8) & 0xff;
      output[i * 4 + 2] = (c[i] >>> 16) & 0xff;
      output[i * 4 + 3] = (c[i] >>> 24) & 0xff;
    }
    return output;
  }
}
