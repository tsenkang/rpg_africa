import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Animal } from '../../../src/entities/Animal.js';
import { SPECIES, FAUNA } from '../../../src/config/fauna.js';
import { EcosystemManager } from '../../../src/systems/fauna/EcosystemManager.js';

const flat = () => 10;
const make = (id, x, z, yaw = 0) => {
  const a = new Animal({ spec: SPECIES[id], speciesId: id, fauna: FAUNA, x, z, groundAt: flat, rng: () => 0.5 });
  a.root.rotation.y = yaw; // 0 = olhando para +z
  return a;
};
const FAR = { x: 9999, y: 0, z: 9999 };

test('zebra_predatorRightBehind_rearKicks', () => {
  const eco = new EcosystemManager(undefined, { rng: () => 0.5 });
  const zebra = make('zebra', 0, 0, 0), lion = make('leao', 0, -1.6, 0);
  eco.register(zebra); eco.register(lion);
  zebra.eco.threat = lion;
  let kicked = null;
  for (let i = 0; i < 60 && !kicked; i++) {
    zebra.root.rotation.y = 0; // segura a frente para +z (leão fica atrás)
    kicked = zebra.update(1 / 30, FAR, false).kick;
  }
  assert.ok(kicked === lion, 'coice no leão');
});

test('giraffe_hurt_retaliatesInsteadOfFleeing', () => {
  const eco = new EcosystemManager(undefined, { rng: () => 0.5 });
  const g = make('girafa', 0, 0);
  eco.register(g);
  g.takeHit({ damage: 5, direction: { x: 0, z: 1 } });
  assert.equal(g.brain.state, 'chase');
  assert.ok(g.spec.damage > 0, 'girafa ganhou dano para revidar');
});

test('stunnedAnimal_doesNotMove', () => {
  const z = make('zebra', 0, 0);
  z.status.apply({ stun: 2 });
  z.brain.startFleeing();
  const x0 = z.position.x, z0 = z.position.z;
  for (let i = 0; i < 20; i++) z.update(1 / 30, { x: 0, y: 0, z: -3 }, true);
  assert.ok(Math.hypot(z.position.x - x0, z.position.z - z0) < 0.05);
});

test('wolf_chasing_approachesFromBehindVictim', () => {
  const eco = new EcosystemManager(undefined, { rng: () => 0.5 });
  const wolf = make('lobo', 0, 10), zebra = make('zebra', 0, 0, 0); // zebra olha para +z, lobo vem de frente
  eco.register(wolf); eco.register(zebra);
  wolf.eco.target = zebra; wolf.eco.needs.hunger = 0.9;
  wolf.brain.set('chase');
  for (let i = 0; i < 25; i++) { zebra.root.rotation.y = 0; zebra.update(1 / 30, FAR, false); wolf.update(1 / 30, FAR, false); }
  // Não foi reto para o focinho: desviou para o lado para contornar até as costas.
  assert.ok(Math.abs(wolf.position.x) > 0.5, `x=${wolf.position.x.toFixed(2)}`);
});

test('crocodile_onShore_walksSlowAndStaysNearWater', async () => {
  const { Animal } = await import('../../../src/entities/Animal.js');
  const { SPECIES, FAUNA } = await import('../../../src/config/fauna.js');
  // Água em x < 0 (fundo -2), terra plana em x >= 0 (altura 1).
  const groundAt = (x) => (x < 0 ? -2 : 1);
  const croc = new Animal({ spec: SPECIES.jacare, speciesId: 'jacare', x: 2, z: 0, groundAt, fauna: FAUNA, rng: () => 0.5 });
  assert.equal(croc.blocked(5, 0), false); // margem: pode
  assert.equal(croc.blocked(30, 0), true); // longe da água: não
  assert.equal(croc.blocked(-5, 0), false); // água: pode
});
