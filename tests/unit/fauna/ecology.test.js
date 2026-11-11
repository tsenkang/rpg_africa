import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiet, SpatialGrid, needsStep, wantsToHunt, scorePrey, statKillChance } from '../../../src/systems/fauna/Ecology.js';

const ECO = {
  levels: { leao: 1, lobo: 2, girafa: 3, zebra: 4, arara: 4, escorpiao: 5 },
  eats: { 1: [2, 3, 4], 2: [4], 3: [], 4: [], 5: [] },
  extraDiet: { escorpiao: ['zebra'] },
  neverPrey: ['arara'],
  hunger: { rate: { 1: 0.01, 2: 0.02 }, huntAbove: 0.6, minEnergy: 0.25 },
  energy: { runDrain: 0.1, restGain: 0.05 },
  stat: { baseRate: 0.2 },
};

test('buildDiet_levelsAndOverrides', () => {
  const d = buildDiet(ECO);
  assert.deepEqual([...d.get('leao')].sort(), ['girafa', 'lobo', 'zebra']); // arara nunca é presa
  assert.deepEqual([...d.get('lobo')], ['zebra']);
  assert.equal(d.get('girafa').size, 0);
  assert.deepEqual([...d.get('escorpiao')], ['zebra']);
});

test('buildDiet_neverEatsOwnSpecies', () => {
  const d = buildDiet({ ...ECO, levels: { ...ECO.levels, leao2: 1 }, eats: { ...ECO.eats, 1: [1, 4] } });
  assert.ok(!d.get('leao').has('leao'));
  assert.ok(d.get('leao').has('leao2')); // outro superpredador: pode
});

test('grid_queryReturnsOnlyWithinRadius', () => {
  const g = new SpatialGrid(10);
  const a = { position: { x: 0, z: 0 } }, b = { position: { x: 8, z: 0 } }, c = { position: { x: 40, z: 0 } };
  g.rebuild([a, b, c]);
  const out = g.query(0, 0, 9, []);
  assert.deepEqual(out.sort((x, y) => x.position.x - y.position.x), [a, b]);
});

test('needs_hungerRisesOverTime_energyDrainsRunningRecoversResting', () => {
  const n = { hunger: 0.5, energy: 1 };
  needsStep(n, 1, { running: true, level: 1 }, ECO);
  assert.ok(Math.abs(n.hunger - 0.51) < 1e-9);
  assert.ok(Math.abs(n.energy - 0.9) < 1e-9);
  needsStep(n, 2, { running: false, level: 1 }, ECO);
  assert.ok(Math.abs(n.energy - 1) < 1e-9);
});

test('wantsToHunt_onlyHungryWithEnergy', () => {
  assert.equal(wantsToHunt({ hunger: 0.59, energy: 1 }, ECO), false);
  assert.equal(wantsToHunt({ hunger: 0.61, energy: 1 }, ECO), true);
  assert.equal(wantsToHunt({ hunger: 0.9, energy: 0.2 }, ECO), false); // exausto
});

test('scorePrey_prefersCloseWeakSlow', () => {
  const near = scorePrey(10, { health: 1, young: false, limping: false });
  const far = scorePrey(20, { health: 1, young: false, limping: false });
  const hurt = scorePrey(20, { health: 0.3, young: false, limping: false });
  const young = scorePrey(20, { health: 1, young: true, limping: false });
  assert.ok(near < far);
  assert.ok(hurt < far && young < far);
});

test('statKillChance_fasterPredatorAndPackKillMore_boundedByOne', () => {
  const solo = statKillChance({ run: 10, pack: 1 }, { run: 10 }, 1, ECO);
  const fast = statKillChance({ run: 14, pack: 1 }, { run: 10 }, 1, ECO);
  const pack = statKillChance({ run: 10, pack: 4 }, { run: 10 }, 1, ECO);
  assert.ok(fast > solo && pack > solo);
  assert.ok(statKillChance({ run: 99, pack: 9 }, { run: 1 }, 100, ECO) <= 1);
});
