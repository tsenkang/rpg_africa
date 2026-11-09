import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnimalBrain } from '../../../src/entities/AnimalBrain.js';
import { pickWeighted, groupSize } from '../../../src/systems/FaunaRules.js';

const FAUNA = { idleTime: [2, 2], wanderTime: [3, 3], fleeTime: 6, burrowSeconds: 1 };
const rng = () => 0.5;
const brain = (spec) => new AnimalBrain({ sense: 10, attackRange: 2, attackCooldown: 1, giveUp: 30, ...spec }, FAUNA, rng);
const ticks = (b, n, dist, dt = 0.1) => { let r; for (let i = 0; i < n; i++) r = b.tick(dt, dist); return r; };

test('idle → wander → idle quando o jogador está longe', () => {
  const b = brain({ behavior: 'flee' });
  assert.equal(b.state, 'idle');
  ticks(b, 21, 50);
  assert.equal(b.state, 'wander');
  ticks(b, 31, 50);
  assert.equal(b.state, 'idle');
});

test('medroso foge ao chegar perto e se acalma depois', () => {
  const b = brain({ behavior: 'flee' });
  b.tick(0.1, 5);
  assert.equal(b.state, 'flee');
  ticks(b, 61, 50);
  assert.equal(b.state, 'idle');
});

test('agressivo persegue, ataca no alcance com intervalo, desiste longe', () => {
  const b = brain({ behavior: 'aggressive' });
  b.tick(0.1, 8);
  assert.equal(b.state, 'chase');
  b.tick(0.1, 1.5);
  assert.equal(b.state, 'attack');
  const strikes = [];
  for (let i = 0; i < 25; i++) strikes.push(b.tick(0.1, 1.5).strike);
  assert.equal(strikes.filter(Boolean).length, 3, '1 golpe por segundo (2,5 s)');
  b.tick(0.1, 10);
  assert.equal(b.state, 'chase');
  b.tick(0.1, 40);
  assert.equal(b.state, 'idle');
});

test('furtivo: espreita, depois dá o bote', () => {
  const b = brain({ behavior: 'stalker', pounceRange: 6 });
  b.tick(0.1, 9);
  assert.equal(b.state, 'stalk');
  b.tick(0.1, 5);
  assert.equal(b.state, 'chase');
});

test('neutro ignora até apanhar; depois ataca e se acalma longe', () => {
  const b = brain({ behavior: 'neutral' });
  b.tick(0.1, 3);
  assert.notEqual(b.state, 'chase');
  b.hurt();
  assert.equal(b.state, 'chase');
  b.tick(0.1, 40);
  assert.equal(b.state, 'idle');
  assert.equal(b.angry, false);
  b.tick(0.1, 3);
  assert.notEqual(b.state, 'chase', 'calmo de novo');
});

test('bando: alerta faz o grupo perseguir; medroso ignora alerta', () => {
  const hiena = brain({ behavior: 'pack' });
  hiena.alert();
  assert.equal(hiena.state, 'chase');
  const zebra = brain({ behavior: 'flee' });
  zebra.alert();
  assert.equal(zebra.state, 'idle');
});

test('suricato foge e se enterra; corvo voa; os dois somem', () => {
  const s = brain({ behavior: 'burrow', burrowAfter: 1 });
  s.tick(0.1, 5);
  ticks(s, 11, 5); // 1,1 s > burrowAfter (10×0,1 ≠ 1 em ponto flutuante)
  assert.equal(s.state, 'burrow');
  ticks(s, 11, 5);
  assert.equal(s.gone, true);
  const c = brain({ behavior: 'fly' });
  c.tick(0.1, 5);
  assert.equal(c.state, 'fly');
  ticks(c, 31, 5);
  assert.equal(c.gone, true);
});

test('morto não reage', () => {
  const b = brain({ behavior: 'aggressive' });
  b.die();
  b.hurt();
  assert.equal(b.tick(0.1, 1).state, 'dead');
});

test('sorteio por peso e tamanho de grupo', () => {
  const t = { zebra: 3, leao: 1 };
  assert.equal(pickWeighted(t, 0), 'zebra');
  assert.equal(pickWeighted(t, 0.74), 'zebra');
  assert.equal(pickWeighted(t, 0.76), 'leao');
  assert.equal(pickWeighted({}, 0.5), null);
  assert.equal(groupSize([3, 5], 0), 3);
  assert.equal(groupSize([3, 5], 0.999), 5);
  assert.equal(groupSize([1, 1], 0.7), 1);
});
