import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Oxygen } from '../../../src/systems/Oxygen.js';
import { swimVerticalSpeed } from '../../../src/entities/Swimming.js';

const CFG = { oxygenSeconds: 90, surfaceDrain: 1, regenPerSecond: 30, verticalSpeed: 1.8, buoyancy: 0.7 };
const run = (air, seconds, state, step = 0.1) => {
  let drowned = 0;
  for (let t = 0; t < seconds - 1e-9; t += step) if (air.update(step, state)) drowned++;
  return drowned;
};

test('fôlego: 90 s na água afoga exatamente uma vez', () => {
  const air = new Oxygen(CFG);
  assert.equal(run(air, 89.9, { inWater: true, submerged: true }), 0);
  assert.ok(air.fraction > 0 && air.fraction < 0.01);
  assert.equal(run(air, 0.2, { inWater: true, submerged: true }), 1);
  assert.equal(air.fraction, 0);
  assert.equal(run(air, 5, { inWater: true }), 0, 'não afoga de novo');
});

test('fôlego: fora d\'água recupera rápido; reset enche', () => {
  const air = new Oxygen(CFG);
  run(air, 60, { inWater: true });
  assert.ok(Math.abs(air.value - 30) < 1e-6);
  run(air, 1, { inWater: false });
  assert.ok(Math.abs(air.value - 60) < 1e-6);
  run(air, 2, { inWater: false });
  assert.equal(air.value, 90);
  run(air, 90, { inWater: true });
  air.reset();
  assert.equal(air.fraction, 1);
  assert.equal(air.drowned, false);
});

test('fôlego: na superfície usa surfaceDrain', () => {
  const air = new Oxygen({ ...CFG, surfaceDrain: 0.5 });
  run(air, 10, { inWater: true, submerged: false });
  assert.ok(Math.abs(air.value - 85) < 1e-6);
});

test('nado: Espaço sobe, Ctrl desce, parado flutua, olhar para baixo mergulha', () => {
  const base = { up: false, down: false, forward: 0, pitch: 0, speed: 2.1 };
  assert.equal(swimVerticalSpeed(CFG, { ...base, up: true }), 1.8);
  assert.equal(swimVerticalSpeed(CFG, { ...base, down: true }), -1.8);
  assert.equal(swimVerticalSpeed(CFG, base), 0.7);
  const dive = swimVerticalSpeed(CFG, { ...base, forward: 1, pitch: 0.6 });
  assert.ok(Math.abs(dive - -Math.sin(0.6) * 2.1) < 1e-9, 'segue a câmera, sem flutuação');
  assert.ok(swimVerticalSpeed(CFG, { ...base, forward: 1, pitch: -0.6 }) > 0, 'olhar para cima sobe');
});
