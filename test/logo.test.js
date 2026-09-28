import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strandPath } from '../src/logo.js';

const strands = (name) => [...readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
  .matchAll(/<path[^>]* d="([^"]+)"/g)].map((match) => match[1]);

test('el encabezado dibuja la misma trenza que el favicon', () => {
  const logo = strands('logo.svg');
  assert.equal(logo.length, 2);
  assert.deepEqual(strands('favicon.svg'), logo);
  assert.deepEqual(strands('index.html').slice(0, 2), logo);
});

// Los mismos hilos de logo.svg, escritos en coordenadas absolutas.
test('la vuelta de la trenza arranca y termina en el logo', () => {
  const orange = 'M136 168C196 168 196 344 256 344C316 344 316 168 376 168';
  const blue = 'M136 344C196 344 196 168 256 168C316 168 316 344 376 344';

  assert.equal(strandPath(0, true), orange);
  assert.equal(strandPath(0, false), blue);
  assert.equal(strandPath(1, true), blue);
  assert.equal(strandPath(2, true), orange);
});
