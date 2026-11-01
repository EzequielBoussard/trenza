import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanExportName, inventoryCsv, suggestExportName } from '../src/view/export.js';
import {
  LABEL_TYPE,
  LAYOUT_STRETCH,
  cablePath,
  frameForNetwork,
  measureBounds,
  planLabels,
  projectIntoRect,
  threadFor,
  unstack,
} from '../src/view/graph.js';

const INSETS = { left: 120, right: 120, top: 150, bottom: 130 };

test('propone el nombre del archivo abierto, sin extensión', () => {
  assert.equal(suggestExportName('red-supermercado.pkt'), 'red-supermercado');
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
  // Si nameTop fuera menor que el radio, cada nombre chocaría con su propio icono.
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
  // Así llegan los seriales en los archivos reales: sin tipo de cable.
  assert.equal(threadFor({ wiring: '', media: 'eSerial' }), 'brown');
  assert.equal(threadFor({ wiring: '', media: 'eCoaxial' }), 'brown');
  assert.equal(threadFor({ wiring: '', media: 'eOctal' }), 'neutral');
  assert.equal(threadFor({ wiring: '', media: '' }), 'neutral');
});

test('dos equipos encimados en el archivo se apartan y el resto no se toca', () => {
  const devices = [
    { id: 'a', x: 627, y: 160 },
    { id: 'b', x: 632, y: 150 },
    { id: 'c', x: 400, y: 150 },
  ];
  const placed = unstack(devices);
  const [a, b] = placed;

  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 47.9, 'siguen encimados');
  assert.equal(placed[2], devices[2]);
  assert.deepEqual(devices[0], { id: 'a', x: 627, y: 160 }, 'cambió el modelo original');

  const apart = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 45, y: 0 }];
  assert.equal(unstack(apart), apart, 'separó equipos que no se tapan');
});

test('el nombre escrito a mano no rompe el archivo ni repite la extensión', () => {
  assert.equal(cleanExportName('  red: piso 2/oficina.PNG ', 'red.pkt'), 'red- piso 2-oficina');
  assert.equal(cleanExportName('diagrama.v2', 'red.pkt'), 'diagrama.v2');
  assert.equal(cleanExportName('   ', 'Mi red.pkt'), 'Mi red');
});

test('el inventario tiene un renglón por dirección, en el orden de la lista', async () => {
  const device = (id, name, category, interfaces) => ({ id, name, category, model: 'M', location: ['Sede', 'Rack'], interfaces, links: [] });
  const model = {
    devices: [
      device('2', 'PC10', 'endpoint', [{ name: 'FastEthernet0', mac: '', gateway: '10.0.0.1', enabled: true, addresses: [{ address: '10.0.0.10', mask: '255.255.255.0' }] }]),
      device('3', 'PC9', 'endpoint', []),
      device('1', 'R1', 'router', [
        { name: 'Gig0/0', mac: '', gateway: '', enabled: true, addresses: [{ address: '10.0.0.1', mask: '255.255.255.0' }, { address: '2001:db8::1', mask: '' }] },
        { name: 'Gig0/1', mac: '', gateway: '', enabled: false, addresses: [] },
      ]),
    ],
    links: [],
  };
  const { blob, devices } = inventoryCsv(model, { showInfrastructure: false });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const lines = (await blob.text()).trim().split('\r\n');

  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'sin BOM, Excel rompe los acentos');
  assert.equal(devices, 3);
  assert.equal(lines[0], '"Device","Type","Model","Interface","Address","Mask","Gateway","State","Location"');
  assert.deepEqual(lines.slice(1).map((line) => line.split('","').slice(0, 5).join('|').replace(/^"/, '')), [
    'R1|Router|M|Gig0/0|10.0.0.1',
    'R1|Router|M|Gig0/0|2001:db8::1',
    'R1|Router|M|Gig0/1|',
    'PC9|User device|M||',
    'PC10|User device|M|FastEthernet0|10.0.0.10',
  ]);
  assert.match(lines[5], /"10\.0\.0\.1","Up","Sede › Rack"$/);
});

test('el camino entre 2 equipos va por la menor cantidad de cables y dice por qué puerto pasa', () => {
  const device = (id, links) => [id, { id, links: links.map(([port, peerId, peerPort]) => ({ port, peerId, peerPort })) }];
  const devices = new Map([
    device('pc1', [['Fa0', 's1', 'Fa0/1']]),
    device('s1', [['Fa0/1', 'pc1', 'Fa0'], ['Gi0/1', 'r1', 'Gi0/0'], ['Fa0/2', 's2', 'Fa0/24']]),
    device('s2', [['Fa0/24', 's1', 'Fa0/2'], ['Fa0/23', 'r1', 'Gi0/2']]),
    device('r1', [['Gi0/0', 's1', 'Gi0/1'], ['Gi0/2', 's2', 'Fa0/23'], ['Se0/0', 'isp', 'Se0/0']]),
    device('isp', [['Se0/0', 'r1', 'Se0/0']]),
    device('suelto', []),
  ]);

  assert.deepEqual(cablePath(devices, 'pc1', 'isp'), [
    { id: 'pc1', in: '', out: 'Fa0' },
    { id: 's1', in: 'Fa0/1', out: 'Gi0/1' },
    { id: 'r1', in: 'Gi0/0', out: 'Se0/0' },
    { id: 'isp', in: 'Se0/0', out: '' },
  ]);
  assert.deepEqual(cablePath(devices, 'pc1', 'pc1'), [{ id: 'pc1', in: '', out: '' }]);
  assert.equal(cablePath(devices, 'pc1', 'suelto'), null);
  assert.equal(cablePath(devices, 'pc1', 'no-existe'), null);
});
