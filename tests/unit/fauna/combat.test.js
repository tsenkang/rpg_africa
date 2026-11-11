import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StatusEffects } from '../../../src/systems/fauna/StatusEffects.js';
import { flankPoint, isBehind, burstSpeed } from '../../../src/systems/fauna/AttackRules.js';
import { CombatAnimationSystem } from '../../../src/systems/fauna/CombatAnimationSystem.js';

test('status_stunPinSlowPoison_expireAndDealDamage', () => {
  const s = new StatusEffects();
  s.apply({ stun: 1, slow: { factor: 0.5, seconds: 2 }, poison: { dps: 3, seconds: 2 } });
  assert.equal(s.immobile, true);
  assert.equal(s.speedFactor, 0.5);
  let dmg = s.update(1.5);
  assert.ok(Math.abs(dmg - 4.5) < 1e-9);
  assert.equal(s.immobile, false); // atordoamento acabou
  dmg = s.update(1);
  assert.ok(Math.abs(dmg - 1.5) < 1e-9); // só o resto do veneno
  assert.equal(s.speedFactor, 1);
  assert.equal(s.poisoned, false);
});

test('status_reapplyKeepsStrongerAndLonger', () => {
  const s = new StatusEffects();
  s.apply({ slow: { factor: 0.7, seconds: 4 } });
  s.apply({ slow: { factor: 0.5, seconds: 1 } });
  assert.equal(s.speedFactor, 0.5);
  s.update(1.01);
  assert.equal(s.speedFactor, 0.7); // volta à lentidão mais fraca que ainda dura
});

test('flankPoint_isBehindVictim_offsetToSide', () => {
  // Vítima em (0,0) olhando para +z; lobo vindo de +x.
  const p = flankPoint({ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 10, z: 0 }, 2);
  assert.ok(p.z < 0, 'atrás');
  assert.ok(p.x > 0, 'do lado de onde o lobo vem');
});

test('isBehind_rearCone', () => {
  const me = { x: 0, z: 0 }, fwd = { x: 0, z: 1 };
  assert.equal(isBehind(me, fwd, { x: 0, z: -2 }, -0.35), true);
  assert.equal(isBehind(me, fwd, { x: 0, z: 2 }, -0.35), false);
  assert.equal(isBehind(me, fwd, { x: 2, z: 0 }, -0.35), false); // de lado não
});

test('burst_onlyCloseAndWithEnergy', () => {
  const b = { range: 14, mult: 1.4 };
  assert.equal(burstSpeed(10, 10, b, 1), 14);
  assert.equal(burstSpeed(10, 20, b, 1), 10);
  assert.equal(burstSpeed(10, 10, b, 0.1), 10); // exausto
});

/** Corpo falso: posição + vida + efeitos. */
const body = (x, z, hp = 100) => ({ position: { x, y: 0, z }, health: hp, alive: true, status: new StatusEffects() });

test('grapple_pinsVictim_dealsDps_followsVictim_endsOnTime', () => {
  const cas = new CombatAnimationSystem();
  const lion = body(0, 0), zebra = body(1.5, 0);
  const hits = [];
  cas.startGrapple(lion, zebra, { seconds: 2, dps: 10 }, { damage: (v, n) => hits.push(n) });
  assert.equal(zebra.status.immobile, true);
  cas.update(1, { damage: (v, n) => hits.push(n) });
  assert.equal(hits.reduce((a, b) => a + b, 0), 10);
  assert.ok(Math.hypot(lion.position.x - zebra.position.x, lion.position.z - zebra.position.z) < 1.2, 'agarrado à presa');
  cas.update(1.1, { damage: (v, n) => hits.push(n) });
  assert.equal(cas.grapples.length, 0);
});

test('grapple_deathRoll_dragsVictimTowardWater', () => {
  const cas = new CombatAnimationSystem();
  const croc = body(0, 0), cap = body(2, 0);
  cas.startGrapple(croc, cap, { seconds: 3, dps: 5, drag: 2 }, { waterDir: () => ({ x: -1, z: 0 }) });
  cas.update(1, { damage: () => {}, waterDir: () => ({ x: -1, z: 0 }) });
  assert.ok(cap.position.x < 2, 'puxada para a água');
});

test('grapple_attackerStunned_releases', () => {
  const cas = new CombatAnimationSystem();
  const lion = body(0, 0), giraffe = body(1, 0);
  cas.startGrapple(lion, giraffe, { seconds: 5, dps: 5 }, {});
  lion.status.apply({ stun: 2 }); // levou coice
  cas.update(0.1, { damage: () => {} });
  assert.equal(cas.grapples.length, 0);
  assert.equal(giraffe.status.pinned, false);
});
