import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countOf, setLanguage, t, withLanguage } from '../src/i18n.js';

setLanguage('en');

test('una cadena sin marcadores vuelve tal cual', () => {
  assert.equal(t('action.close'), 'Close');
  assert.equal(t('action.close', {}), 'Close');
});

test('la misma plantilla con valores distintos no se contamina', () => {
  // Se cachea la plantilla partida, no el resultado.
  const primero = t('packet.lengths', { source: 51000, destination: 53, length: 40 });
  const segundo = t('packet.lengths', { source: 40404, destination: 443, length: 8 });

  assert.equal(primero, '51000 → 53 len=40');
  assert.equal(segundo, '40404 → 443 len=8');
  assert.equal(t('packet.lengths', { source: 51000, destination: 53, length: 40 }), primero);
});

test('un marcador sin valor se deja a la vista en vez de desaparecer', () => {
  assert.equal(t('packet.lengths', { source: 1 }), '1 → {destination} len={length}');
});

test('el plural sigue al número y al idioma', () => {
  assert.equal(countOf('packets', 1), '1 packet');
  assert.equal(countOf('packets', 2), '2 packets');
  assert.equal(withLanguage('es', () => countOf('packets', 1)), '1 paquete');
  assert.equal(withLanguage('es', () => countOf('packets', 2)), '2 paquetes');
});

test('una clave que no existe se devuelve como está', () => {
  assert.equal(t('no.existe'), 'no.existe');
  assert.equal(t('no.existe', { x: 1 }), 'no.existe');
});

test('el idioma prestado vuelve al de la página, incluso si algo falla', () => {
  assert.equal(withLanguage('es', () => t('action.close')), 'Cerrar');
  assert.equal(t('action.close'), 'Close');

  assert.throws(() => withLanguage('es', () => { throw new Error('x'); }), /x/);
  assert.equal(t('action.close'), 'Close', 'el idioma quedó prestado tras un error');
});

test('un idioma desconocido no cambia nada', () => {
  assert.equal(withLanguage('fr', () => t('action.close')), 'Close');
});

// La página trae el inglés escrito para que nada salte al traducir; si se desfasa del
// diccionario, sin JavaScript o hasta que llega se ve un texto viejo.
test('el inglés de index.html coincide con el diccionario', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const unescape = (text) => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const bold = { pkt: '<b>.pkt</b>', pka: '<b>.pka</b>', pkz: '<b>.pkz</b>', pcap: '<b>.pcap</b>', pcapng: '<b>.pcapng</b>' };
  let checked = 0;

  for (const [, key, text] of html.matchAll(/data-i18n="([\w.]+)"[^>]*>([^<]*)</g)) {
    assert.equal(unescape(text), t(key), key);
    checked++;
  }
  for (const [, key, inner] of html.matchAll(/data-i18n-html="([\w.]+)"[^>]*>(.*?)<\/p>/g)) {
    assert.equal(inner, t(key, bold), key);
    checked++;
  }
  for (const [, text, key] of html.matchAll(/alt="([^"]*)" data-i18n-alt="([\w.]+)"/g)) {
    assert.equal(unescape(text), t(key), key);
    checked++;
  }
  assert.ok(checked >= 39, `sólo se revisaron ${checked}`);
});
