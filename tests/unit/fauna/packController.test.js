import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PackController } from '../../../src/systems/fauna/PackController.js';
import { PACKS } from '../../../src/config/ecosystem.js';

const RUN = { lobo: 11, zebra: 11 };
function animal(speciesId, group, x, z, eco = {}, extra = {}) {
  return { speciesId, group, alive: true, position: { x, z }, spec: { run: RUN[speciesId] ?? 8 }, eco: { level: speciesId === 'lobo' ? 2 : 4, target: null, threat: null, ...eco }, ...extra };
}

test('pack_newPrey_howlsOnceAndSplitsRoles', () => {
  const pc = new PackController(PACKS);
  const zebra = animal('zebra', 9, 30, 0);
  const wolves = [0, 1, 2, 3, 4].map((i) => animal('lobo', 1, 0, i * 2, { target: i === 0 ? zebra : null }));
  const ev1 = pc.update([...wolves, zebra]);
  assert.equal(ev1.filter((e) => e.type === 'howl').length, 1);
  assert.ok(wolves.every((w) => w.eco.target === zebra));
  const roles = wolves.map((w) => w.eco.role);
  assert.equal(roles[0], 'beater');
  assert.equal(roles.filter((r) => r === 'interceptor').length, 2);
  // Interceptador mira à frente da presa (na direção oposta ao líder: +x).
  const ic = wolves.find((w) => w.eco.role === 'interceptor').eco.intercept;
  assert.ok(ic.x > zebra.position.x);
  const ev2 = pc.update([...wolves, zebra]);
  assert.equal(ev2.filter((e) => e.type === 'howl').length, 0);
});

test('herd_threatSeenByOne_alarmsWholeHerdAndStampedesSameWay', () => {
  const pc = new PackController(PACKS);
  const lion = animal('leao', 7, -20, 0, { level: 1 });
  const herd = [0, 1, 2, 3].map((i) => animal('zebra', 2, i, 0));
  herd[3].eco.threat = lion;
  const ev = pc.update([...herd]);
  assert.ok(ev.some((e) => e.type === 'alarm'));
  assert.ok(ev.some((e) => e.type === 'stampede'));
  assert.ok(herd.every((z) => z.eco.threat === lion && z.eco.fleeDir != null));
  assert.equal(herd[0].eco.sentinel, true);
  // Rumo comum: para longe do leão (+x → ângulo ~ +π/2).
  for (const z of herd) assert.ok(Math.abs(z.eco.fleeDir - Math.PI / 2) <= PACKS.herd.stampedeSpread + 0.2);
});

test('herdWithYoung_againstWolfPack_formsDefensiveCircle', () => {
  const pc = new PackController(PACKS);
  const wolf = animal('lobo', 7, -20, 0, { level: 2 });
  const herd = [animal('zebra', 2, 0, 0), animal('zebra', 2, 1, 0), animal('zebra', 2, 0, 1), animal('zebra', 2, 1, 1, {}, { young: true })];
  herd[0].eco.threat = wolf;
  const ev = pc.update(herd);
  assert.ok(ev.some((e) => e.type === 'circle'));
  assert.ok(herd[3].eco.huddle && !herd[3].eco.circle);
  assert.ok(herd.slice(0, 3).every((z) => z.eco.circle));
});

test('herdWithYoung_againstLion_stampedesInstead', () => {
  const pc = new PackController(PACKS);
  const lion = animal('leao', 7, -20, 0, { level: 1 });
  const herd = [animal('zebra', 2, 0, 0), animal('zebra', 2, 1, 0), animal('zebra', 2, 1, 1, {}, { young: true })];
  herd[1].eco.threat = lion;
  pc.update(herd);
  assert.ok(herd.every((z) => !z.eco.circle && z.eco.fleeDir != null));
});
