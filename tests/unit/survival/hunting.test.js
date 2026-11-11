import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Projectiles, classifyZone, zoneDamage } from '../../../src/systems/Projectiles.js';
import { Resources } from '../../../src/systems/Resources.js';
import { Skinning, lootFor } from '../../../src/systems/Skinning.js';
import { WEAPONS, SKINNING, COOKING } from '../../../src/config/hunting.js';
import { RESOURCES } from '../../../src/config/resources.js';
import { ITEM_CATALOG } from '../../../src/config/items.js';
import { PROP_TYPES } from '../../../src/config/physics.js';
import { FOODS } from '../../../src/config/survival.js';

const flat = () => 0;

test('projectile_flightIsBallistic_andLandsOnGround', () => {
  const pr = new Projectiles();
  const p = pr.launch({ weapon: 'lanca_pedra', item: 'lanca_pedra', x: 0, y: 1.5, z: 0, dx: 0, dy: 0, dz: 1 });
  let events = [];
  for (let i = 0; i < 600 && !events.length; i++) events = pr.step(1 / 60, { groundAt: flat, hitTest: () => null });
  assert.equal(events.length, 1);
  assert.equal(p.landed, true);
  assert.ok(p.pos.z > 8 && p.pos.z < 30, `alcance ${p.pos.z.toFixed(1)} m`);
  assert.equal(pr.nearestLanded({ x: p.pos.x, z: p.pos.z }), p);
  assert.equal(pr.nearestLanded({ x: p.pos.x + 10, z: p.pos.z }), null);
});

test('projectile_hitTestStopsFlight_andDropsAtAnimalFeet', () => {
  const pr = new Projectiles();
  pr.launch({ weapon: 'arco', item: 'flecha', x: 0, y: 1.5, z: 0, dx: 0, dy: 0, dz: 1 });
  const animal = { name: 'zebra' };
  const events = pr.step(0.1, { groundAt: () => 2, hitTest: (a, b) => (b.z > 2 ? { animal, zone: 'head', point: { x: 0, y: 1.8, z: 3 } } : null) });
  assert.equal(events[0].hit.animal, animal);
  assert.equal(events[0].p.pos.y, 2, 'cai no chão sob o animal');
});

test('classifyZone_headFrontTop_legsBottom_bodyElse', () => {
  const c = { x: 0, y: 1, z: 0 }, s = { x: 1, y: 1, z: 2 };
  assert.equal(classifyZone({ x: 0, y: 1.3, z: 0.8 }, c, s), 'head');
  assert.equal(classifyZone({ x: 0, y: 0.6, z: 0.8 }, c, s), 'legs', 'frente mas embaixo = pernas');
  assert.equal(classifyZone({ x: 0, y: 1.1, z: -0.5 }, c, s), 'body');
  assert.equal(classifyZone({ x: 0, y: 1.3, z: -0.8 }, c, s), 'body', 'alto atrás = corpo');
});

test('zoneDamage_headIsInstantKill_legsReduced', () => {
  assert.equal(zoneDamage('lanca_pedra', 'head'), Infinity);
  assert.equal(zoneDamage('lanca_pedra', 'body'), WEAPONS.lanca_pedra.damage);
  assert.ok(zoneDamage('arco', 'legs') < WEAPONS.arco.damage);
});

test('resources_generationIsDeterministic_respectsBiomeAndWater', () => {
  const mk = () => new Resources({ seed: 7, biomeAt: () => 'taiga', groundAt: (x, z) => (x < 0 ? -5 : 3), waterLevel: 0 });
  const a = mk(), b = mk();
  a.update({ x: 10, z: 10 }, 0); b.update({ x: 10, z: 10 }, 0);
  assert.deepEqual(a.visible().map((n) => n.id + n.type), b.visible().map((n) => n.id + n.type));
  assert.ok(a.visible().length > 10);
  for (const n of a.visible()) {
    assert.ok(n.x >= 0, 'nada debaixo d\'água');
    const t = RESOURCES.types[n.type];
    assert.ok(t.biomes === 'all' || t.biomes.includes('taiga'), `${n.type} não é da taiga`);
    assert.ok(!t.water, 'lírio só na margem');
  }
});

test('resources_harvestHidesNode_untilRespawn', () => {
  const r = new Resources({ seed: 1, biomeAt: () => 'savana', groundAt: () => 5, waterLevel: 0 });
  r.update({ x: 0, z: 0 }, 0);
  const node = r.visible()[0];
  const got = r.harvest(node, 0, () => 0.99);
  assert.equal(got.item, RESOURCES.types[node.type].item);
  assert.equal(got.n, RESOURCES.types[node.type].n[1]);
  assert.ok(!r.visible().includes(node));
  r.update({ x: 0, z: 0 }, RESOURCES.respawnSeconds + 1);
  assert.ok(r.visible().includes(node), 'renasceu');
});

test('resources_nearestWithinReach', () => {
  const r = new Resources({ seed: 1, biomeAt: () => 'savana', groundAt: () => 5, waterLevel: 0 });
  r.update({ x: 0, z: 0 }, 0);
  const n = r.visible()[0];
  assert.equal(r.nearest({ x: n.x + 1, z: n.z }), n);
  assert.equal(r.nearest({ x: n.x + 1, z: n.z }, 0.5), null);
});

test('skinning_holdNeedsContinuousPress_andKnife', () => {
  const sk = new Skinning();
  const corpse = {};
  for (let t = 0; t < SKINNING.holdSeconds * 0.5; t += 0.1) assert.equal(sk.hold(0.1, true, corpse), false);
  sk.hold(0.1, false, corpse);
  assert.equal(sk.progress, 0, 'soltou: volta a zero');
  let done = false;
  for (let t = 0; t < SKINNING.holdSeconds + 0.3 && !done; t += 0.1) done = sk.hold(0.1, true, corpse);
  assert.equal(done, true);
  assert.equal(Skinning.hasKnife('faca_osso'), true);
  assert.equal(Skinning.hasKnife('lanca_pedra'), false);
});

test('lootFor_bySizeAndBirds', () => {
  assert.deepEqual(lootFor({ size: 0.3 }), SKINNING.loot.small);
  assert.deepEqual(lootFor({ size: 1.0 }), SKINNING.loot.medium);
  assert.deepEqual(lootFor({ size: 1.9 }), SKINNING.loot.large);
  assert.deepEqual(lootFor({ size: 0.4, model: 'bird' }), SKINNING.loot.bird);
});

test('config_lootPropsAndCookingAndResourcesReferToExistingItems', () => {
  for (const loot of Object.values(SKINNING.loot)) for (const type of Object.keys(loot)) {
    assert.ok(PROP_TYPES[type]?.item, `prop ${type} sem item`);
    assert.ok(ITEM_CATALOG[PROP_TYPES[type].item], `item ${PROP_TYPES[type].item} não existe`);
  }
  for (const [a, b] of Object.entries(COOKING.recipes)) assert.ok(ITEM_CATALOG[a] && ITEM_CATALOG[b] && FOODS[b], `${a}→${b}`);
  for (const [id, t] of Object.entries(RESOURCES.types)) {
    assert.ok(ITEM_CATALOG[t.item], `${id}: item ${t.item}`);
    if (t.also) assert.ok(ITEM_CATALOG[t.also]);
  }
  for (const w of Object.keys(WEAPONS)) assert.ok(ITEM_CATALOG[w]?.hotbar, `${w} precisa ser da hotbar`);
});
