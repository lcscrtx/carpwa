import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squirclePath, toPx } from '../public/squircle.js';

// Soma os deslocamentos de um caminho para conferir que ele fecha no ponto de partida.
function endPoint(path) {
  const tokens = path.match(/[MLcaZ]|-?\d+(\.\d+)?/g);
  let x = 0, y = 0, i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    const nums = [];
    while (i < tokens.length && !/[MLcaZ]/.test(tokens[i])) nums.push(Number(tokens[i++]));
    if (cmd === 'M' || cmd === 'L') [x, y] = nums;
    if (cmd === 'c') { x += nums[4]; y += nums[5]; }
    if (cmd === 'a') { x += nums[5]; y += nums[6]; }
  }
  return [x, y];
}

test('curva de cada canto chega exatamente na reta seguinte', () => {
  const p = squirclePath(200, 100, [24, 24, 24, 24]);
  assert.ok(p.startsWith('M '));
  assert.ok(p.endsWith('Z'));
  // O último canto (topo-esquerdo) termina na borda de cima, a p = 1,6 × 24 da esquerda;
  // o Z fecha a reta do topo até o ponto inicial.
  const [x, y] = endPoint(p);
  assert.ok(Math.abs(x - 38.4) < 0.05 && Math.abs(y) < 0.05, `${x},${y}`);
});

test('suavização estende a curva além do raio (60% → p = 1,6 × r)', () => {
  const p = squirclePath(200, 200, [20, 20, 20, 20]);
  assert.equal(p.match(/^M (\S+)/)[1], String(200 - 32));
});

test('raio maior que o lado é limitado à metade', () => {
  const p = squirclePath(40, 40, [100, 100, 100, 100]);
  assert.equal(p.match(/^M (\S+)/)[1], '20');
});

test('cantos retos viram linhas', () => {
  const p = squirclePath(100, 50, [0, 0, 0, 0]);
  assert.equal(p, 'M 100 0 L 100 50 L 0 50 L 0 0 Z');
});

test('deslocamento move o caminho inteiro', () => {
  assert.ok(squirclePath(10, 10, [0, 0, 0, 0], 0.6, 1, 2).startsWith('M 11 2'));
});

test('toPx entende % e px', () => {
  assert.equal(toPx('23%', 100), 23);
  assert.equal(toPx('24px', 300), 24);
  assert.equal(toPx('0px', 10), 0);
});
