import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  damp, dampAngle, attackEnvelope, slopeTilt, twoBoneIK, legCycle, breathWave, smoothstep,
} from '../../../src/entities/anim/AnimMath.js';
import { ANIMATION } from '../../../src/config/animation.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('damp: independente do framerate (60 passos de 1/60 = 1 passo de 1 s)', () => {
  let a = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
  const b = damp(0, 1, 5, 1);
  assert.ok(near(a, b, 1e-9), `${a} vs ${b}`);
  assert.ok(b > 0.99 && b < 1);
});

test('dampAngle: vai pelo caminho mais curto (de 170° para -170° passa por 180°)', () => {
  const cur = (170 * Math.PI) / 180, target = (-170 * Math.PI) / 180;
  const next = dampAngle(cur, target, 10, 0.05);
  assert.ok(next > cur, 'deveria aumentar (passando por 180°), não voltar por 0°');
});

test('attackEnvelope: antecipação → impacto → recuperação, contínuo nas emendas', () => {
  const cfg = ANIMATION.attack.pounce;
  const { anticipation: a, impact: i, recovery: r } = cfg;
  assert.equal(attackEnvelope(0, cfg).phase, 'anticipation');
  assert.equal(attackEnvelope(a + i * 0.5, cfg).phase, 'impact');
  assert.equal(attackEnvelope(a + i + r * 0.5, cfg).phase, 'recovery');
  assert.equal(attackEnvelope(a + i + r + 0.01, cfg).phase, 'done');
  // Recua no fim da antecipação, não avança.
  const endWind = attackEnvelope(a - 1e-4, cfg);
  assert.ok(endWind.wind > 0.99 && endWind.lunge === 0);
  // Emendas sem salto (tolerância de um quadro).
  for (const t of [a, a + i, a + i + r]) {
    const x = attackEnvelope(t - 1e-4, cfg), y = attackEnvelope(t + 1e-4, cfg);
    assert.ok(Math.abs(x.wind - y.wind) < 0.02 && Math.abs(x.lunge - y.lunge) < 0.03, `salto em t=${t}`);
  }
  assert.ok(near(attackEnvelope(0, cfg).impactAt, a + i * 0.5));
});

test('slopeTilt: rampa subindo para +Z dá pitch positivo de frente e roll de lado', () => {
  const ramp = (x, z) => z * 0.5; // 26,6°
  const fwd = slopeTilt(ramp, 0, 0, 0, 1, 0.5);
  assert.ok(near(fwd.pitch, Math.atan(0.5)));
  assert.ok(near(fwd.roll, 0));
  const back = slopeTilt(ramp, 0, 0, Math.PI, 1, 0.5);
  assert.ok(near(back.pitch, -Math.atan(0.5)), 'de costas para a rampa = descida');
  // Virado para +X (yaw 90°): a rampa fica de lado. +X local aponta para -Z.
  const side = slopeTilt(ramp, 0, 0, Math.PI / 2, 1, 0.5);
  assert.ok(near(side.pitch, 0, 1e-9));
  assert.ok(near(side.roll, -Math.atan(0.5)));
  assert.deepEqual(slopeTilt(() => 3, 5, 5, 1, 1, 1), { pitch: 0, roll: 0 });
});

test('twoBoneIK: perna esticada não dobra; alvo mais perto dobra o joelho', () => {
  const straight = twoBoneIK(0.44, 0.42, 0.86);
  assert.ok(straight.knee < 0.05 && straight.hip < 0.05);
  const bent = twoBoneIK(0.44, 0.42, 0.7);
  assert.ok(bent.knee > 0.5, `joelho ${bent.knee}`);
  // A geometria fecha: distância quadril→tornozelo bate com o alvo.
  const hx = 0.44 * Math.sin(bent.hip), hy = -0.44 * Math.cos(bent.hip);
  const a2 = bent.hip - bent.knee;
  const fx = hx + 0.42 * Math.sin(a2), fy = hy - 0.42 * Math.cos(a2);
  assert.ok(near(Math.hypot(fx, fy), 0.7, 1e-6));
  assert.ok(near(fx, 0, 1e-6), 'pé logo abaixo do quadril');
});

test('legCycle: apoio linear (pata parada no chão) e balanço com a pata no ar', () => {
  const duty = 0.6;
  assert.deepEqual(legCycle(0, duty), { swing: 1, lift: 0 });
  const mid = legCycle(0.3, duty);
  assert.ok(near(mid.swing, 0) && mid.lift === 0);
  // Velocidade constante no apoio: a pata não escorrega.
  const d1 = legCycle(0.1, duty).swing - legCycle(0.2, duty).swing;
  const d2 = legCycle(0.4, duty).swing - legCycle(0.5, duty).swing;
  assert.ok(near(d1, d2));
  const air = legCycle(0.8, duty);
  assert.ok(air.lift > 0.99 && near(air.swing, 0, 1e-9));
  assert.ok(near(legCycle(0.9999, duty).swing, 1, 1e-3), 'fecha o ciclo na frente');
});

test('breathWave e smoothstep: dentro de [0, 1]', () => {
  for (let t = 0; t < 10; t += 0.07) {
    const b = breathWave(t, 0.3);
    assert.ok(b >= 0 && b <= 1);
  }
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
});
