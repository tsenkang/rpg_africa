import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoatPhysics, buildHullSamples } from '../../../src/systems/boat/BoatPhysics.js';
import { BOAT } from '../../../src/config/boat.js';

const calm = { water: () => ({ h: 0, vy: 0 }), ground: () => -50 };
const run = (boat, seconds, input, env, each) => { for (let t = 0; t < seconds; t += 1 / 60) { boat.update(1 / 60, input, typeof env === 'function' ? env(t) : env); each?.(t); } };
const deg = (r) => (r * 180) / Math.PI;

test('hullSamples_displaceTheDesignMass', () => {
  const s = buildHullSamples(BOAT);
  const V = s.reduce((a, p) => a + p.area * p.depth, 0);
  assert.ok(Math.abs(V * BOAT.rho - BOAT.mass) < 1);
  assert.equal(s.length, BOAT.samples.along * BOAT.samples.across);
});

test('calmWater_engineOff_floatsAtDesignWaterlineAndLevel', () => {
  const b = new BoatPhysics(BOAT, { y: 0.6 }); // solto 60 cm acima: cai e assenta
  run(b, 15, { throttle: 0, steer: 0 }, calm);
  const a = b.angles();
  assert.ok(Math.abs(b.position.y) < 0.03, `y = ${b.position.y.toFixed(3)}`);
  assert.ok(Math.abs(deg(a.pitch)) < 0.5 && Math.abs(deg(a.roll)) < 0.5, `pitch ${deg(a.pitch).toFixed(2)} roll ${deg(a.roll).toFixed(2)}`);
  assert.ok(b.v.length() < 0.02);
});

test('fullThrottle_accelerates_bowLifts_thenCoastsToStop', () => {
  const b = new BoatPhysics(BOAT);
  run(b, 40, { throttle: 1, steer: 0 }, calm);
  assert.ok(b.speed > 5 && b.speed < 12, `velocidade ${b.speed.toFixed(2)} m/s`);
  assert.ok(deg(b.angles().pitch) > 0.5, `trim ${deg(b.angles().pitch).toFixed(2)}°`);
  const v0 = b.speed;
  run(b, 20, { throttle: 0, steer: 0 }, calm);
  assert.ok(b.speed < v0 * 0.35 && b.speed >= -0.05, `depois de soltar: ${b.speed.toFixed(2)} m/s`);
  assert.ok(Math.abs(b.position.y) < 0.15); // continua boiando
});

test('steerPort_atSpeed_turnsLeft_andLosesSpeed', () => {
  const b = new BoatPhysics(BOAT);
  run(b, 25, { throttle: 1, steer: 0 }, calm);
  const straight = b.speed, yaw0 = b.angles().yaw;
  run(b, 6, { throttle: 1, steer: 1 }, calm);
  assert.ok(b.w.y > 0.05, `guinada ${b.w.y.toFixed(3)} rad/s`);
  assert.ok(b.angles().yaw !== yaw0);
  assert.ok(b.speed < straight * 0.97, 'perde velocidade na curva');
});

test('headSea_bowRisesOnCrest_andBoatFollowsWaveHeight', () => {
  // onda de 1,2 m de altura e 30 m vindo pela proa (+Z): h = A sin(kz + ωt)
  const A = 0.6, k = (2 * Math.PI) / 30, om = Math.sqrt(9.81 * k);
  const b = new BoatPhysics(BOAT);
  let t0 = 0, maxP = 0, minP = 0, maxY = -9, minY = 9;
  const env = () => ({ water: (x, z) => ({ h: A * Math.sin(k * z + om * t0), vy: A * om * Math.cos(k * z + om * t0) }), ground: () => -50 });
  run(b, 25, { throttle: 0, steer: 0 }, env, (t) => {
    t0 = t;
    if (t > 8) { const p = deg(b.angles().pitch); maxP = Math.max(maxP, p); minP = Math.min(minP, p); maxY = Math.max(maxY, b.position.y); minY = Math.min(minY, b.position.y); }
  });
  assert.ok(maxP > 2 && minP < -2, `pitch ${minP.toFixed(1)}..${maxP.toFixed(1)}°`);
  assert.ok(maxY - minY > A, `arfagem ${(maxY - minY).toFixed(2)} m`);
  assert.ok(minY > -A - 0.6, 'não afunda');
});

test('beamSea_rollsTheHull', () => {
  const A = 0.5, k = (2 * Math.PI) / 25, om = Math.sqrt(9.81 * k);
  const b = new BoatPhysics(BOAT);
  let t0 = 0, maxR = 0;
  const env = () => ({ water: (x) => ({ h: A * Math.sin(k * x + om * t0), vy: A * om * Math.cos(k * x + om * t0) }), ground: () => -50 });
  run(b, 20, { throttle: 0, steer: 0 }, env, (t) => { t0 = t; if (t > 6) maxR = Math.max(maxR, Math.abs(deg(b.angles().roll))); });
  assert.ok(maxR > 3, `roll ${maxR.toFixed(1)}°`);
  assert.ok(maxR < 35, 'não emborca');
});

test('shallowBottom_boatRestsOnGround_insteadOfSinking', () => {
  const b = new BoatPhysics(BOAT);
  const env = { water: () => ({ h: 0, vy: 0 }), ground: () => -0.15 }; // mais raso que o calado
  run(b, 8, { throttle: 0, steer: 0 }, env);
  assert.ok(b.grounded);
  assert.ok(b.position.y > -0.05, `y ${b.position.y.toFixed(3)}`);
  assert.ok(Number.isFinite(b.com.x));
});

test('heavierLoad_sitsDeeper_lighterSitsHigher', () => {
  const heavy = new BoatPhysics({ ...BOAT, mass: BOAT.designMass * 1.4 }), light = new BoatPhysics({ ...BOAT, mass: BOAT.designMass * 0.7 });
  run(heavy, 12, { throttle: 0, steer: 0 }, calm);
  run(light, 12, { throttle: 0, steer: 0 }, calm);
  assert.ok(heavy.position.y < -0.05, `pesado y ${heavy.position.y.toFixed(3)}`);
  assert.ok(light.position.y > 0.03, `leve y ${light.position.y.toFixed(3)}`);
});
