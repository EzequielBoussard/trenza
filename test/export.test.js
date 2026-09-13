import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestExportName } from '../src/view/export.js';
import {
  LABEL_TYPE,
  LAYOUT_STRETCH,
  frameForNetwork,
  measureBounds,
  planLabels,
  projectIntoRect,
  threadFor,
} from '../src/view/graph.js';

const INSETS = { left: 120, right: 120, top: 150, bottom: 130 };

test('propone el nombre del archivo abierto, sin extensión', () => {
  assert.equal(suggestExportName('red-supermercado-2023.pkt'), 'red-supermercado-2023');
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

test('el bloque de etiqueta se corre entero y nunca se deja de dibujar', () => {
  // Dos dispositivos casi encimados: el segundo no puede usar el renglón del primero.
  const devices = [
    { id: 'a', name: 'Switch', interfaces: [{ addresses: [{ address: '192.168.1.1' }] }] },
    { id: 'b', name: 'PC', interfaces: [{ addresses: [{ address: '192.168.1.2' }] }] },
  ];
  const positions = new Map([['a', { x: 100, y: 100 }], ['b', { x: 110, y: 108 }]]);
  const measure = { nameWidth: (text) => text.length * 8, addressWidth: (text) => text.length * 7 };

  const plan = planLabels(devices, positions, measure);

  // Un solo desplazamiento por dispositivo: el nombre y la dirección no se separan nunca.
  for (const device of devices) {
    const spot = plan.get(device.id);
    assert.equal(typeof spot.offset, 'number', `${device.id} se quedó sin lugar`);
  }
  assert.notEqual(plan.get('a').offset, plan.get('b').offset, 'los dos bloques quedaron en el mismo renglón');
});

test('un dispositivo solo usa su renglón de siempre y no se roza con su propio icono', () => {
  // El bloque arranca justo debajo del disco. Si esa distancia cae por debajo del radio,
  // cada nombre choca con su propio icono y el reparto entero se declara apretado.
  const devices = [{ id: 'a', name: 'PC1', interfaces: [{ addresses: [{ address: '10.0.0.1' }] }] }];
  const plan = planLabels(devices, new Map([['a', { x: 0, y: 0 }]]), {
    nameWidth: (text) => text.length * 8,
    addressWidth: (text) => text.length * 7,
  });

  assert.equal(plan.get('a').offset, 0);
  assert.equal(plan.get('a').crowded, false);
});

test('el estirado del reparto tiene tope', () => {
  const devices = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 100 }];
  // Un marco mucho más ancho que alto: sin tope, la red se desparramaría a lo ancho.
  const positions = projectIntoRect(devices, { x: 0, y: 0, width: 4000, height: 200 },
    { stretch: LAYOUT_STRETCH });

  const across = positions.get('b').x - positions.get('a').x;
  const down = positions.get('b').y - positions.get('a').y;
  assert.ok(across / down <= LAYOUT_STRETCH + 1e-6, `estiró ${across / down} veces`);
});

test('el nombre y la dirección no se superponen entre renglones', () => {
  const between = LABEL_TYPE.addressBaseline - LABEL_TYPE.nameBaseline;
  assert.ok(between > LABEL_TYPE.addressSize, 'la dirección se monta sobre el nombre');
});

test('el color del enlace sale del cableado y, si falta, del medio', () => {
  assert.equal(threadFor({ wiring: 'eCrossOver', media: 'eCopper' }), 'green');
  assert.equal(threadFor({ wiring: '', media: 'eFiber' }), 'blue');
  assert.equal(threadFor({ wiring: '', media: '' }), 'neutral');
});
