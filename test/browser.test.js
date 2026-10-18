import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser, launch, serve } from './support/browser.js';
import { activityXml, buildLegacyFile, deviceXml, linkXml, networkXml } from './support/files.js';

// Lo que depende del DOM se prueba en Chrome o Edge. Sin ninguno instalado, se salta.
const executable = findBrowser();
const skip = executable ? false : 'no hay Chrome ni Edge (CHROME_PATH lo indica a mano)';

let site;
let browser;
let folder;

before(async () => {
  if (skip) return;
  site = await serve(fileURLToPath(new URL('..', import.meta.url)));
  browser = await launch(executable);
  folder = mkdtempSync(join(tmpdir(), 'trenza-archivos-'));
});

after(async () => {
  if (skip) return;
  await browser.close();
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
  deviceXml({ id: 'save-ref-id:3', name: 'PC1', type: 'Pc', model: 'PC-PT', x: 150, y: 340, ports: [{ ip: '192.0.2.10', mask: '255.255.255.0' }] }),
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

test('la red de ejemplo abre en /demo sin errores ni bloqueos de la política', { skip }, async () => {
  const tab = await browser.tab();
  await tab.open(`${site.url}/demo`);
  await tab.waitFor("document.querySelectorAll('svg.topology .node').length === 71");

  assert.equal(await tab.evaluate("document.querySelector('[role=status]').textContent"), '71 devices and 68 connections');
  assert.equal(await tab.evaluate("new URL(document.querySelector('link[rel=canonical]').href).pathname"), '/demo');
  assert.deepEqual(tab.problems, []);
  await tab.close();
});

test('una actividad muestra sus instrucciones limpias y la configuración de IOS', { skip }, async () => {
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

test('una tabla o un bloque que se desplaza es una parada del tabulador con nombre', { skip }, async () => {
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

test('el zoom con la rueda deja quieto lo que está bajo el puntero', { skip }, async () => {
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

test('con más de 500 equipos las etiquetas esperan a leerse y el zoom llega a leerlas', { skip }, async () => {
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
