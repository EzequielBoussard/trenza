import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser, launch, serve } from './support/browser.js';
import { activityXml, buildLegacyFile, deviceXml, linkXml, networkXml } from './support/files.js';

// Lo que depende del DOM se prueba en Chrome o Edge. Sin ninguno instalado se salta, salvo en CI:
// ahí saltarse en silencio dejaría de probar la mitad del sitio sin que nadie lo note.
const executable = findBrowser();
if (!executable && process.env.CI) throw new Error('no hay Chrome ni Edge en CI (CHROME_PATH lo indica a mano)');
const skip = executable ? false : 'no hay Chrome ni Edge (CHROME_PATH lo indica a mano)';

let site;
let browser;
let folder;
let nextDownload;

before(async () => {
  if (skip) return;
  site = await serve(fileURLToPath(new URL('..', import.meta.url)));
  browser = await launch(executable);
  folder = mkdtempSync(join(tmpdir(), 'trenza-archivos-'));
  nextDownload = await browser.downloads(folder);
}, { timeout: 60000 });

after(async () => {
  if (skip) return;
  await browser?.close();
  site.close();
  rmSync(folder, { recursive: true, force: true });
});

function saveFile(name, bytes) {
  const path = join(folder, name);
  writeFileSync(path, bytes);
  return path;
}

async function openFile(tab, name, bytes) {
  await tab.open(`${site.url}/`);
  await tab.chooseFile('[data-file-input]', saveFile(name, bytes));
  await tab.waitFor("document.querySelector('svg.topology .node')");
}

const BANNER = `banner motd ${String.fromCharCode(3)}Solo personal autorizado. Toda conexión queda registrada y se revisa cada semana.${String.fromCharCode(3)}`;

const LAB = networkXml([
  deviceXml({
    id: 'save-ref-id:1', name: 'S1', type: 'Switch', model: '2960-24TT', x: 300, y: 200,
    config: [
      'hostname S1', BANNER, 'vlan 10', ' name Ventas', 'vlan 40', ' name Voz', '!',
      'interface FastEthernet0/1', ' switchport access vlan 10', ' switchport voice vlan 40', '!',
      'interface GigabitEthernet0/1', ' switchport trunk native vlan 99', ' switchport mode trunk', '!',
    ],
  }),
  deviceXml({
    id: 'save-ref-id:2', name: 'R1', type: 'Router', model: 'ISR4331', x: 300, y: 60,
    config: [
      'hostname R1', 'interface GigabitEthernet0/0/0', ' ip address 192.0.2.1 255.255.255.0', ' ip ospf 1 area 0', '!',
      'router ospf 1', ' router-id 1.1.1.1', '!',
      'ip access-list standard ADMIN', ' permit 192.0.2.0 0.0.0.255', '!',
      'line vty 0 4', ' access-class ADMIN in', '!',
    ],
  }),
  deviceXml({ id: 'save-ref-id:3', name: 'PC1', type: 'Pc', model: 'PC-PT', x: 150, y: 340, ports: [{ ip: '192.0.2.10', mask: '255.255.255.0', mac: '0001.6343.A2B1' }] }),
], [
  linkXml('save-ref-id:2', 'GigabitEthernet0/0/0', 'save-ref-id:1', 'GigabitEthernet0/1'),
  linkXml('save-ref-id:1', 'FastEthernet0/1', 'save-ref-id:3', 'FastEthernet0'),
]);

// Como lo exporta Word, con lo que no tiene que llegar a la página.
const INSTRUCTIONS = `<html><head><title>Configurar VLAN y OSPF</title><style>p { color: red }</style></head>
<body lang=ES-UY><p class=MsoTitle>Configurar VLAN y OSPF</p>
<h1>Tabla de direcciones</h1>
<table><tr><td><p class=TableHeading>Equipo</p></td><td><p class=TableHeading>Dirección</p></td></tr>
<tr><td rowspan=2><p>R1</p></td><td><p>192.0.2.1</p></td></tr><tr><td><p>192.0.2.2</p></td></tr></table>
<p class=ConfigWindow>Open configuration window</p>
<p class=Bulletlevel1><span style='font-family:Symbol'>·<span>&nbsp;&nbsp;&nbsp;</span></span>Crear la VLAN 10.</p>
<p class=Bulletlevel1><span style='font-family:Symbol'>·<span>&nbsp;&nbsp;&nbsp;</span></span>Asignar el puerto de PC1.</p>
<p class=CMD>S1(config)# vlan 10</p><p class=CMD>S1(config-vlan)# name Ventas</p>
<script>window.injected = 1</script><img src=x onerror="window.injected = 2">
<p style="color:red" onclick="window.injected = 3">Ver <a href="javascript:window.injected = 4">la guía</a>.</p>
</body></html>`;

test('la red de ejemplo abre en /demo sin errores ni bloqueos de la política', { skip, timeout: 60000 }, async () => {
  const tab = await browser.tab();
  await tab.open(`${site.url}/demo`);
  await tab.waitFor("document.querySelectorAll('svg.topology .node').length === 71");

  assert.equal(await tab.evaluate("document.querySelector('[role=status]').textContent"), '71 devices and 68 connections');
  assert.equal(await tab.evaluate("new URL(document.querySelector('link[rel=canonical]').href).pathname"), '/demo');
  assert.deepEqual(tab.problems, []);
  await tab.close();
});

test('una actividad muestra sus instrucciones limpias y la configuración de IOS', { skip, timeout: 60000 }, async () => {
  const tab = await browser.tab();
  await openFile(tab, 'actividad.pka', buildLegacyFile(activityXml(LAB, INSTRUCTIONS)));

  assert.equal(await tab.evaluate("document.querySelector('.activity__title').textContent"), 'Configurar VLAN y OSPF');
  await tab.evaluate("document.querySelector('.activity__toggle > summary').click()");
  const text = await tab.evaluate(`(() => {
    const content = document.querySelector('.rich-text');
    const attributes = [...content.querySelectorAll('*')].flatMap((node) => [...node.attributes].map((a) => a.name));
    return {
      lang: content.lang,
      headings: [...content.querySelectorAll('h4')].map((h) => h.textContent),
      bullets: [...content.querySelectorAll('li')].map((li) => li.textContent),
      code: content.querySelector('pre').textContent,
      rowspan: content.querySelector('td[rowspan]')?.getAttribute('rowspan'),
      unwanted: content.querySelectorAll('script, img, a, style').length,
      attributes: [...new Set(attributes)].sort(),
      hidden: content.textContent.includes('configuration window'),
      injected: window.injected ?? null,
    };
  })()`);
  assert.deepEqual(text, {
    lang: 'ES-UY',
    headings: ['Tabla de direcciones'],
    bullets: ['Crear la VLAN 10.', 'Asignar el puerto de PC1.'],
    code: 'S1(config)# vlan 10\nS1(config-vlan)# name Ventas',
    rowspan: '2',
    unwanted: 0,
    attributes: ['class', 'rowspan'],
    hidden: false,
    injected: null,
  });

  await tab.evaluate("[...document.querySelectorAll('.rail button')].find((b) => b.textContent.startsWith('S1')).click()");
  await tab.waitFor("document.querySelector('.panel-head__title')?.textContent === 'S1'");
  const vlans = await tab.evaluate(`[...document.querySelectorAll('.panel section')].find((s) => s.querySelector('h3').textContent === 'VLANs').querySelector('table').innerText`);
  assert.match(vlans, /voice ports/i);
  assert.match(vlans, /40\s+Voz\s+-\s+Fa0\/1/);
  assert.match(vlans, /Gi0\/1 \(native\)/);
  assert.match(await tab.evaluate("document.querySelector('.panel pre.code-block').textContent"), /banner motd \^CSolo personal/);

  await tab.evaluate("[...document.querySelectorAll('.rail button')].find((b) => b.textContent.startsWith('R1')).click()");
  await tab.waitFor("document.querySelector('.panel-head__title')?.textContent === 'R1'");
  const router = await tab.evaluate("document.querySelector('.panel').innerText");
  assert.match(router, /router-id 1\.1\.1\.1/);
  assert.match(router, /GigabitEthernet0\/0\/0 area 0/);
  assert.match(router, /vty 0 4 in/);
  assert.deepEqual(tab.problems, []);
  await tab.close();
});

test('una tabla o un bloque que se desplaza es una parada del tabulador con nombre', { skip, timeout: 60000 }, async () => {
  const tab = await browser.tab({ storage: { 'trenza.panel': JSON.stringify({ width: 280 }) } });
  await openFile(tab, 'red.pkt', buildLegacyFile(LAB));
  await tab.evaluate("[...document.querySelectorAll('.rail button')].find((b) => b.textContent.startsWith('S1')).click()");
  await tab.waitFor("document.querySelector('.panel-head__title')?.textContent === 'S1'");

  const config = await tab.evaluate(`(() => {
    const box = document.querySelector('.panel pre.code-block');
    return [box.tabIndex, box.getAttribute('role'), box.getAttribute('aria-label')];
  })()`);
  assert.deepEqual(config, [0, 'region', 'running-config']);
  assert.equal(await tab.evaluate("[...document.querySelectorAll('.panel .table-scroller')].filter((box) => box.scrollWidth <= box.clientWidth && box.hasAttribute('tabindex')).length"), 0);
  await tab.close();
});

test('el zoom con la rueda deja quieto lo que está bajo el puntero', { skip, timeout: 60000 }, async () => {
  const tab = await browser.tab();
  await openFile(tab, 'red.pkt', buildLegacyFile(LAB));
  const where = "(() => { const r = document.querySelector('.node[data-id=\"save-ref-id:1\"] .node__disc').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, size: r.width }; })()";
  const before = await tab.evaluate(where);

  for (let notch = 0; notch < 3; notch++) await tab.wheel(before.x + 12, before.y + 12, -100);
  await tab.waitFor(`${where}.size > ${before.size * 1.5}`);
  const after = await tab.evaluate(where);
  const grown = after.size / before.size;

  assert.ok(Math.abs(after.x - (before.x + 12 - 12 * grown)) < 1.5, `se corrió a lo ancho: ${after.x}`);
  assert.ok(Math.abs(after.y - (before.y + 12 - 12 * grown)) < 1.5, `se corrió a lo alto: ${after.y}`);
  assert.deepEqual(tab.problems, []);
  await tab.close();
});

test('con más de 500 equipos las etiquetas esperan a leerse y el zoom llega a leerlas', { skip, timeout: 60000 }, async () => {
  const devices = [];
  for (let i = 0; i < 600; i++) {
    devices.push(deviceXml({
      id: `save-ref-id:${i + 1}`, name: `PC${i + 1}`, type: 'Pc', model: 'PC-PT',
      x: (i % 100) * 40, y: Math.floor(i / 100) * 80, ports: [{ ip: `10.0.${Math.floor(i / 250)}.${(i % 250) + 1}`, mask: '255.255.0.0' }],
    }));
  }
  const tab = await browser.tab();
  await openFile(tab, 'grande.pkt', buildLegacyFile(networkXml(devices)));

  assert.equal(await tab.evaluate("document.querySelector('svg.topology').classList.contains('is-far')"), true);
  const box = await tab.evaluate("(() => { const r = document.querySelector('.topology-viewport').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  for (let turn = 0; turn < 40; turn++) await tab.wheel(box.x, box.y, -100);
  await tab.waitFor("!document.querySelector('svg.topology').classList.contains('is-far')");
  const scale = await tab.evaluate("new DOMMatrix(getComputedStyle(document.querySelector('svg.topology')).transform).a");
  const name = await tab.evaluate("document.querySelector('.node__label').getBoundingClientRect().height");

  assert.ok(scale > 6, `el zoom se quedó en ${scale}`);
  assert.ok(name >= 20, `el nombre mide ${name} px`);
  assert.deepEqual(tab.problems, []);
  await tab.close();
});

test('el diálogo de exportar entra directo al nombre y entrega PNG, inventario e imagen copiada', { skip, timeout: 60000 }, async () => {
  await browser.grant(site.url, ['clipboardReadWrite', 'clipboardSanitizedWrite']);
  const tab = await browser.tab();
  await openFile(tab, 'red.pkt', buildLegacyFile(LAB));

  // El foco entra una sola vez, directo al nombre.
  const focused = await tab.evaluate(`(() => {
    const seen = [];
    const dialog = document.querySelector('[data-export-dialog]');
    dialog.addEventListener('focusin', (event) => seen.push(event.target.tagName));
    dialog.addEventListener('focus', () => seen.push('DIALOG'));
    document.querySelector('[data-export]').click();
    return seen.concat(document.activeElement.name);
  })()`);
  assert.deepEqual(focused, ['INPUT', 'name']);

  let download = nextDownload();
  await tab.evaluate(`(() => {
    const form = document.querySelector('[data-export-form]');
    form.elements.name.value = '  Mi diagrama.png ';
    form.querySelector('input[name=format][value=png]').click();
    form.requestSubmit();
  })()`);
  let file = await download;
  const png = readFileSync(file.path);
  assert.equal(file.name, 'Mi diagrama.png');
  assert.deepEqual([...png.subarray(1, 4)].map((code) => String.fromCharCode(code)).join(''), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1920, 1080]);
  await tab.waitFor("document.querySelector('[role=status]').textContent.startsWith('Mi diagrama.png · 1920×1080 px')");

  download = nextDownload();
  await tab.evaluate(`(() => {
    document.querySelector('[data-export]').click();
    const form = document.querySelector('[data-export-form]');
    form.querySelector('[data-for=network] input[value=csv]').click();
    form.dispatchEvent(new Event('change'));
    if (!document.querySelector('[data-preview-panel]').hidden) throw new Error('el inventario muestra la vista previa');
    form.requestSubmit();
  })()`);
  file = await download;
  const rows = readFileSync(file.path, 'utf8').replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(file.name, 'red.csv');
  assert.equal(rows.length, 4);
  assert.match(rows[1], /^"R1","Router","ISR4331","GigabitEthernet0\/0\/0","192\.0\.2\.1","255\.255\.255\.0"/);

  await tab.evaluate(`(() => {
    document.querySelector('[data-export]').click();
    document.querySelector('[data-export-form] input[name=format][value=png]').click();
    document.querySelector('[data-export-form]').dispatchEvent(new Event('change'));
    document.querySelector('[data-export-copy]').click();
  })()`);
  await tab.waitFor("document.querySelector('[role=status]').dataset.tone !== 'info'");
  const copied = await tab.evaluate(`(async () => {
    const [item] = await navigator.clipboard.read();
    const bitmap = await createImageBitmap(await item.getType('image/png'));
    return [document.querySelector('[role=status]').textContent, bitmap.width, bitmap.height];
  })()`);
  assert.deepEqual(copied, ['Image copied, 1920×1080 px: it can be pasted into any document.', 1920, 1080]);
  assert.deepEqual(tab.problems, []);
  await tab.close();
});

test('el buscador encuentra por subred y por VLAN, y el camino entre 2 equipos se marca entero', { skip, timeout: 60000 }, async () => {
  const tab = await browser.tab();
  await openFile(tab, 'red.pkt', buildLegacyFile(LAB));
  const search = async (text) => tab.evaluate(`(() => {
    const input = document.querySelector('.rail__search');
    input.value = ${JSON.stringify(text)};
    input.dispatchEvent(new Event('input'));
    return [...document.querySelectorAll('.device-chip .device-chip__name')].map((name) => name.textContent).sort();
  })()`);

  assert.deepEqual(await search('192.0.2.0/24'), ['PC1', 'R1']);
  assert.deepEqual(await search('vlan 10'), ['PC1', 'S1']);
  assert.deepEqual(await search('10.0.0.0/8'), []);
  assert.deepEqual(await search('00:01:63:43:a2:b1'), ['PC1'], 'la MAC como la muestra una captura');
  assert.deepEqual(await search('6343.a2'), ['PC1']);
  await search('');

  await tab.evaluate("[...document.querySelectorAll('.rail button')].find((b) => b.textContent.startsWith('PC1')).click()");
  await tab.waitFor("document.querySelector('.path select')");
  const path = await tab.evaluate(`(() => {
    const select = document.querySelector('.path select');
    select.value = [...select.options].find((option) => option.text === 'R1').value;
    select.dispatchEvent(new Event('change'));
    return {
      steps: [...document.querySelectorAll('.path__step')].map((step) => step.firstChild.textContent),
      nodes: document.querySelectorAll('.node.is-path').length,
      links: document.querySelectorAll('.link.is-path').length,
    };
  })()`);
  assert.deepEqual(path, { steps: ['PC1', 'S1', 'R1'], nodes: 3, links: 2 });
  assert.deepEqual(tab.problems, []);
  await tab.close();
});

test('comparar una actividad con su red inicial y con otro archivo marca lo que cambió', { skip, timeout: 60000 }, async () => {
  const start = networkXml([
    deviceXml({ id: 'save-ref-id:1', name: 'S1', type: 'Switch', model: '2960-24TT', x: 300, y: 200, config: ['hostname S1', '!', 'interface FastEthernet0/1', '!'] }),
    deviceXml({ id: 'save-ref-id:3', name: 'PC1', type: 'Pc', model: 'PC-PT', x: 150, y: 340, ports: [{ ip: '192.0.2.99', mask: '255.255.255.0' }] }),
  ], [linkXml('save-ref-id:1', 'FastEthernet0/1', 'save-ref-id:3', 'FastEthernet0')]);
  const tab = await browser.tab();
  await openFile(tab, 'actividad.pka', buildLegacyFile(activityXml(LAB, '<html><body><p>Hola</p></body></html>', start)));

  await tab.evaluate("[...document.querySelectorAll('.compare button')].find((b) => b.textContent === 'Compare with the starting network').click()");
  await tab.waitFor("document.querySelector('.compare dl')");
  const summary = await tab.evaluate(`(() => ({
    counts: [...document.querySelectorAll('.compare dd')].map((dd) => dd.textContent),
    tags: [...document.querySelectorAll('.compare__list li')].map((li) => li.textContent),
    changed: [...document.querySelectorAll('.node.is-changed')].map((node) => node.dataset.id).sort(),
    added: [...document.querySelectorAll('.node.is-added')].map((node) => node.dataset.id),
    status: document.querySelector('[role=status]').textContent,
  }))()`);
  assert.deepEqual(summary.counts, ['2', '1', '0', '1', '0']);
  assert.deepEqual(summary.changed, ['save-ref-id:1', 'save-ref-id:3']);
  assert.deepEqual(summary.added, ['save-ref-id:2']);
  assert.match(summary.status, /^Compared with the starting network of the activity: 3 devices with changes/);

  await tab.evaluate("[...document.querySelectorAll('.compare__list button')].find((b) => b.textContent === 'S1').click()");
  await tab.waitFor("document.querySelector('.panel-head__title')?.textContent === 'S1'");
  const diff = await tab.evaluate("document.querySelector('.code-block.diff').textContent");
  assert.match(diff, /^\+ banner motd/m);
  assert.match(diff, /^ {2}interface FastEthernet0\/1\n\+ {2}switchport access vlan 10/m);

  // Contra otro archivo, desde el selector propio de comparar.
  await tab.evaluate("document.querySelector('.panel-head__title')?.blur(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await tab.waitFor("document.querySelector('.compare')");
  await tab.evaluate("[...document.querySelectorAll('.compare button')].find((b) => b.textContent === 'Stop comparing').click()");
  assert.equal(await tab.evaluate("document.querySelectorAll('.node.is-changed, .node.is-added').length"), 0);
  await tab.chooseFile('[data-compare-input]', saveFile('otra.pkt', buildLegacyFile(LAB)));
  await tab.waitFor("document.querySelector('[role=status]').textContent.startsWith('Compared with otra.pkt')");
  assert.equal(await tab.evaluate("document.querySelector('.compare .panel-text').textContent"), 'Compared with otra.pkt.');
  assert.match(await tab.evaluate("document.querySelector('.compare').textContent"), /There are no differences/);
  assert.deepEqual(tab.problems, []);
  await tab.close();
});

test('una conversación filtra la captura a ese par, desde el resumen o desde un paquete', { skip, timeout: 60000 }, async () => {
  const tab = await browser.tab();
  await tab.open(`${site.url}/`);
  await tab.evaluate("document.querySelector('[data-example=capture]').click()");
  await tab.waitFor("document.querySelector('.packet-row') && document.querySelector('.conversations__pick')");
  const shown = (ends) => `(() => {
    const rows = [...document.querySelectorAll('.packet-row')];
    const ends = ${JSON.stringify(ends)};
    return {
      filter: document.querySelector('.rail__search').value,
      rows: rows.length,
      inPair: rows.every((row) => ends.includes(row.cells[2].textContent) && ends.includes(row.cells[3].textContent)),
      marked: rows.every((row) => row.cells[2].querySelector('mark') && row.cells[3].querySelector('mark')),
      focused: document.activeElement.dataset.conversation,
    };
  })()`;

  const first = await tab.evaluate(`(() => {
    const pick = document.querySelector('.conversations__pick');
    pick.click();
    return { ends: pick.dataset.conversation.split(' '), count: parseInt(pick.querySelector('.conversations__count').textContent, 10) };
  })()`);
  assert.deepEqual(await tab.evaluate(shown(first.ends)), {
    filter: first.ends.join(' '), rows: first.count, inPair: true, marked: true, focused: first.ends.join(' '),
  });

  await tab.evaluate("(() => { const search = document.querySelector('.rail__search'); search.value = ''; search.dispatchEvent(new Event('input')); })()");
  const packet = await tab.evaluate(`(() => {
    const row = document.querySelectorAll('.packet-row')[3];
    row.click();
    document.querySelector('.panel-head__action').click();
    return { index: row.dataset.index, ends: [row.cells[2].textContent, row.cells[3].textContent] };
  })()`);
  const after = await tab.evaluate(shown(packet.ends));
  assert.equal(after.filter, packet.ends.join(' '));
  assert.ok(after.rows > 0 && after.inPair && after.marked);
  assert.equal(after.focused, packet.ends.join(' '));
  assert.equal(await tab.evaluate("document.querySelector('.packet-row.is-selected')?.dataset.index"), packet.index, 'el paquete sigue elegido');
  assert.deepEqual(tab.problems, []);
  await tab.close();
});

test('el diálogo de exportar arranca con el formato y la medida de la última vez', { skip, timeout: 60000 }, async () => {
  const tab = await browser.tab({ storage: { 'trenza.export': JSON.stringify({ network: { format: 'jpg', size: 'qhd', guide: false, transparent: false } }) } });
  await openFile(tab, 'red.pkt', buildLegacyFile(LAB));
  const opened = await tab.evaluate(`(() => {
    document.querySelector('[data-export]').click();
    const form = document.querySelector('[data-export-form]');
    return [form.elements.format.value, form.elements.size.value, form.elements.guide.checked];
  })()`);
  assert.deepEqual(opened, ['jpg', 'qhd', false]);
  assert.deepEqual(tab.problems, []);
  await tab.close();
});
