import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareRelief, reliefAt, mesaProfile, rangeProfile, distanceToPolyline } from '../../../src/world/Relief.js';
import { RELIEF, LANDMARKS } from '../../../src/config/landmarks.js';

/** Ruído constante: isola a forma das feições do ruído. */
const FLAT_NOISE = { fbm: () => 0, ridged: () => 0.5 };
const identity = (u, v) => ({ x: u * 1000, z: v * 1000 });

test('mesaProfile: topo plano, paredão e talude chegam a zero', () => {
  assert.equal(mesaProfile(0, 80), 1);
  assert.equal(mesaProfile(70, 80), 1);
  assert.ok(mesaProfile(85, 80) > 0.1 && mesaProfile(85, 80) < 0.9, 'paredão entre o topo e a base');
  assert.equal(mesaProfile(80 * 1.7, 80), 0);
});

test('rangeProfile: 1 na crista, 0 na largura e além', () => {
  assert.equal(rangeProfile(0, 200), 1);
  assert.equal(rangeProfile(200, 200), 0);
  assert.equal(rangeProfile(500, 200), 0);
  assert.ok(rangeProfile(50, 200) > rangeProfile(150, 200));
});

test('distanceToPolyline: mede até o segmento mais próximo', () => {
  const pts = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }];
  assert.equal(distanceToPolyline(pts, 50, 30), 30);
  assert.equal(distanceToPolyline(pts, 130, 50), 30);
  assert.equal(distanceToPolyline(pts, -40, 0), 40);
});

test('reliefAt: mesa soma a altura no centro e nada longe dela', () => {
  const f = prepareRelief([{ type: 'mesa', u: 0.5, v: 0.5, radius: 60, height: 40, seed: 1 }], identity);
  const top = reliefAt(f, FLAT_NOISE, 500, 500);
  assert.ok(Math.abs(top - 40) < 40 * 0.04, `topo ≈ 40 m (veio ${top})`);
  assert.equal(reliefAt(f, FLAT_NOISE, 900, 900), 0);
});

test('reliefAt: cordilheira sobe na crista e some fora da largura', () => {
  const f = prepareRelief([{ type: 'range', points: [[0.1, 0.5], [0.9, 0.5]], width: 150, height: 200, seed: 2 }], identity);
  const crest = reliefAt(f, FLAT_NOISE, 500, 500);
  assert.ok(crest > 150, `crista alta (veio ${crest})`);
  assert.ok(reliefAt(f, FLAT_NOISE, 500, 600) < crest);
  assert.equal(reliefAt(f, FLAT_NOISE, 500, 700), 0);
});

test('config: relevo e marcos ficam dentro do mapa e com campos obrigatórios', () => {
  const inMap = (u, v) => u >= 0 && u <= 1 && v >= 0 && v <= 1;
  for (const r of RELIEF) {
    if (r.type === 'range') r.points.forEach(([u, v]) => assert.ok(inMap(u, v)));
    else assert.ok(inMap(r.u, r.v) && r.radius > 0 && r.height > 0);
  }
  const ids = new Set();
  for (const l of LANDMARKS) {
    assert.ok(inMap(l.u, l.v), l.id);
    assert.ok(l.name && l.description && l.clear > 0, l.id);
    assert.ok(!ids.has(l.id), `id repetido: ${l.id}`);
    ids.add(l.id);
  }
});
