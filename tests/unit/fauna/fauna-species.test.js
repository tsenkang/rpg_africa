import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnimalBrain } from '../../../src/entities/AnimalBrain.js';
import { spawnTable } from '../../../src/systems/FaunaRules.js';
import { SPECIES, BIOME_FAUNA, GUARDIANS } from '../../../src/config/fauna.js';

const FAUNA = { idleTime: [2, 2], wanderTime: [3, 3], fleeTime: 6, burrowSeconds: 1 };
const rng = () => 0.5;
const brain = (id) => new AnimalBrain(SPECIES[id], FAUNA, rng);

test('pelo menos 3 espécies por bioma (cérbero entra como guardião da Floresta Preta)', () => {
  for (const [biome, table] of Object.entries(BIOME_FAUNA)) {
    const ids = new Set(Object.keys(table));
    for (const g of GUARDIANS) if (biome === 'preta') ids.add(g.species);
    assert.ok(ids.size >= 3, `${biome}: ${[...ids]}`);
    for (const id of ids) assert.ok(SPECIES[id], `${biome}: espécie ${id} existe`);
  }
});

test('passivo (camelo, girafa) ignora o jogador perto; foge se apanhar', () => {
  const b = brain('camelo');
  b.tick(0.1, 2);
  assert.notEqual(b.state, 'flee');
  assert.notEqual(b.state, 'chase');
  b.hurt();
  assert.equal(b.state, 'flee');
});

test('emboscada (víbora): parada até o jogador pisar perto, aí dá o bote', () => {
  const b = brain('vibora');
  b.tick(0.1, SPECIES.vibora.strikeRange + 1);
  assert.notEqual(b.state, 'chase');
  b.tick(0.1, SPECIES.vibora.strikeRange - 0.5);
  assert.equal(b.state, 'chase');
  b.tick(0.1, 1);
  assert.equal(b.state, 'attack');
});

test('territorial (urso): encara de longe, ataca dentro do território', () => {
  const b = brain('urso');
  b.tick(0.1, 15);
  assert.equal(b.state, 'threat');
  b.tick(0.1, SPECIES.urso.territory - 1);
  assert.equal(b.state, 'chase');
});

test('gorila provocado bate no peito antes de atacar', () => {
  const b = brain('gorila');
  b.hurt();
  assert.equal(b.state, 'threat');
  for (let t = 0; t < SPECIES.gorila.threat + 0.2; t += 0.1) b.tick(0.1, 5);
  assert.ok(b.state === 'chase' || b.state === 'attack');
});

test('guardião (cérbero): ataca no território, volta para casa quando o jogador sai', () => {
  const b = brain('cerbero');
  b.tick(0.1, 10, { fromHome: 20 });
  assert.equal(b.state, 'chase');
  b.tick(0.1, 30, { fromHome: SPECIES.cerbero.guardRadius + 5 });
  assert.equal(b.state, 'home');
  b.tick(0.1, 30, { fromHome: SPECIES.cerbero.guardRadius + 5, atHome: true });
  assert.equal(b.state, 'idle');
  b.tick(0.1, 10, { fromHome: SPECIES.cerbero.guardRadius + 30 });
  assert.equal(b.state, 'idle', 'fora do território: ignora');
});

test('arara: assustada sobe e voa em círculos (não some do mapa)', () => {
  const b = brain('arara');
  b.tick(0.1, 3);
  assert.equal(b.state, 'circle');
  for (let i = 0; i < 200; i++) b.tick(0.1, 100);
  assert.equal(b.gone, false);
});

test('spawnTable: na água só aquáticos (jacaré), em terra o resto', () => {
  assert.deepEqual(Object.keys(spawnTable(BIOME_FAUNA.equatorial, SPECIES, true)), ['jacare']);
  assert.ok(!('jacare' in spawnTable(BIOME_FAUNA.equatorial, SPECIES, false)));
  assert.deepEqual(spawnTable(BIOME_FAUNA.savana, SPECIES, true), {});
});
