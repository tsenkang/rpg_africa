import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body } from '../../../src/systems/Body.js';
import { Nutrition } from '../../../src/systems/Nutrition.js';
import { Survival } from '../../../src/systems/Survival.js';
import { PlayerState } from '../../../src/systems/PlayerState.js';
import { WOUNDS, INFECTION, NUTRITION, STAMINA, SANITY, DIRT, FOODS } from '../../../src/config/survival.js';

/** Aleatório fixo: sempre devolve `v`. */
const fixed = (v) => () => v;
const step = (s, secs, env = {}, dt = 0.5) => { let r; for (let t = 0; t < secs; t += dt) r = s.update(dt, env); return r; };

test('infectionChance_dirtySkin_adds80PercentPoints', () => {
  assert.equal(Body.infectionChance('curativo_folha', 0), INFECTION.base);
  assert.ok(Math.abs(Body.infectionChance('curativo_folha', 100) - (INFECTION.base + 0.8)) < 1e-9);
  assert.ok(Body.infectionChance('curativo_cinza', 100) < Body.infectionChance('curativo_folha', 100), 'cinza protege');
});

test('laceration_bandagedClean_stopsBleedingAndHeals', () => {
  const body = new Body({ rng: fixed(0.99) }); // nunca infecciona
  const w = body.addWound('laceracao', 'pernaE');
  assert.ok(body.update(1).hpPerSecond >= WOUNDS.laceracao.bleed);
  const r = body.treat(w.id, 'curativo_folha', { dirt: 0 });
  assert.equal(r.ok, true); assert.equal(r.infected, false);
  assert.equal(body.update(1).hpPerSecond, 0, 'enfaixada não sangra');
  for (let t = 0; t < WOUNDS.laceracao.healBandaged + 2; t++) body.update(1);
  assert.equal(body.wounds.length, 0, 'cicatrizou');
});

test('laceration_bandagedWhileDirty_turnsIntoInfectionAfterReveal', () => {
  const body = new Body({ rng: fixed(0.5) }); // 0,5 < 0,88 (pele 100% suja)
  const w = body.addWound('laceracao', 'bracoD');
  assert.equal(body.treat(w.id, 'curativo_folha', { dirt: 100 }).infected, true);
  for (let t = 0; t < INFECTION.revealAfter + 1; t++) body.update(1);
  assert.equal(w.type, 'infeccao');
  assert.ok(body.fever > 0, 'infecção dá febre');
});

test('infection_treatedWithMaggotsThenBandage_heals', () => {
  const body = new Body({ rng: fixed(0.99) });
  const w = body.addWound('infeccao', 'pernaD');
  assert.equal(body.treat(w.id, 'curativo_folha').ok, false, 'curativo direto não resolve infecção');
  assert.equal(body.treat(w.id, 'larvas_carne').action, 'clean');
  assert.equal(w.type, 'limpa');
  assert.equal(body.treat(w.id, 'curativo_cinza').ok, true);
  for (let t = 0; t < WOUNDS.limpa.healBandaged + 2; t++) body.update(1);
  assert.equal(body.wounds.length, 0);
});

test('openLaceration_neglected_infectsFasterWhenDirty', () => {
  const clean = new Body({ rng: fixed(0.99) }), dirty = new Body({ rng: fixed(0.99) });
  const a = clean.addWound('laceracao', 'pernaE'), b = dirty.addWound('laceracao', 'pernaE');
  const half = WOUNDS.laceracao.infectAfter * (1 - INFECTION.dirtSpeedup) + 1;
  for (let t = 0; t < half; t++) { clean.update(1, { dirt: 0 }); dirty.update(1, { dirt: 100 }); }
  assert.equal(a.type, 'laceracao');
  assert.equal(b.type, 'infeccao');
});

test('venom_onlyTobaccoOrLily_neutralizes', () => {
  const body = new Body({ rng: fixed(0.99) });
  const w = body.addWound('veneno', 'pernaE');
  assert.ok(body.update(1).hpPerSecond > 0.3);
  assert.equal(body.treat(w.id, 'curativo_folha').ok, false);
  assert.equal(body.treat(w.id, 'curativo_tabaco').action, 'antivenom');
  assert.equal(w.type, 'arranhao');
  assert.equal(body.fever, 0);
});

test('leech_pulledByHand_and_worm_needsBoneNeedle', () => {
  const body = new Body({ rng: fixed(0.99) });
  const leech = body.addWound('sanguessuga', 'pernaD');
  assert.equal(body.treat(leech.id, 'maos').action, 'pull');
  const worm = body.addWound('larva', 'bracoE');
  assert.equal(body.treat(worm.id, 'maos').ok, false);
  assert.equal(body.treat(worm.id, 'agulha_osso').action, 'extract');
});

test('worm_neglected_becomesInfection', () => {
  const body = new Body({ rng: fixed(0.99) });
  const worm = body.addWound('larva', 'bracoE');
  for (let t = 0; t < WOUNDS.larva.becomesAfter + 1; t++) body.update(1);
  assert.equal(worm.type, 'infeccao');
});

test('nutrition_drainsFasterSprintingAndWithParasites', () => {
  const calm = new Nutrition(), run = new Nutrition(), sick = new Nutrition();
  calm.update(60); run.update(60, { sprinting: true }); sick.update(60, { parasites: true });
  assert.ok(Math.abs(NUTRITION.start.water - calm.values.water - NUTRITION.drainPerMinute.water) < 1e-9);
  assert.ok(run.values.water < calm.values.water && run.values.carbs < calm.values.carbs);
  assert.ok(sick.values.proteins < calm.values.proteins);
  calm.eat(FOODS.castanha);
  assert.ok(calm.values.fats > run.values.fats);
});

test('survival_rawRiverWater_canGiveParasites_curedByGuanabana', () => {
  const s = new Survival({ state: new PlayerState(), rng: fixed(0.1) });
  s.consume('agua_rio');
  assert.ok(s.body.hasCondition('parasitas'));
  s.consume('guanabana');
  assert.ok(!s.body.hasCondition('parasitas'));
});

test('survival_sprintDrainsStamina_untilExhausted_thenRecovers', () => {
  const s = new Survival({ state: new PlayerState(), rng: fixed(0.99) });
  step(s, STAMINA.max / STAMINA.sprintDrainPerSecond + 1, { moving: true, sprinting: true });
  assert.equal(s.canSprint(), false);
  step(s, STAMINA.regenDelay + STAMINA.recoverThreshold / STAMINA.regenPerSecond + 1, { moving: true });
  assert.equal(s.canSprint(), true);
});

test('survival_dirt_risesInSandstorm_washedBySwimming', () => {
  const s = new Survival({ state: new PlayerState(), rng: fixed(0.99) });
  step(s, DIRT.dirtyWarning / DIRT.sandstormPerSecond + 2, { sand: 1 });
  assert.ok(s.dirt > DIRT.dirtyWarning);
  step(s, 3, { swimming: true, freshWater: false });
  assert.equal(s.dirt, 0);
});

test('survival_emptyWater_killsPlayer_withThirstMessage', () => {
  const state = new PlayerState();
  const s = new Survival({ state, rng: fixed(0.99) });
  s.nutrition.values.water = 0;
  const r = step(s, state.maxHealth / NUTRITION.emptyDamagePerSecond.water + 5);
  assert.equal(state.health, 0);
  assert.match(r.died, /sede/);
});

test('survival_lowProteinAndFat_drainSanity_andTriggerWhispers', () => {
  const s = new Survival({ state: new PlayerState(), rng: fixed(0.99) });
  s.nutrition.values.proteins = 1; s.nutrition.values.fats = 1;
  const whispers = [];
  s.on('whisper', (t) => whispers.push(t));
  s.sanity = 25; // nível 2 de alucinação (< 30): vozes
  step(s, 60);
  assert.ok(s.sanity < 25);
  assert.ok(whispers.length > 0);
});

test('survival_venomousSnake_alwaysLegs_andAlerts', () => {
  const s = new Survival({ state: new PlayerState(), rng: fixed(0.1) });
  const alerts = [];
  s.on('alert', (a) => alerts.push(a));
  const w = s.onAnimalHit('vibora');
  assert.equal(w.type, 'veneno');
  assert.ok(w.limb.startsWith('perna'));
  assert.equal(alerts[0].inspect, true);
});

test('survival_eatingTobacco_neutralizesVenom', () => {
  const s = new Survival({ state: new PlayerState(), rng: fixed(0.99) });
  const w = s.body.addWound('veneno', 'pernaE');
  s.consume('folha_tabaco');
  assert.equal(w.type, 'arranhao');
});
