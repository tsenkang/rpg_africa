import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NPCAgent } from '../../../src/entities/NPCAgent.js';

/** Morador mínimo (sem cena): casa na origem, posto de trabalho a 10 m. */
function makeAgent() {
  const home = { id: 'h', inside: { x: 0, z: 0 }, door: { x: 0, z: 2 }, yard: { x: 0, z: 3 }, yaw: 0 };
  const spot = { x: 10, z: 0, yaw: 0 };
  const manager = { day: 0, dt: 1 / 60, route: (a, from, goal) => [{ x: goal.x, z: goal.z }] };
  return new NPCAgent({ id: 'p1', fullName: 'Teste', age: 'adult', profession: 'fazendeiro' }, {
    look: {}, home, workplace: spot, lunchSpot: spot, leisure: [{ id: 0, x: 5, z: 5 }], village: {}, manager, rng: () => 0.5,
  });
}
const CTX = { hour: 10, hoursPassed: 0, env: {}, detailed: false };

test('knockOut_staysDownUntilTimeThenWakesAlive', () => {
  const a = makeAgent();
  a.knockOut(20);
  assert.equal(a.life, 'KNOCKED_OUT');
  assert.equal(a.down, true);
  const x0 = a.pos.x;
  a.update(10, CTX);
  assert.equal(a.life, 'KNOCKED_OUT');
  assert.equal(a.pos.x, x0); // não andou
  a.update(10.5, CTX);
  assert.equal(a.life, 'ALIVE');
  assert.notEqual(a.state, 'DOWN');
});

test('kill_isPermanent_andNotIndoors', () => {
  const a = makeAgent();
  a.kill();
  a.update(1000, CTX);
  assert.equal(a.life, 'DEAD');
  assert.equal(a.indoors, false);
  a.snap(10, {});
  assert.equal(a.life, 'DEAD'); // salto de relógio não ressuscita
});

test('knockOut_onDeadAgent_isIgnored', () => {
  const a = makeAgent();
  a.kill();
  a.knockOut(5);
  assert.equal(a.life, 'DEAD');
});

test('snap_whileKnockedOut_wakesUp', () => {
  const a = makeAgent();
  a.knockOut(20);
  a.snap(10, {});
  assert.equal(a.life, 'ALIVE');
});
