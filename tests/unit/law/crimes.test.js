import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrimeLog, humanZone, rollLoot, TrespassTracker } from '../../../src/systems/law/Crimes.js';

const CRIMES = { agressao: { label: 'Agressão', bounty: 50 }, assassinato: { label: 'Assassinato', bounty: 500 } };
const ZONES = { headAbove: 1.5, legsBelow: 0.8 };
/** rng determinístico a partir de uma lista de valores. */
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('report_knownType_recordsUnwitnessedCrimeWithBounty', () => {
  const log = new CrimeLog(CRIMES);
  const c = log.report({ type: 'assassinato', villageId: 'ren', x: 1, z: 2, time: 10, victimId: 'p1' });
  assert.equal(c.bounty, 500);
  assert.equal(c.label, 'Assassinato');
  assert.equal(c.witnessed, false);
  assert.equal(log.list.length, 1);
});

test('report_unknownType_throws', () => {
  assert.throws(() => new CrimeLog(CRIMES).report({ type: 'xyz', villageId: 'a' }));
});

test('report_callsOnCrimeListener', () => {
  const log = new CrimeLog(CRIMES);
  const seen = [];
  log.onCrime = (c) => seen.push(c.type);
  log.report({ type: 'agressao', villageId: 'a' });
  assert.deepEqual(seen, ['agressao']);
});

test('byVillage_filtersCrimesOfThatVillage', () => {
  const log = new CrimeLog(CRIMES);
  log.report({ type: 'agressao', villageId: 'a' });
  log.report({ type: 'agressao', villageId: 'b' });
  log.report({ type: 'assassinato', villageId: 'a' });
  assert.equal(log.byVillage('a').length, 2);
});

test('witnessedBounty_sumsOnlyWitnessedCrimes', () => {
  const log = new CrimeLog(CRIMES);
  const a = log.report({ type: 'agressao', villageId: 'a' });
  log.report({ type: 'assassinato', villageId: 'a' });
  a.witnessed = true;
  assert.equal(log.witnessedBounty('a'), 50);
});

test('humanZone_heightBands_headBodyLegs', () => {
  assert.equal(humanZone(1.7, ZONES), 'head');
  assert.equal(humanZone(1.5, ZONES), 'body'); // limite exato ainda é corpo
  assert.equal(humanZone(1.1, ZONES), 'body');
  assert.equal(humanZone(0.5, ZONES), 'legs');
});

test('rollLoot_weightedPickAndCountRange', () => {
  const table = [{ id: 'a', weight: 1, count: [1, 1] }, { id: 'b', weight: 3, count: [2, 4] }];
  // 1º sorteio: 0.1*4 = 0.4 < 1 → 'a'; 2º: 0.9*4 = 3.6 → 'b', quantidade 2 + floor(0.99*3) = 4
  const out = rollLoot(table, 2, seq(0.1, 0.0, 0.9, 0.99));
  assert.deepEqual(out, [{ id: 'a', count: 1 }, { id: 'b', count: 4 }]);
});

test('rollLoot_coinsEntry_returnsCoins', () => {
  const out = rollLoot([{ coins: true, weight: 1, count: [10, 10] }], 1, seq(0.5));
  assert.deepEqual(out, [{ coins: 10 }]);
});

test('trespass_afterGrace_firesOncePerVisit', () => {
  const t = new TrespassTracker(1.5);
  assert.equal(t.update('casa1', 1.0), false);
  assert.equal(t.update('casa1', 1.0), true); // passou de 1,5 s
  assert.equal(t.update('casa1', 5.0), false); // mesma visita: não repete
  t.update(null, 0.1); // saiu
  assert.equal(t.update('casa1', 2.0), true); // nova visita conta de novo
});

test('trespass_changingHouse_restartsGrace', () => {
  const t = new TrespassTracker(1.5);
  t.update('casa1', 1.0);
  assert.equal(t.update('casa2', 1.0), false);
  assert.equal(t.update('casa2', 1.0), true);
});
