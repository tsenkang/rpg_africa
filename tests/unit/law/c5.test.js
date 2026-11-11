import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HunterDirector, ambushPoint, hunterStep } from '../../../src/systems/law/Hunters.js';
import { payQuote } from '../../../src/systems/law/Redemption.js';
import { grudgeReaction } from '../../../src/systems/law/Grudge.js';

const HCFG = { threshold: 1000, firstDelay: 10, interval: [60, 60], chance: 1, maxGroups: 1, spawnDist: 40, behindArc: [100, 260], speed: 5.5, attackRange: 1.8, attackCooldown: 1.2, damage: 10 };
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('director_belowThreshold_neverSpawns', () => {
  const d = new HunterDirector(HCFG);
  assert.equal(d.update(100, { totalBounty: 999, onRoad: true, groupsAlive: 0 }, () => 0), false);
});

test('director_inVillage_doesNotCountDown', () => {
  const d = new HunterDirector(HCFG);
  d.update(100, { totalBounty: 1000, onRoad: false, groupsAlive: 0 }, () => 0);
  assert.equal(d.update(5, { totalBounty: 1000, onRoad: true, groupsAlive: 0 }, () => 0), false); // ainda faltam 5 s
  assert.equal(d.update(5.1, { totalBounty: 1000, onRoad: true, groupsAlive: 0 }, () => 0), true);
});

test('director_afterSpawn_waitsIntervalAndRespectsMaxGroups', () => {
  const d = new HunterDirector(HCFG);
  const ctx = { totalBounty: 1500, onRoad: true, groupsAlive: 0 };
  assert.equal(d.update(11, ctx, () => 0), true);
  assert.equal(d.update(59, ctx, () => 0), false);
  assert.equal(d.update(2, { ...ctx, groupsAlive: 1 }, () => 0), false); // já tem um grupo: contador parado
  assert.equal(d.update(0.5, ctx, () => 0), false); // faltava 1 s
  assert.equal(d.update(0.6, ctx, () => 0), true);
});

test('ambushPoint_isBehindPlayerAtSpawnDistance', () => {
  // Olhando para +z; 180° = bem atrás.
  const p = ambushPoint({ x: 0, z: 0 }, { x: 0, z: 1 }, seq(0.5), HCFG);
  assert.ok(Math.abs(Math.hypot(p.x, p.z) - 40) < 1e-6);
  assert.ok(p.z < -39);
});

test('hunterStep_farAway_movesTowardPlayer', () => {
  const h = { pos: { x: 0, z: 0 }, cd: 0 };
  const r = hunterStep(h, { x: 10, z: 0 }, 1, HCFG);
  assert.equal(r.attack, false);
  assert.ok(Math.abs(r.dx - 5.5) < 1e-9 && r.dz === 0);
});

test('hunterStep_inRange_attacksWithCooldown', () => {
  const h = { pos: { x: 0, z: 0 }, cd: 0 };
  assert.equal(hunterStep(h, { x: 1, z: 0 }, 0.1, HCFG).attack, true);
  assert.equal(hunterStep(h, { x: 1, z: 0 }, 0.5, HCFG).attack, false);
  assert.equal(hunterStep(h, { x: 1, z: 0 }, 0.8, HCFG).attack, true);
});

test('payQuote_states', () => {
  assert.deepEqual(payQuote(0, { chasing: false, coins: 50 }), { ok: false, cost: 0, reason: 'limpa' });
  assert.deepEqual(payQuote(350, { chasing: true, coins: 999 }), { ok: false, cost: 350, reason: 'combate' });
  assert.deepEqual(payQuote(350, { chasing: false, coins: 100 }), { ok: false, cost: 350, reason: 'moedas' });
  assert.deepEqual(payQuote(350, { chasing: false, coins: 400 }), { ok: true, cost: 350, reason: null });
});

const GCFG = { callGuardChance: 0.5 };
test('grudge_noMemory_null', () => {
  assert.equal(grudgeReaction({}, { wanted: true }, () => 0, GCFG), null);
});

test('grudge_relativeOfVictim_notWanted_flees', () => {
  assert.equal(grudgeReaction({ parente_morto: true }, { wanted: false }, () => 0, GCFG), 'flee');
});

test('grudge_relativeOfVictim_wanted_callsGuardOrFlees', () => {
  assert.equal(grudgeReaction({ parente_agredido: true }, { wanted: true }, () => 0.2, GCFG), 'call_guard');
  assert.equal(grudgeReaction({ parente_agredido: true }, { wanted: true }, () => 0.8, GCFG), 'flee');
});
