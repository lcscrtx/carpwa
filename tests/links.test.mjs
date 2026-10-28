import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navUrl, musicUrl, cleanPhone, telUrl, smsUrl, toKmh, pushRecent } from '../links.js';

test('navUrl monta rota em cada app', () => {
  assert.equal(navUrl('waze', 'Av. Paulista, 1000'), 'waze://?q=Av.%20Paulista%2C%201000&navigate=yes');
  assert.equal(navUrl('apple', 'Casa'), 'maps://?daddr=Casa&dirflg=d');
  assert.equal(navUrl('google', 'Rua A'), 'comgooglemaps://?daddr=Rua%20A&directionsmode=driving');
});

test('navUrl sem destino abre o app; app desconhecido usa Waze', () => {
  assert.equal(navUrl('apple', '  '), 'maps://');
  assert.equal(navUrl('xpto', 'Rua A'), 'waze://?q=Rua%20A&navigate=yes');
});

test('musicUrl com fallback', () => {
  assert.equal(musicUrl('spotify'), 'spotify:');
  assert.equal(musicUrl('nada'), 'music://');
});

test('telefone limpa formatação', () => {
  assert.equal(cleanPhone('+55 (11) 99999-0000'), '+5511999990000');
  assert.equal(cleanPhone('(11) 9999-0000'), '1199990000');
  assert.equal(telUrl('abc'), '');
  assert.equal(smsUrl('11 9999'), 'sms:119999');
});

test('toKmh converte e rejeita valores inválidos', () => {
  assert.equal(toKmh(10), 36);
  assert.equal(toKmh(0), 0);
  assert.equal(toKmh(null), null);
  assert.equal(toKmh(-1), null);
  assert.equal(toKmh(NaN), null);
});

test('pushRecent remove repetidos e limita', () => {
  assert.deepEqual(pushRecent(['b', 'A'], 'a'), ['a', 'b']);
  assert.deepEqual(pushRecent(['1', '2', '3'], '4', 3), ['4', '1', '2']);
  assert.deepEqual(pushRecent(['x'], '  '), ['x']);
});
