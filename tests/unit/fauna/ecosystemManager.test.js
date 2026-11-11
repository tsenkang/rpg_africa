import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EcosystemManager } from '../../../src/systems/fauna/EcosystemManager.js';

const CFG = {
  levels: { leao: 1, lobo: 2, zebra: 4, girafa: 3 },
  eats: { 1: [2, 3, 4], 2: [4], 3: [], 4: [] },
  extraDiet: {}, neverPrey: [], playerPreyOf: [1, 2],
  hunger: { rate: { 1: 0.01, 2: 0.01 }, huntAbove: 0.6, minEnergy: 0.25, initial: [0.5, 0.5], mealPerHealth: 1 / 100 },
  energy: { runDrain: 0.01, restGain: 0.01 },
  prey: { alarmRadius: 25, panicRadius: 5 },
  tick: 0.25, gridCell: 16, huntSenseScale: 1.5, detailRadius: 50, stat: { baseRate: 10 },
};
const SPEC = { leao: { sense: 30, run: 12, walk: 1, health: 150 }, lobo: { sense: 30, run: 11, walk: 1, health: 60 }, zebra: { sense: 20, run: 11, walk: 1, health: 80 }, girafa: { sense: 20, run: 9, walk: 1, health: 220 } };
let seq = 0;
function animal(speciesId, x, z, extra = {}) {
  return { id: ++seq, speciesId, spec: SPEC[speciesId], position: { x, y: 0, z }, health: SPEC[speciesId].health, alive: true, speed: 0, limpT: 0, group: seq, ...extra };
}
const PLAYER = { position: { x: 0, z: 0 }, alive: true, health01: 1 };
const make = () => new EcosystemManager(CFG, { rng: () => 0.5 });

test('hungryPredator_targetsNearestPrey_satedDoesNot', () => {
  const eco = make();
  const lion = animal('leao', 0, 0), zebra = animal('zebra', 10, 0);
  eco.register(lion); eco.register(zebra);
  lion.eco.needs.hunger = 0.4;
  eco.update(0.3, [lion, zebra], { ...PLAYER, position: { x: 500, z: 0 } });
  assert.equal(lion.eco.target, null);
  assert.equal(lion.eco.calm, true);
  lion.eco.needs.hunger = 0.8;
  eco.update(0.3, [lion, zebra], { ...PLAYER, position: { x: 500, z: 0 } });
  assert.equal(lion.eco.target, zebra);
});

test('prey_fleesOnlyFromHuntingPredator_coexistsWithSated', () => {
  const eco = make();
  const lion = animal('leao', 0, 0), zebra = animal('zebra', 15, 0);
  eco.register(lion); eco.register(zebra);
  lion.eco.needs.hunger = 0.2; // alimentado: bebem no mesmo lago
  eco.update(0.3, [lion, zebra], { ...PLAYER, position: { x: 500, z: 0 } });
  assert.equal(zebra.eco.threat, null);
  lion.eco.needs.hunger = 0.9;
  eco.update(0.3, [lion, zebra], { ...PLAYER, position: { x: 500, z: 0 } });
  assert.equal(zebra.eco.threat, lion);
});

test('prey_panicsWhenAnyPredatorTooClose', () => {
  const eco = make();
  const lion = animal('leao', 0, 0), zebra = animal('zebra', 3, 0);
  eco.register(lion); eco.register(zebra);
  lion.eco.needs.hunger = 0.1;
  eco.update(0.3, [lion, zebra], { ...PLAYER, position: { x: 500, z: 0 } });
  assert.equal(zebra.eco.threat, lion);
});

test('mesopredator_doesNotHuntBigHerbivore', () => {
  const eco = make();
  const wolf = animal('lobo', 0, 0), giraffe = animal('girafa', 8, 0);
  eco.register(wolf); eco.register(giraffe);
  wolf.eco.needs.hunger = 0.9;
  eco.update(0.3, [wolf, giraffe], { ...PLAYER, position: { x: 500, z: 0 } });
  assert.equal(wolf.eco.target, null);
});

test('hungryPredator_canPickPlayer_whenCloserThanPrey', () => {
  const eco = make();
  const lion = animal('leao', 0, 0), zebra = animal('zebra', 30, 0);
  eco.register(lion); eco.register(zebra);
  lion.eco.needs.hunger = 0.9;
  eco.update(0.3, [lion, zebra], { ...PLAYER, position: { x: 5, z: 0 } });
  assert.equal(lion.eco.target, 'player');
});

test('farHunt_resolvedStatistically_emitsKill', () => {
  const eco = make();
  const lion = animal('leao', 0, 0), zebra = animal('zebra', 10, 0);
  eco.register(lion); eco.register(zebra);
  lion.eco.needs.hunger = 0.9;
  eco.update(0.3, [lion, zebra], { ...PLAYER, position: { x: 900, z: 0 } }); // escolhe a presa
  const ev = eco.update(0.3, [lion, zebra], { ...PLAYER, position: { x: 900, z: 0 } });
  assert.deepEqual(ev.map((e) => [e.type, e.predator, e.prey]), [['kill', lion, zebra]]);
});

test('nearHunt_isNotStatistical', () => {
  const eco = make();
  const lion = animal('leao', 0, 0), zebra = animal('zebra', 10, 0);
  eco.register(lion); eco.register(zebra);
  lion.eco.needs.hunger = 0.9;
  eco.update(0.3, [lion, zebra], { ...PLAYER, position: { x: 20, z: 30 } });
  const ev = eco.update(0.3, [lion, zebra], { ...PLAYER, position: { x: 20, z: 30 } });
  assert.equal(ev.length, 0);
});

test('feed_reducesHungerByPreySize_andClearsTarget', () => {
  const eco = make();
  const lion = animal('leao', 0, 0), zebra = animal('zebra', 10, 0);
  eco.register(lion); eco.register(zebra);
  lion.eco.needs.hunger = 0.9; lion.eco.target = zebra;
  eco.feed(lion, zebra);
  assert.ok(Math.abs(lion.eco.needs.hunger - 0.1) < 1e-9); // 80 de vida × 1/100
  assert.equal(lion.eco.target, null);
});
