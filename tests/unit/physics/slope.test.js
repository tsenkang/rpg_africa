import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceNormal, isUnwalkable, blockUphill, SlideState, steerAroundSlope, slopeAngleDeg } from '../../../src/systems/physics/SlopePhysics.js';

const CFG = { cosMax: Math.cos(Math.PI / 4), normalSample: 1, gravity: 20, friction: 0.35, maxSlideSpeed: 9, stopSpeed: 0.4, settle: 8, probeDist: 2, steerAngles: [0.5, 1, 1.5, 2] };
/** Rampa subindo para +x com inclinação `k` (tangente). */
const ramp = (k) => (x) => k * x;
/** Montanha só em x > 0 (subindo para +x, 63°); plano em x ≤ 0. */
const cliff = (x) => (x > 0 ? 2 * x : 0);

test('surfaceNormal_flat_isUp', () => {
  const n = surfaceNormal(() => 5, 0, 0, 1, {});
  assert.equal(n.y, 1);
  assert.ok(Math.abs(n.x) < 1e-12 && Math.abs(n.z) < 1e-12);
});

test('surfaceNormal_ramp_pointsDownhillHorizontally', () => {
  const n = surfaceNormal(ramp(1), 0, 0, 1, {}); // 45°
  assert.ok(Math.abs(n.y - Math.SQRT1_2) < 1e-9);
  assert.ok(n.x < 0); // descida é para −x
  assert.ok(Math.abs(slopeAngleDeg(n) - 45) < 1e-9);
});

test('isUnwalkable_thresholdAt45Degrees', () => {
  assert.equal(isUnwalkable(surfaceNormal(ramp(0.99), 0, 0, 1, {}), CFG.cosMax), false);
  assert.equal(isUnwalkable(surfaceNormal(ramp(1.01), 0, 0, 1, {}), CFG.cosMax), true);
  assert.equal(isUnwalkable(surfaceNormal(ramp(5.67), 0, 0, 1, {}), CFG.cosMax), true); // 80°
});

test('blockUphill_removesOnlyUphillComponent', () => {
  const n = surfaceNormal(ramp(2), 0, 0, 1, {});
  const up = blockUphill(1, 0, n, {}); // tentando subir direto
  assert.ok(Math.abs(up.dx) < 1e-9 && Math.abs(up.dz) < 1e-9);
  const diag = blockUphill(1, 1, n, {}); // subir na diagonal: sobra só o lado (contorno)
  assert.ok(Math.abs(diag.dx) < 1e-9 && Math.abs(diag.dz - 1) < 1e-9);
  const down = blockUphill(-1, 0, n, {}); // descer passa livre
  assert.equal(down.dx, -1);
});

test('slide_onSteep_acceleratesDownhill_capped', () => {
  const s = new SlideState();
  const n = surfaceNormal(ramp(2), 0, 0, 1, {});
  let d = s.update(0.1, n, true, CFG);
  assert.ok(d.dx < 0 && s.sliding);
  for (let i = 0; i < 100; i++) d = s.update(0.1, n, true, CFG);
  assert.ok(Math.hypot(s.vx, s.vz) <= CFG.maxSlideSpeed + 1e-9);
});

test('slide_reachesFlat_settlesAndStops', () => {
  const s = new SlideState();
  const steep = surfaceNormal(ramp(2), 0, 0, 1, {}), flat = { x: 0, y: 1, z: 0 };
  for (let i = 0; i < 10; i++) s.update(0.1, steep, true, CFG);
  for (let i = 0; i < 30; i++) s.update(0.1, flat, false, CFG);
  assert.equal(s.sliding, false);
  assert.equal(s.vx, 0);
});

test('steer_walkableAhead_keepsDirection', () => {
  const out = steerAroundSlope(() => 0, 0, 0, 1, 0, CFG, {});
  assert.deepEqual([out.x, out.z, out.blocked], [1, 0, false]);
});

test('steer_cliffAhead_turnsToContourInsteadOfClimbing', () => {
  // Indo para +x contra o paredão: deve virar para ±z (contornar), sem subir.
  const out = steerAroundSlope(cliff, -1, 0, 1, 0, CFG, {});
  assert.equal(out.blocked, false);
  assert.ok(out.x < 0.95, `ainda sobe: x=${out.x}`);
  assert.ok(Math.abs(out.z) > 0.3);
});

test('steer_goingDownSteep_isAllowed', () => {
  const out = steerAroundSlope(cliff, 3, 0, -1, 0, CFG, {});
  assert.deepEqual([out.x, out.z], [-1, 0]);
});

test('steer_allDirectionsUphillSteep_blocks', () => {
  // Fundo de um funil íngreme: tudo em volta sobe a 63°.
  const funnel = (x, z) => 2 * Math.hypot(x, z);
  const out = steerAroundSlope(funnel, 0.01, 0, 1, 0, { ...CFG, steerAngles: [0.5, 1] }, {});
  assert.equal(out.blocked, true);
});
