import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityAt, energyStep, tirednessOf } from '../../../src/systems/npc/Routine.js';
import { generatePopulation, familyOf } from '../../../src/systems/npc/Population.js';
import { buildLook } from '../../../src/systems/npc/NPCVisualBuilder.js';
import { mulberry32 } from '../../../src/world/Noise.js';
import { ENERGY, POPULATION } from '../../../src/config/npcLife.js';

const homes = (n) => Array.from({ length: n }, (_, i) => ({ id: `casa-${i}` }));

test('activityAt_followsDailyBlocks', () => {
  assert.equal(activityAt(6.5), 'WAKE');
  assert.equal(activityAt(9), 'WORK');
  assert.equal(activityAt(12.5), 'LUNCH');
  assert.equal(activityAt(15), 'WORK_PM');
  assert.equal(activityAt(19), 'LEISURE');
  assert.equal(activityAt(23), 'HOME');
  assert.equal(activityAt(3), 'HOME');
});

test('activityAt_childrenPlay_eldersRest_nightGuardsWorkAtNight', () => {
  assert.equal(activityAt(9, { age: 'child' }), 'PLAY');
  assert.equal(activityAt(15, { age: 'elder' }), 'REST');
  assert.equal(activityAt(2, { profession: 'guarda', shift: 'night' }), 'WORK');
  assert.equal(activityAt(11, { profession: 'guarda', shift: 'night' }), 'HOME', 'guarda da noite dorme de dia');
  assert.equal(activityAt(11, { profession: 'guarda', shift: 'day' }), 'WORK');
  assert.equal(activityAt(2, { profession: 'guarda', shift: 'day' }), 'HOME');
});

test('activityAt_jitterShiftsTransitions', () => {
  assert.equal(activityAt(7.6, { jitter: 0.3 }), 'WAKE', 'atrasado: ainda em casa');
  assert.equal(activityAt(7.4, { jitter: -0.3 }), 'WORK', 'adiantado: já no trabalho');
});

test('energy_dropsDuringWorkday_toTiredByEvening_andSleepRestores', () => {
  let e = 1;
  e = energyStep(e, 'WORK', 4.5);
  e = energyStep(e, 'WORK_PM', 4.5);
  assert.ok(e < ENERGY.tired, `energia ${e.toFixed(2)} depois de 9 h de trabalho`);
  assert.equal(tirednessOf(e), e < ENERGY.exhausted ? 'EXAUSTO' : 'CANSADO');
  assert.equal(energyStep(e, 'HOME', 1, true), 1);
});

test('population_familiesShareSurnameAndHome_namesUnique', () => {
  const people = generatePopulation({ villageId: 'v', biome: 'savana', homes: homes(30), rng: mulberry32(7) });
  assert.equal(people.length, POPULATION.perVillage);
  assert.equal(new Set(people.map((p) => p.fullName)).size, people.length, 'nomes completos únicos');
  const byFamily = new Map();
  for (const p of people) { if (!byFamily.has(p.familyId)) byFamily.set(p.familyId, []); byFamily.get(p.familyId).push(p); }
  for (const fam of byFamily.values()) {
    if (fam[0].profession === 'guarda') continue;
    assert.equal(new Set(fam.map((p) => p.last)).size, 1, 'mesmo sobrenome');
    assert.equal(new Set(fam.map((p) => p.homeId)).size, 1, 'mesma casa');
  }
  const head = people.find((p) => p.role === 'chefe' && p.spouseOf);
  assert.ok(familyOf(head, people).some((p) => p.id === head.spouseOf));
  assert.equal(people.filter((p) => p.profession === 'guarda').length, POPULATION.guards);
  assert.ok(people.filter((p) => p.age === 'child').every((p) => p.profession === null), 'criança não trabalha');
});

test('population_isDeterministic_andUsesRegionalNames', () => {
  const a = generatePopulation({ villageId: 'v', biome: 'taiga', homes: homes(20), rng: mulberry32(3) });
  const b = generatePopulation({ villageId: 'v', biome: 'taiga', homes: homes(20), rng: mulberry32(3) });
  assert.deepEqual(a.map((p) => p.fullName), b.map((p) => p.fullName));
  assert.ok(a.some((p) => /ov$|sen$|qvist$|strom$|Dahl/.test(p.last)), 'sobrenomes da Taiga');
  assert.ok(!a.some((p) => p.profession === 'pescador' && false));
});

test('visualBuilder_dressesByBiomeAndProfession', () => {
  const rng = mulberry32(11);
  const taiga = buildLook({ age: 'adult', sex: 'm', profession: 'agricultor' }, 'taiga', rng);
  assert.equal(taiga.hat, 'fur'); assert.ok(taiga.gloves && taiga.boots);
  const desert = Array.from({ length: 20 }, () => buildLook({ age: 'adult', sex: 'f', profession: 'mercador' }, 'deserto', rng));
  assert.ok(desert.filter((l) => l.robe).length > 10, 'linho/túnica na maioria');
  const guard = buildLook({ age: 'adult', sex: 'm', profession: 'guarda' }, 'savana', rng);
  assert.ok(guard.armor && guard.hat === 'helmet' && guard.accessory === 'spear');
  const smith = buildLook({ age: 'adult', sex: 'm', profession: 'ferreiro' }, 'savana', rng);
  assert.ok(smith.apron, 'avental do ferreiro');
  const kid = buildLook({ age: 'child', sex: 'f', profession: null }, 'taiga', rng);
  assert.ok(kid.height < 1.4 && !kid.cape);
});
