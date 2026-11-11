import { test } from 'node:test';
import assert from 'node:assert/strict';
import { travelTimeField, shoalHeight } from '../../../src/systems/ocean/ShoreField.js';

/** Grade sintética: mar à esquerda (x pequeno), praia que sobe para a direita. */
function beach(w = 60, h = 40, f = (x, y) => 20 - x * 0.8) {
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = f(x, y);
  return { d, w, h };
}

test('straightBeach_frontsParallelToContours', () => {
  // praia longa: as bordas de cima/baixo também são mar aberto, então mede longe delas
  const { d, w, h } = beach(60, 300);
  const T = travelTimeField(d, w, h, 8);
  // perto da costa (x = 20), T quase não varia ao longo da praia (frente reta)
  const row = [130, 150, 170].map((y) => T[y * w + 20]);
  assert.ok(Math.max(...row) - Math.min(...row) < 0.5, row.join(' '));
  // e cresce rumo à areia
  assert.ok(T[20 * w + 22] > T[20 * w + 15]);
  // terra: −1
  assert.equal(T[20 * w + 50], -1);
});

test('slowerInShallow_travelTimeGrowsFasterNearShore', () => {
  const { d, w, h } = beach();
  const T = travelTimeField(d, w, h, 8);
  const y = 20;
  const deepStep = T[y * w + 6] - T[y * w + 5], shallowStep = T[y * w + 23] - T[y * w + 22];
  assert.ok(shallowStep > deepStep * 1.5, `${deepStep.toFixed(2)} vs ${shallowStep.toFixed(2)}`);
});

test('enclosedLake_getsNoSurf', () => {
  const w = 40, h = 40;
  const d = new Float32Array(w * h).fill(-5); // tudo terra...
  for (let y = 0; y < h; y++) d[y * w] = 10; // ...com uma faixa de mar na borda esquerda
  for (let y = 15; y < 25; y++) for (let x = 15; x < 25; x++) d[y * w + x] = 8; // lago no meio
  const T = travelTimeField(d, w, h, 8);
  assert.equal(T[20 * w + 20], -1);
  assert.equal(T[20 * w], 0);
});

test('headland_wavesBendAroundIntoTheBay', () => {
  // ponta de terra no meio; a água atrás dela recebe onda, mais tarde que a de mar aberto
  const { d, w, h } = beach(60, 40, (x, y) => (x > 20 && x < 30 && y < 25 ? -3 : 20 - x * 0.3));
  const T = travelTimeField(d, w, h, 8);
  const behind = T[10 * w + 34], open = T[35 * w + 34];
  assert.ok(behind > 0 && open > 0 && behind > open, `${behind.toFixed(1)} > ${open.toFixed(1)}`);
});

test('greensLaw_growsThenBreaksAtGammaDepth', () => {
  const deep = shoalHeight(0.6, 25), mid = shoalHeight(0.6, 4), shallow = shoalHeight(0.6, 0.5);
  assert.ok(mid.H > deep.H);
  assert.ok(Math.abs(shallow.H - 0.78 * 0.5) < 1e-9);
  assert.equal(shallow.breaking, 1);
  assert.equal(deep.breaking, 0);
});
