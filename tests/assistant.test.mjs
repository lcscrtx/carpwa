import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, parseCommand as p, findContact } from '../public/assistant.js';

test('normalize', () => {
  assert.equal(normalize('  Próxima Música! '), 'proxima musica');
});

test('controles de música', () => {
  assert.equal(p('Pausar').type, 'pause');
  assert.equal(p('para a música').type, 'pause');
  assert.equal(p('continuar').type, 'resume');
  assert.equal(p('Toca').type, 'resume');
  assert.equal(p('próxima música').type, 'next');
  assert.equal(p('pular').type, 'next');
  assert.equal(p('música anterior').type, 'prev');
  assert.equal(p('voltar música').type, 'prev');
});

test('youtube', () => {
  assert.deepEqual(p('Toca Legião Urbana no YouTube'), { type: 'youtube', query: 'legiao urbana' });
  assert.deepEqual(p('quero ver gol do corinthians no youtube'), { type: 'youtube', query: 'gol do corinthians' });
  assert.deepEqual(p('YouTube receita de bolo'), { type: 'youtube', query: 'receita de bolo' });
});

test('música', () => {
  assert.deepEqual(p('toca Charlie Brown'), { type: 'music', query: 'charlie brown' });
  assert.deepEqual(p('coloca rock nacional no Spotify'), { type: 'music', query: 'rock nacional' });
});

test('navegação', () => {
  assert.deepEqual(p('navegar para casa'), { type: 'nav', saved: 'home' });
  assert.deepEqual(p('me leva pro trabalho'), { type: 'nav', saved: 'work' });
  assert.deepEqual(p('ir para Avenida Paulista 1000'), { type: 'nav', to: 'avenida paulista 1000' });
  assert.deepEqual(p('rota até o shopping ibirapuera'), { type: 'nav', to: 'shopping ibirapuera' });
});

test('ligação e mensagem', () => {
  assert.deepEqual(p('Ligar para Ana'), { type: 'call', name: 'ana' });
  assert.deepEqual(p('liga pro Pedro'), { type: 'call', name: 'pedro' });
  assert.deepEqual(p('mandar mensagem para mãe'), { type: 'sms', name: 'mae' });
  assert.deepEqual(p('mensagem pra Ana'), { type: 'sms', name: 'ana' });
});

test('carro', () => {
  assert.equal(p('estacionei aqui').type, 'parkSave');
  assert.equal(p('salvar vaga').type, 'parkSave');
  assert.equal(p('onde eu estacionei?').type, 'parkFind');
  assert.equal(p('cadê meu carro').type, 'parkFind');
});

test('abrir telas', () => {
  assert.deepEqual(p('abrir YouTube'), { type: 'open', view: 'youtube' });
  assert.deepEqual(p('velocímetro'), { type: 'open', view: 'speed' });
  assert.deepEqual(p('mostra o painel'.replace(' o ', ' ')), { type: 'open', view: 'dash' });
  assert.deepEqual(p('ajustes'), { type: 'open', view: 'settings' });
});

test('desconhecido', () => {
  assert.equal(p('').type, 'unknown');
  assert.equal(p('qual a capital da frança').type, 'unknown');
});

test('findContact', () => {
  const c = [{ name: 'Ana Souza', phone: '1' }, { name: 'Pedro', phone: '2' }, { name: 'Mãe', phone: '3' }];
  assert.equal(findContact(c, 'ana')?.phone, '1');
  assert.equal(findContact(c, 'Ana Souza')?.phone, '1');
  assert.equal(findContact(c, 'mae')?.phone, '3');
  assert.equal(findContact(c, 'souza')?.phone, '1');
  assert.equal(findContact(c, 'joao'), null);
});
