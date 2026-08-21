import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestExportName } from '../src/view/export.js';
import { frameForNetwork, measureBounds, planLabels, projectIntoRect, spreadScaleFor, threadFor } from '../src/view/graph.js';

const INSETS = { left: 120, right: 120, top: 150, bottom: 130 };

test('propone el nombre del archivo abierto, sin extensión', () => {
  assert.equal(suggestExportName('Entrega Redes Ansian.pkt'), 'Entrega Redes Ansian');
  assert.equal(suggestExportName('lab/final.pka'), 'lab-final');
  assert.equal(suggestExportName(''), 'red');
});

test('el encuadre cubre la red entera y conserva la proporción', () => {
  const devices = [
    { id: 'a', x: 100, y: 100 },
    { id: 'b', x: 1100, y: 600 },
    { id: 'c', x: 600, y: 350 },
  ];

  const bounds = measureBounds(devices);
  assert.equal(bounds.spanX, 1000);
  assert.equal(bounds.spanY, 500);

  const frame = frameForNetwork(devices, INSETS, 1);
  const positions = projectIntoRect(devices, frame.content);

  // Todo dispositivo cae dentro del área de contenido, así que sus etiquetas caben
  // en el margen reservado y ninguna queda cortada contra el borde del lienzo.
  for (const device of devices) {
    const { x, y } = positions.get(device.id);
    assert.ok(x >= INSETS.left && x <= frame.width - INSETS.right, `x fuera del área: ${x}`);
    assert.ok(y >= INSETS.top && y <= frame.height - INSETS.bottom, `y fuera del área: ${y}`);
  }

  const a = positions.get('a');
  const b = positions.get('b');
  assert.ok(Math.abs((b.x - a.x) / (b.y - a.y) - 2) < 1e-6, 'la proporción original no se conservó');
});

test('el color del enlace sale del cableado y, si falta, del medio', () => {
  assert.equal(threadFor({ wiring: 'eCrossOver', media: 'eCopper' }), 'green');
  assert.equal(threadFor({ wiring: '', media: 'eFiber' }), 'blue');
  assert.equal(threadFor({ wiring: '', media: '' }), 'neutral');
});
