import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VILLAGES } from '../../../src/config/villages.js';
import { helixSteps, bridgeCurve, pickNearest } from '../../../src/villages/Layout.js';
import { nearestCreatureDistance, paranormalTarget } from '../../../src/systems/WeatherSim.js';
import { PARANORMAL_FOG } from '../../../src/config/weather.js';

const BIOMES = ['taiga', 'deserto', 'tropical', 'kalahari', 'equatorial', 'preta'];
const W = 4096, D = 2304;
const pos = (v) => ({ x: (v.u - 0.5) * W, z: (v.v - 0.5) * D });

test('cada bioma novo tem seu assentamento, com lore', () => {
  for (const b of BIOMES) {
    const list = Object.values(VILLAGES).filter((v) => v.biome === b);
    assert.equal(list.length, 1, `bioma ${b}`);
    const lore = list[0].lore;
    assert.ok(lore?.speaker && lore.pages.length >= 2, `lore de ${list[0].id}`);
  }
  const ruins = Object.values(VILLAGES).filter((v) => v.abandoned);
  assert.deepEqual(ruins.map((v) => v.id), ['ruinasKaelen']);
  assert.equal(VILLAGES.ruinasKaelen.biome, 'preta');
  assert.equal(VILLAGES.ruinasKaelen.population, 0);
});

test('vilas dentro do mapa e sem se sobrepor', () => {
  const list = Object.values(VILLAGES);
  for (const v of list) {
    const p = pos(v);
    assert.ok(Math.abs(p.x) + v.radius < W / 2 && Math.abs(p.z) + v.radius < D / 2, `${v.id} fora do mapa`);
    assert.equal(v.id, Object.keys(VILLAGES).find((k) => VILLAGES[k] === v), 'id = chave');
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = pos(list[i]), b = pos(list[j]);
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > list[i].radius + list[j].radius + 60, `${list[i].id} × ${list[j].id}`);
    }
  }
});

test('helixSteps: sobe por igual, degraus de ~21 cm, girando em volta do tronco', () => {
  const s = helixSteps({ x: 5, z: -3, y0: 0.5, y1: 10.5, radius: 2 });
  assert.ok(Math.abs(s[0].y - 0.5) < 1e-9 && Math.abs(s.at(-1).y - 10.5) < 1e-9);
  for (let i = 1; i < s.length; i++) {
    const rise = s[i].y - s[i - 1].y;
    assert.ok(rise > 0 && rise <= 0.21 + 1e-9);
    assert.ok(Math.abs(Math.hypot(s[i].x - 5, s[i].z + 3) - 2) < 1e-9);
  }
});

test('bridgeCurve: começa e termina nos apoios e afunda `sag` no meio', () => {
  const a = { x: 0, y: 10, z: 0 }, b = { x: 20, y: 10, z: 0 };
  const p = bridgeCurve(a, b, 1.5, 10);
  assert.deepEqual(p[0], a);
  assert.deepEqual(p.at(-1), b);
  assert.ok(Math.abs(p[5].y - 8.5) < 1e-9);
  assert.ok(p.every((q) => q.y <= 10 + 1e-9));
});

test('pickNearest: as k fontes mais perto, em ordem, só dentro do alcance', () => {
  const src = [{ x: 50, z: 0 }, { x: 5, z: 0 }, { x: 200, z: 0 }, { x: 20, z: 0 }, { x: 1, z: 0 }];
  const out = new Int32Array(2);
  assert.equal(pickNearest(src, { x: 0, z: 0 }, 2, 100, out), 2);
  assert.deepEqual([...out], [4, 1]);
  assert.equal(pickNearest(src, { x: 1000, z: 0 }, 2, 100, out), 0);
  assert.equal(pickNearest(src, { x: Infinity, z: Infinity }, 2, 100, out), 0, 'subsolo');
});

test('presença com alcance: a névoa das ruínas começa bem antes', () => {
  const presence = [{ x: 0, z: 0, reach: 55 }];
  const far = PARANORMAL_FOG.radius + 55 + 5;
  assert.equal(paranormalTarget(nearestCreatureDistance({ x: far, z: 0 }, presence), PARANORMAL_FOG), 0);
  assert.ok(paranormalTarget(nearestCreatureDistance({ x: 60, z: 0 }, presence), PARANORMAL_FOG) > 0.3, 'entrando nas ruínas');
  assert.equal(paranormalTarget(nearestCreatureDistance({ x: 10, z: 0 }, presence), PARANORMAL_FOG), 1, 'no centro');
});
