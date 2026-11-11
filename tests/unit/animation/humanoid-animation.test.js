import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Humanoid } from '../../../src/entities/Humanoid.js';

const joints = (h) => h.joints;

/** Maior giro de junta entre dois quadros (rad) ao longo de `frames`. */
function worstStep(h, frames, stateAt, dt = 1 / 60) {
  const prev = joints(h).map((j) => j.quaternion.clone());
  let worst = 0;
  for (let f = 0; f < frames; f++) {
    const [speed, opts] = stateAt(f);
    h.update(dt, speed, opts);
    joints(h).forEach((j, i) => { worst = Math.max(worst, j.quaternion.angleTo(prev[i])); prev[i].copy(j.quaternion); });
  }
  return worst;
}

test('Humanoid: entrar e sair da água é um crossfade (sem salto de pose)', () => {
  const h = new Humanoid({ mergeParts: false });
  const worst = worstStep(h, 240, (f) => (f < 60 ? [1.4, {}] : f < 150 ? [1, { swimming: true }] : [0, {}]));
  assert.ok(worst < 0.2, `maior salto ${worst.toFixed(3)} rad`);
});

test('Humanoid: nadando em crawl o corpo fica deitado; parado na água fica em pé', () => {
  const h = new Humanoid({ mergeParts: false });
  for (let i = 0; i < 180; i++) h.update(1 / 60, 1.2, { swimming: true });
  assert.ok(h.body.rotation.x > 1.1, `crawl: pitch ${h.body.rotation.x}`);
  for (let i = 0; i < 240; i++) h.update(1 / 60, 0, { swimming: true });
  assert.ok(h.body.rotation.x < 0.4, `boiando: pitch ${h.body.rotation.x}`);
});

test('Humanoid: braço do crawl dá a volta completa sem salto (moinho por quatérnio)', () => {
  const h = new Humanoid({ mergeParts: false });
  for (let i = 0; i < 200; i++) h.update(1 / 60, 1.2, { swimming: true });
  const prev = h.arms[0].quaternion.clone();
  let worst = 0;
  for (let i = 0; i < 240; i++) {
    h.update(1 / 60, 1.2, { swimming: true });
    worst = Math.max(worst, h.arms[0].quaternion.angleTo(prev));
    prev.copy(h.arms[0].quaternion);
  }
  assert.ok(worst < 0.15, `maior passo do ombro ${worst}`);
});

test('Humanoid: em rampa o pé de cima dobra o joelho (IK) e a pelve desce no pé de baixo', () => {
  const flat = new Humanoid({ mergeParts: false });
  const slope = new Humanoid({ mergeParts: false });
  // Chão inclinado de lado: +X mais alto. Raiz no chão do centro.
  const ground = (x) => x * 0.6;
  for (let i = 0; i < 120; i++) {
    flat.update(1 / 60, 0, { ground: () => 0 });
    slope.update(1 / 60, 0, { ground });
  }
  // legs[0] fica em -X local; com yaw 0, -X local = -X mundo (mais baixo).
  assert.ok(slope.knees[1].rotation.x > flat.knees[1].rotation.x + 0.15, 'joelho do lado alto dobra');
  assert.ok(slope.body.position.y < flat.body.position.y - 0.03, 'pelve desce');
});

test('Humanoid: parado respira (peito) e o soco continua nítido', () => {
  const h = new Humanoid({ mergeParts: false });
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 400; i++) {
    h.update(1 / 60, 0);
    lo = Math.min(lo, h.chest.scale.y); hi = Math.max(hi, h.chest.scale.y);
  }
  assert.ok(hi - lo > 0.01);
  h.punch(0.3);
  const start = h.arms[1].quaternion.clone();
  for (let i = 0; i < 10; i++) h.update(1 / 60, 0);
  assert.ok(h.arms[1].quaternion.angleTo(start) > 0.6, 'braço chegou longe em 1/6 s');
});
