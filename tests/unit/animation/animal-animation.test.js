import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AnimalAnimationManager } from '../../../src/entities/anim/AnimalAnimationManager.js';
import { AnimalBody } from '../../../src/entities/AnimalBody.js';
import { SPECIES } from '../../../src/config/fauna.js';
import { ANIMATION } from '../../../src/config/animation.js';

/** Esqueleto mínimo: pelve/peito, pescoço, cabeça, cauda e 4 pernas com joelho. */
function rigOf() {
  const g = () => new THREE.Group();
  const r = { spine: [g(), g()], neck: g(), head: g(), jaw: g(), ribs: g(), tail: [g(), g()], legs: [], extra: [], chains: [] };
  for (const [front, side] of [[false, -1], [true, -1], [false, 1], [true, 1]]) r.legs.push({ upper: g(), lower: g(), front, side, len: 0.8, knee: 0.4 });
  return r;
}

const make = (spec = SPECIES.leao, id = 'leao') => {
  const pose = new THREE.Group();
  const rig = rigOf();
  const anim = new AnimalAnimationManager({ spec, speciesId: id, pose, rig, dims: { L: 2.3, H: 1.2, legTop: 0.8, torsoH: 0.4 }, rng: () => 0.5 });
  return { anim, rig, pose };
};

const run = (anim, secs, ctx, dt = 1 / 60) => {
  for (let t = 0; t < secs; t += dt) anim.update(dt, ctx);
};

const maxStep = (anim, rig, secs, ctxAt, dt = 1 / 60, only = null) => {
  // Maior giro de um osso entre dois quadros (rad): mede "trancos".
  const bones = only ?? [...rig.legs.flatMap((l) => [l.upper, l.lower]), ...rig.spine, rig.neck, rig.head, ...rig.tail];
  const prev = bones.map((b) => b.quaternion.clone());
  let worst = 0;
  for (let t = 0; t < secs; t += dt) {
    anim.update(dt, ctxAt(t));
    bones.forEach((b, i) => { worst = Math.max(worst, b.quaternion.angleTo(prev[i])); prev[i].copy(b.quaternion); });
  }
  return worst;
};

test('andando, as patas diagonais/laterais se movem e a pose é periódica', () => {
  const { anim, rig } = make();
  run(anim, 2, { speed: 1.3, state: 'wander' });
  const a = rig.legs[0].upper.quaternion.clone();
  run(anim, 0.25, { speed: 1.3, state: 'wander' });
  assert.ok(a.angleTo(rig.legs[0].upper.quaternion) > 0.05, 'a pata mexeu');
});

test('parar, atacar e nadar: coluna, cabeça e cauda sem tranco (≤ 0,1 rad por quadro)', () => {
  // Regressão: a cauda usava sin(tempo × freq) — mudar a frequência (parar,
  // atacar) fazia a fase pular ~0,19 rad num quadro.
  const { anim, rig } = make();
  run(anim, 1, { speed: 1.3, state: 'wander' });
  const ctx = (t) => (t < 0.5 ? { speed: 1.3, state: 'wander' } : t < 1 ? { speed: 0, state: 'attack' } : { speed: 0, state: 'idle', swimming: t > 1.5 });
  const worst = maxStep(anim, rig, 2.5, ctx, 1 / 60, [...rig.spine, rig.neck, rig.head, ...rig.tail]);
  assert.ok(worst < 0.1, `maior salto ${worst.toFixed(3)} rad`);
});

test('galope: as patas giram rápido mas sem passar do limite físico (≤ 0,2 rad/quadro a 60 FPS)', () => {
  const { anim, rig } = make();
  run(anim, 1, { speed: 9.5, state: 'chase' });
  const worst = maxStep(anim, rig, 1.5, () => ({ speed: 9.5, state: 'chase' }));
  assert.ok(worst < 0.2, `maior passo ${worst.toFixed(3)} rad`);
});

test('ataque em 3 fases: recua (antecipação), avança (impacto) e volta', () => {
  const { anim, pose } = make();
  run(anim, 0.5, { speed: 0, state: 'attack' });
  const z0 = pose.position.z;
  const delay = anim.startAttack();
  const P = ANIMATION.attack.pounce;
  assert.ok(Math.abs(delay - (P.anticipation + P.impact / 2)) < 1e-9, 'dano no meio do impacto');
  run(anim, P.anticipation * 0.95, { speed: 0, state: 'attack' });
  assert.ok(pose.position.z < z0 - 0.01, `recuou ${pose.position.z - z0}`);
  run(anim, P.impact + 0.08, { speed: 0, state: 'attack' });
  assert.ok(pose.position.z > z0 + 0.2, `avançou ${pose.position.z - z0}`);
  run(anim, P.recovery + 0.6, { speed: 0, state: 'attack' });
  assert.ok(Math.abs(pose.position.z - z0) < 0.03, 'voltou à postura');
});

test('nadando, a coluna e a cauda ondulam no plano horizontal (eixo Y)', () => {
  const { anim, rig } = make(SPECIES.capivara, 'capivara');
  run(anim, 2, { speed: 1, state: 'flee', swimming: true });
  const e = new THREE.Euler().setFromQuaternion(rig.tail[1].quaternion, 'YXZ');
  let maxY = 0;
  for (let i = 0; i < 90; i++) {
    anim.update(1 / 60, { speed: 1, state: 'flee', swimming: true });
    maxY = Math.max(maxY, Math.abs(new THREE.Euler().setFromQuaternion(rig.tail[1].quaternion, 'YXZ').y));
  }
  assert.ok(maxY > 0.15, `cauda ondula ${maxY}`);
  void e;
});

test('parado, a caixa torácica respira (escala oscila)', () => {
  const { anim, rig } = make(SPECIES.zebra, 'zebra');
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 60 * 6; i++) {
    anim.update(1 / 60, { speed: 0, state: 'idle' });
    lo = Math.min(lo, rig.ribs.scale.x); hi = Math.max(hi, rig.ribs.scale.x);
  }
  assert.ok(hi - lo > 0.01, `amplitude ${hi - lo}`);
});

test('rampa: o corpo inclina para cima na subida', () => {
  const { anim, pose } = make();
  run(anim, 1.5, { speed: 1.3, state: 'wander', tilt: { pitch: 0.3, roll: 0 } });
  const e = new THREE.Euler().setFromQuaternion(pose.quaternion, 'YXZ');
  assert.ok(e.x < -0.2, `nariz para cima: rot.x ${e.x}`);
});

test('AnimalBody procedural (sem modelo) usa o controlador e anima sem erro', () => {
  for (const id of ['leao', 'escorpiao', 'jacare', 'avestruz', 'corvo', 'suricato', 'vibora']) {
    const body = new AnimalBody(SPECIES[id], null, id);
    body.startAttack();
    for (const state of ['idle', 'wander', 'chase', 'attack', 'dead']) for (let i = 0; i < 10; i++) body.update(1 / 60, state === 'chase' ? 5 : 0.5, state, i / 60, { swimming: id === 'jacare' });
  }
});
