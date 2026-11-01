import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { decodePacketTracerFile } from '../src/pkt/decode.js';
import { decodeCapture } from '../src/pcap/decode.js';
import { dissectPacket } from '../src/pcap/dissect.js';

const showcase = (name) => new Uint8Array(readFileSync(new URL(`../showcase/${name}`, import.meta.url)));

// Es el único archivo real cifrado de las pruebas: el resto usa el formato heredado.
test('descifra la red de ejemplo', async () => {
  const { xml, variant } = await decodePacketTracerFile(showcase('red-supermercado.pkt'));
  const text = new TextDecoder().decode(xml);

  assert.equal(variant, 'modern');
  assert.match(text, /<VERSION>7\.3\.1/);
  // 71 equipos y una regleta, que el visor esconde como infraestructura.
  assert.equal(text.match(/<DEVICE>/g).length, 72);
});

test('la captura de ejemplo se lee entera', () => {
  const capture = decodeCapture(showcase('captura-ejemplo.pcap'));
  const protocols = new Set(capture.packets.map((packet) => dissectPacket(packet).protocol));

  assert.equal(capture.truncated, 0);
  assert.equal(capture.packets.length, 30);
  assert.deepEqual([...protocols].sort(), ['ARP', 'DHCP', 'DNS', 'HTTP', 'ICMP', 'NTP']);
});

// El guion de la cabecera arma la misma lista que la imagen; si se desfasan, la precarga
// baja un archivo que la imagen no usa.
test('la precarga de la portada pide lo mismo que la imagen', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([^<]*)<\/script>/)[1];

  for (const theme of ['dark', 'light']) {
    const image = html.match(new RegExp(`<img class="intro__image intro__image--${theme}"[^>]*>`))[0];
    const srcset = new Function('b', `return ${script.match(/p\.imageSrcset=([^;]*);/)[1]}`)(`/showcase/preview-${theme}`);
    assert.equal(srcset, image.match(/srcset="([^"]*)"/)[1]);
    assert.ok(script.includes(`p.imageSizes='${image.match(/sizes="([^"]*)"/)[1]}'`));
  }
});

// La política de seguridad sólo deja correr el guion en línea con este hash: si se toca el guion
// y no el hash, el sitio arranca sin tema, sin idioma y sin abrir /demo.
test('el hash del guion en línea coincide con el de la política de seguridad', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const headers = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
  const script = html.match(/<script>([^<]*)<\/script>/)[1];
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  assert.ok(headers.includes(`'sha256-${hash}'`));
});

test('el ejemplo que pide la cabecera en /demo es el mismo que abre el visor', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const path = html.match(/fetch\('([^']+\.pkt)'\)/)[1];
  assert.ok(app.includes(`network: '${path}'`));
  assert.ok(worker.includes(`'${path}'`));
  assert.ok(readFileSync(new URL(`..${path}`, import.meta.url)).length > 0);
});

// Sin conexión el visor sale de la lista de sw.js: un módulo que falte deja la página en blanco.
test('la caché sin conexión y las precargas nombran todos los módulos, y nada que no exista', () => {
  const worker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const shell = [...worker.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  for (const path of shell) assert.ok(existsSync(new URL(`..${path === '/' ? '/index.html' : path}`, import.meta.url)), path);

  const modules = readdirSync(new URL('../src', import.meta.url), { recursive: true })
    .filter((file) => file.endsWith('.js'))
    .map((file) => `/src/${file.split(sep).join('/')}`);
  for (const module of modules) {
    assert.ok(shell.includes(module), `${module} falta en sw.js`);
    if (module !== '/src/app.js') assert.ok(html.includes(`<link rel="modulepreload" href="${module}">`), `${module} falta en index.html`);
  }
});
