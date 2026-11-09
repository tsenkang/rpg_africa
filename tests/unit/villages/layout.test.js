import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poissonAnnulus, faceStreet, nearestOnSegments, randInt } from '../../../src/villages/Layout.js';
import { wallHeight } from '../../../src/villages/Builders.js';
import { BUILDING_SCALE } from '../../../src/config/settlements.js';
import { mulberry32 } from '../../../src/world/Noise.js';

const OPTS = { cx: 100, cz: -40, inner: 50, outer: 200, spacing: 13 };

test('poissonAnnulus: nenhum par mais perto que spacing', () => {
  const pts = poissonAnnulus({ ...OPTS, rng: mulberry32(1) });
  assert.ok(pts.length > 100, `poucas casas: ${pts.length}`);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) >= OPTS.spacing - 1e-9);
    }
  }
});

test('poissonAnnulus: tudo dentro do anel e o anel fica bem preenchido', () => {
  const pts = poissonAnnulus({ ...OPTS, rng: mulberry32(2) });
  for (const p of pts) {
    const r = Math.hypot(p.x - OPTS.cx, p.z - OPTS.cz);
    assert.ok(r >= OPTS.inner - 1e-9 && r <= OPTS.outer + 1e-9);
  }
  // Densidade de Poisson Disk ≈ 0,55–0,7 pontos por (spacing²) de área
  const area = Math.PI * (OPTS.outer ** 2 - OPTS.inner ** 2);
  const ideal = area / (OPTS.spacing ** 2);
  assert.ok(pts.length > ideal * 0.45, `preenchimento baixo: ${pts.length} de ~${Math.round(ideal)}`);
});

test('poissonAnnulus: não é grade (ângulos e raios variados) e é determinístico', () => {
  const a = poissonAnnulus({ ...OPTS, rng: mulberry32(3) });
  const b = poissonAnnulus({ ...OPTS, rng: mulberry32(3) });
  assert.deepEqual(a, b);
  const radii = new Set(a.map((p) => Math.round(Math.hypot(p.x - OPTS.cx, p.z - OPTS.cz))));
  // O layout antigo usava ~12 anéis fixos (±1,5 m): no máximo ~40 raios distintos.
  assert.ok(radii.size > 100, `raios variados (não são anéis fixos): ${radii.size}`);
});

test('poissonAnnulus: respeita o filtro (ruas/praças)', () => {
  const pts = poissonAnnulus({ ...OPTS, rng: mulberry32(4), accept: (x) => x > OPTS.cx });
  assert.ok(pts.every((p) => p.x > OPTS.cx));
});

test('faceStreet: frente (+Z local) aponta para a rua mais próxima', () => {
  const streets = [{ ax: -50, az: 0, bx: 50, bz: 0 }]; // rua ao longo do eixo x
  const { rot, street } = faceStreet(10, 12, { streets, cx: 0, cz: 0, reach: 30, jitter: 0, rng: () => 0.5 });
  assert.ok(street && Math.abs(street.dist - 12) < 1e-9);
  // frente = (sin rot, cos rot) deve apontar para −z (a rua)
  assert.ok(Math.abs(Math.sin(rot)) < 1e-9 && Math.cos(rot) < -0.999);
});

test('faceStreet: longe das ruas olha para o centro; jitter fica no limite', () => {
  const streets = [{ ax: 500, az: 500, bx: 600, bz: 500 }];
  const { rot, street } = faceStreet(0, 20, { streets, cx: 0, cz: 0, reach: 30, jitter: 0, rng: () => 0.5 });
  assert.equal(street, null);
  assert.ok(Math.cos(rot) < -0.999, 'centro está em −z');
  for (const r of [0, 0.25, 0.999]) {
    const j = faceStreet(0, 20, { streets, cx: 0, cz: 0, reach: 30, jitter: 0.3, rng: () => r }).rot;
    assert.ok(Math.abs(j - Math.PI) <= 0.3 + 1e-9 || Math.abs(j + Math.PI) <= 0.3 + 1e-9);
  }
});

test('nearestOnSegments e randInt', () => {
  const p = nearestOnSegments(5, 5, [{ ax: 0, az: 0, bx: 10, bz: 0 }, { ax: 0, az: 9, bx: 10, bz: 9 }]);
  assert.deepEqual({ x: p.x, z: p.z }, { x: 5, z: 9 });
  assert.equal(nearestOnSegments(0, 0, []), null);
  const rng = mulberry32(5);
  for (let i = 0; i < 200; i++) { const v = randInt([1, 3], rng); assert.ok(v >= 1 && v <= 3 && Number.isInteger(v)); }
});

test('escala: casa térrea ≥ 3,4 m de parede (≥ 5 m com telhado); porta não escala', () => {
  assert.ok(wallHeight(2.4) >= BUILDING_SCALE.minWallHeight);
  assert.equal(wallHeight(2.6), Math.max(BUILDING_SCALE.minWallHeight, 2.6 * BUILDING_SCALE.wallHeightMul));
  assert.ok(wallHeight(3.4) > 3.4, 'casas altas também crescem');
  // personagem 1,8 m: a parede é quase 2× a altura dele
  assert.ok(wallHeight(2.8) / 1.8 > 1.85);
});
