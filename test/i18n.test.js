import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countOf, setLanguage, t, withLanguage } from '../src/i18n.js';

setLanguage('en');

test('una cadena sin marcadores vuelve tal cual', () => {
  assert.equal(t('action.close'), 'Close');
  assert.equal(t('action.close', {}), 'Close');
});

test('la misma plantilla con valores distintos no se contamina', () => {
  // Las plantillas se parten una sola vez y se guardan. Si lo guardado fuera el resultado
  // y no las piezas, el segundo paquete saldría con los datos del primero, y eso en una
  // captura son cien mil filas iguales.
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
