import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BountyManager } from '../../../src/systems/law/Bounty.js';

const CFG = { searchRadius: 40, escapeSeconds: 20 };
/** Duas vilas: 'a' em x < 500, 'b' em x ≥ 500. */
const villageAt = (p) => (p.x < 500 ? 'a' : 'b');
const make = () => new BountyManager(CFG, { villageAt });
const crime = (bounty, villageId = 'a') => ({ bounty, villageId, witnessed: true });

test('recordWitnessed_addsBountyAndStartsSearchAtPlayer', () => {
  const b = make();
  b.recordWitnessed(crime(50), { x: 10, z: 20 });
  b.recordWitnessed(crime(500), { x: 12, z: 20 });
  assert.equal(b.bountyOf('a'), 550);
  const s = b.searchOf('a');
  assert.equal(s.x, 12);
  assert.equal(s.r, 40);
});

test('wantedHere_onlyInsideVillageRegionWithBounty', () => {
  const b = make();
  b.recordWitnessed(crime(50), { x: 0, z: 0 });
  assert.equal(b.wantedHere({ x: 100, z: 0 }), 'a');
  assert.equal(b.wantedHere({ x: 900, z: 0 }), null);
});

test('update_outsideCircleUnseen_endsSearchAfterEscapeTime_bountyStays', () => {
  const b = make();
  b.recordWitnessed(crime(50), { x: 0, z: 0 });
  const far = { x: 100, z: 0 };
  b.update(10, { playerPos: far, seen: () => false });
  assert.ok(b.searchOf('a'));
  assert.ok(b.searchOf('a').escape > 0.4 && b.searchOf('a').escape < 0.6);
  const ended = b.update(10.1, { playerPos: far, seen: () => false });
  assert.deepEqual(ended, ['a']);
  assert.equal(b.searchOf('a'), null);
  assert.equal(b.bountyOf('a'), 50);
});

test('update_insideCircle_noEscapeProgress', () => {
  const b = make();
  b.recordWitnessed(crime(50), { x: 0, z: 0 });
  b.update(30, { playerPos: { x: 5, z: 0 }, seen: () => false });
  assert.equal(b.searchOf('a').escape, 0);
});

test('update_seenOutsideCircle_recentersAndResetsEscape', () => {
  const b = make();
  b.recordWitnessed(crime(50), { x: 0, z: 0 });
  b.update(15, { playerPos: { x: 100, z: 0 }, seen: () => false });
  b.update(0.1, { playerPos: { x: 120, z: 5 }, seen: (v) => v === 'a' });
  const s = b.searchOf('a');
  assert.equal(s.x, 120);
  assert.equal(s.escape, 0);
});

test('spotted_withBountyButNoSearch_startsNewSearch', () => {
  const b = make();
  b.recordWitnessed(crime(50), { x: 0, z: 0 });
  b.update(25, { playerPos: { x: 100, z: 0 }, seen: () => false });
  assert.equal(b.searchOf('a'), null);
  b.update(0.1, { playerPos: { x: 200, z: 0 }, seen: (v) => v === 'a' });
  assert.equal(b.searchOf('a').x, 200);
});

test('clear_removesBountyAndSearch_total_sumsVillages', () => {
  const b = make();
  b.recordWitnessed(crime(50, 'a'), { x: 0, z: 0 });
  b.recordWitnessed(crime(500, 'b'), { x: 600, z: 0 });
  assert.equal(b.total(), 550);
  b.clear('a');
  assert.equal(b.bountyOf('a'), 0);
  assert.equal(b.searchOf('a'), null);
  assert.equal(b.total(), 500);
});

test('recordWitnessed_sameCrimeReportedTwice_countsOnce', () => {
  const b = make();
  const c = crime(500);
  b.recordWitnessed(c, { x: 0, z: 0 });
  b.recordWitnessed(c, { x: 5, z: 0 }); // segunda testemunha do mesmo crime
  assert.equal(b.bountyOf('a'), 500);
  assert.equal(b.searchOf('a').x, 5); // mas a busca vai para a posição mais nova
});
