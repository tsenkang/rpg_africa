import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CarcassSystem } from '../../../src/systems/fauna/CarcassSystem.js';
import { CARCASS, ECOSYSTEM } from '../../../src/config/ecosystem.js';

const LEVEL = { leao: 1, hiena: 2, corvo: 5, zebra: 4 };
function animal(speciesId, x, z, hunger = 0.8, extra = {}) {
  return { speciesId, alive: true, position: { x, z }, spec: { health: 80 },
    eco: { level: LEVEL[speciesId], predator: speciesId !== 'zebra' && speciesId !== 'corvo', needs: { hunger, energy: 1 }, target: null, threat: null }, ...extra };
}
const corpse = () => ({ speciesId: 'zebra', alive: false, position: { x: 0, z: 0 }, spec: { health: 80 } });
/** Coloca cada comedor no lugar que recebeu (como se tivesse andado até lá). */
const walk = (as) => { for (const a of as) if (a.eco.feedAt) { a.position.x = a.eco.feedAt.x; a.position.z = a.eco.feedAt.z; } };

test('hungryLion_nearCarcass_eatsAndHungerDrops', () => {
  const cs = new CarcassSystem(CARCASS, ECOSYSTEM);
  const z = corpse(), lion = animal('leao', 10, 0);
  const c = cs.add(z);
  cs.update(0.1, [lion, z]); walk([lion]);
  for (let i = 0; i < 10; i++) cs.update(0.5, [lion, z]);
  assert.ok(c.meat < c.max);
  assert.ok(lion.eco.needs.hunger < 0.8);
  assert.equal(lion.eco.feedAt.wait, false);
});

test('hyena_waitsWhileLionEats_thenEatsAlone', () => {
  const cs = new CarcassSystem(CARCASS, ECOSYSTEM);
  const z = corpse(), lion = animal('leao', 5, 0), hy = animal('hiena', 60, 0, 0.3);
  cs.add(z);
  cs.update(0.1, [lion, hy, z]);
  assert.equal(hy.eco.feedAt.wait, true);
  assert.ok(Math.hypot(hy.eco.feedAt.x, hy.eco.feedAt.z) >= CARCASS.waitRadius - 0.01);
  lion.eco.needs.hunger = 0; // saciado: sai da mesa
  cs.update(0.1, [lion, hy, z]);
  assert.equal(lion.eco.feedAt, null);
  assert.equal(hy.eco.feedAt.wait, false);
});

test('satedPredator_farScavenger_attractedBySmellOnly', () => {
  const cs = new CarcassSystem(CARCASS, ECOSYSTEM);
  const z = corpse(), lion = animal('leao', 60, 0, 0.05), crow = animal('corvo', 75, 0, 0.2);
  cs.add(z);
  cs.update(0.1, [lion, crow, z]);
  assert.equal(lion.eco.feedAt, null);
  assert.ok(crow.eco.feedAt);
});

test('carcass_decomposesAfterLifetime', () => {
  const cs = new CarcassSystem({ ...CARCASS, lifetime: 2 }, ECOSYSTEM);
  const z = corpse();
  cs.add(z);
  assert.equal(cs.update(1, [z]).length, 0);
  const gone = cs.update(1.5, [z]);
  assert.equal(gone.length, 1);
  assert.equal(cs.list.length, 0);
});

test('fleeingAnimal_isNotCalledToEat', () => {
  const cs = new CarcassSystem(CARCASS, ECOSYSTEM);
  const z = corpse(), hy = animal('hiena', 5, 0, 0.8);
  hy.eco.threat = {};
  cs.add(z);
  cs.update(0.1, [hy, z]);
  assert.equal(hy.eco.feedAt, null);
});

test('hungryLion_targetingPlayer_prefersCarcassNearby', () => {
  const cs = new CarcassSystem(CARCASS, ECOSYSTEM);
  const z = corpse(), lion = animal('leao', 5, 0, 0.9);
  lion.eco.target = 'player'; lion.eco.hunting = true;
  cs.add(z);
  cs.update(0.1, [lion, z]);
  assert.ok(lion.eco.feedAt);
  assert.equal(lion.eco.target, null);
  assert.equal(lion.eco.hunting, false);
});
