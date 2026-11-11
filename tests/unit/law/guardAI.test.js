import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuardAIController } from '../../../src/systems/law/GuardAI.js';

const CFG = {
  sight: { radius: 30, fovDot: 0.3, hearRadius: 3 }, recognizeSeconds: 3, closeRadius: 8, meterDecay: 0.5,
  chaseSpeed: 5, loseSeconds: 8, attackRange: 1.8, attackCooldown: 1.5, damage: 12,
  flankDist: 6, flankStopDist: 7, reinforceRadius: 60, investigatePause: 3,
};

/** Guarda falso em (x, z) olhando para +z. */
function guard(id, x, z, pair = 0, village = 'a') {
  return { id, pos: { x, y: 0, z }, yaw: 0, life: 'ALIVE', get down() { return this.life !== 'ALIVE'; }, indoors: false,
    person: { profession: 'guarda', patrolPair: pair }, village: { config: { id: village } }, reaction: null,
    react(kind, s, at, gesture = null, speed = null) { this.reaction = { kind, x: at.x, z: at.z, gesture, speed }; } };
}
function ctx(over = {}) {
  return { player: { x: 0, z: 20 }, playerDead: false, wanted: () => true, searchOf: () => null, rng: () => 0.5, ...over };
}

test('notWanted_guardIgnoresPlayer', () => {
  const g = guard('g', 0, 0), ai = new GuardAIController(CFG);
  const ev = ai.update(5, [g], ctx({ wanted: () => false }));
  assert.equal(ev.length, 0);
  assert.equal(ai.stateOf(g).mode, 'PATROL');
});

test('wantedInSight_recognizesAfterTime_thenWhistlesAndChases', () => {
  const g = guard('g', 0, 0), ai = new GuardAIController(CFG);
  let ev = ai.update(1, [g], ctx());
  assert.equal(ai.stateOf(g).mode, 'PATROL');
  assert.ok(ev.some((e) => e.type === 'suspect'));
  assert.equal(g.reaction.kind, 'FACE'); // encara enquanto confere
  ev = ai.update(2.1, [g], ctx());
  assert.equal(ai.stateOf(g).mode, 'CHASE');
  assert.ok(ev.some((e) => e.type === 'whistle' && e.guard === g));
});

test('closeRange_recognizesFaster', () => {
  const g = guard('g', 0, 0), ai = new GuardAIController(CFG);
  ai.update(1.6, [g], ctx({ player: { x: 0, z: 5 } }));
  assert.equal(ai.stateOf(g).mode, 'CHASE');
});

test('playerBehindGuard_noRecognition', () => {
  const g = guard('g', 0, 0), ai = new GuardAIController(CFG);
  ai.update(10, [g], ctx({ player: { x: 0, z: -20 } }));
  assert.equal(ai.stateOf(g).mode, 'PATROL');
});

test('alert_callsReinforcementsInRadius_sameVillageOnly', () => {
  const g1 = guard('g1', 0, 0, 0), g2 = guard('g2', 30, 0, 1), far = guard('g3', 500, 0, 2), other = guard('g4', 10, 0, 3, 'b');
  const ai = new GuardAIController(CFG);
  const ev = ai.alert(g1, ctx(), [g1, g2, far, other]);
  assert.equal(ai.stateOf(g2).mode, 'CHASE');
  assert.equal(ai.stateOf(far).mode, 'PATROL');
  assert.equal(ai.stateOf(other).mode, 'PATROL');
  assert.ok(ev.some((e) => e.type === 'whistle'));
});

test('chase_runsTowardPlayerAtChaseSpeed', () => {
  const g = guard('g', 0, 0), ai = new GuardAIController(CFG);
  ai.alert(g, ctx());
  ai.update(0.1, [g], ctx());
  assert.equal(g.reaction.kind, 'RUN_TO');
  assert.equal(g.reaction.speed, 5);
  assert.equal(g.reaction.z, 20);
});

test('chase_inRange_attacksWithCooldown', () => {
  const g = guard('g', 0, 0), ai = new GuardAIController(CFG);
  ai.alert(g, ctx());
  const near = ctx({ player: { x: 0, z: 1.5 } });
  let ev = ai.update(0.1, [g], near);
  assert.deepEqual(ev.filter((e) => e.type === 'attack').map((e) => e.damage), [12]);
  ev = ai.update(0.5, [g], near);
  assert.equal(ev.filter((e) => e.type === 'attack').length, 0); // recarga
  ev = ai.update(1.1, [g], near);
  assert.equal(ev.filter((e) => e.type === 'attack').length, 1);
});

test('pairChasing_partnerFlanksToTheSide', () => {
  const g1 = guard('g1', 0, 0, 0), g2 = guard('g2', 2, 0, 0);
  const ai = new GuardAIController(CFG);
  ai.alert(g1, ctx(), [g1, g2]);
  ai.update(0.1, [g1, g2], ctx());
  // Um vai direto (x = 0); o parceiro mira um ponto 6 m de lado.
  const xs = [g1.reaction.x, g2.reaction.x].map(Math.abs).sort((a, b) => a - b);
  assert.deepEqual(xs, [0, 6]);
});

test('chase_lostSight_goesInvestigateSearchArea', () => {
  const g = guard('g', 0, 0), ai = new GuardAIController(CFG);
  ai.alert(g, ctx());
  const hidden = ctx({ player: { x: 0, z: -100 }, searchOf: () => ({ x: 50, z: 50, r: 40 }) });
  ai.update(8.1, [g], hidden);
  assert.equal(ai.stateOf(g).mode, 'INVESTIGATE');
  ai.update(0.1, [g], hidden);
  assert.equal(g.reaction.kind, 'RUN_TO');
  assert.ok(Math.hypot(g.reaction.x - 50, g.reaction.z - 50) <= 40);
});

test('investigate_searchEnds_backToPatrol', () => {
  const g = guard('g', 0, 0), ai = new GuardAIController(CFG);
  ai.alert(g, ctx());
  ai.update(8.1, [g], ctx({ player: { x: 0, z: -100 }, searchOf: () => ({ x: 50, z: 50, r: 40 }) }));
  ai.update(0.1, [g], ctx({ player: { x: 0, z: -100 }, searchOf: () => null }));
  assert.equal(ai.stateOf(g).mode, 'PATROL');
});

test('guardDown_orPlayerDead_stopsChasing', () => {
  const g = guard('g', 0, 0), ai = new GuardAIController(CFG);
  ai.alert(g, ctx());
  const ev = ai.update(0.1, [g], ctx({ player: { x: 0, z: 1 }, playerDead: true }));
  assert.equal(ev.filter((e) => e.type === 'attack').length, 0);
  assert.equal(ai.stateOf(g).mode, 'PATROL');
  ai.alert(g, ctx());
  g.life = 'KNOCKED_OUT';
  assert.equal(ai.update(0.1, [g], ctx({ player: { x: 0, z: 1 } })).filter((e) => e.type === 'attack').length, 0);
});
