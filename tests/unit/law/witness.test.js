import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSee, findWitnesses, WitnessSystem } from '../../../src/systems/law/Witness.js';

const CFG = { radius: 20, fovDot: 0.2, hearRadius: 6, reportRadius: 2, noGuardReportAfter: 25, maxRunSeconds: 90 };

/** Morador falso: yaw 0 olha para +z. */
function npc(id, x, z, yaw = 0, profession = 'fazendeiro') {
  return { id, pos: { x, y: 0, z }, yaw, life: 'ALIVE', get down() { return this.life !== 'ALIVE'; }, indoors: false, rendered: true, person: { profession },
    reaction: null, react(kind, s, at) { this.reaction = { kind, x: at.x, z: at.z }; } };
}

test('canSee_targetInFrontWithinRadius_true', () => {
  assert.equal(canSee({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 10 }, CFG), true);
});

test('canSee_targetBehindBeyondHearing_false', () => {
  assert.equal(canSee({ x: 0, z: 0, yaw: 0 }, { x: 0, z: -10 }, CFG), false);
});

test('canSee_targetBehindButClose_hearsIt', () => {
  assert.equal(canSee({ x: 0, z: 0, yaw: 0 }, { x: 0, z: -4 }, CFG), true);
});

test('canSee_targetBeyondRadius_false', () => {
  assert.equal(canSee({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 25 }, CFG), false);
});

test('findWitnesses_excludesVictimDownAndIndoorsAndFilter', () => {
  const crime = { x: 0, z: 10, victimId: 'v' };
  const a = npc('a', 0, 0); // vê
  const v = npc('v', 0, 9); // vítima
  const ko = npc('ko', 0, 2); ko.life = 'KNOCKED_OUT';
  const inside = npc('in', 1, 2); inside.indoors = true;
  const blind = npc('b', 0, 30); // longe
  const filtered = npc('f', -1, 1);
  const out = findWitnesses([a, v, ko, inside, blind, filtered], crime, CFG, (n) => n.id !== 'f');
  assert.deepEqual(out.map((n) => n.id), ['a']);
});

test('addCrime_guardWitness_marksCrimeWitnessedImmediately', () => {
  const ws = new WitnessSystem(CFG);
  const crime = { id: 1, witnessed: false, villageId: 'v1' };
  const r = ws.addCrime(crime, [npc('g', 0, 0, 0, 'guarda')]);
  assert.equal(crime.witnessed, true);
  assert.equal(r.reportedNow, true);
  assert.equal(ws.entries.size, 0);
});

test('addCrime_civilian_runsToGuardAndReportsOnArrival', () => {
  const ws = new WitnessSystem(CFG);
  const crime = { id: 1, witnessed: false, villageId: 'v1' };
  const c = npc('c', 0, 0);
  ws.addCrime(crime, [c]);
  assert.equal(ws.entries.size, 1);
  const guard = { x: 10, z: 0 };
  let reports = ws.update(1, { guardFor: () => guard });
  assert.equal(reports.length, 0);
  assert.equal(c.reaction.kind, 'RUN_TO');
  assert.equal(c.reaction.x, 10);
  c.pos.x = 9; // chegou perto
  reports = ws.update(0.1, { guardFor: () => guard });
  assert.equal(reports.length, 1);
  assert.equal(crime.witnessed, true);
  assert.equal(ws.entries.size, 0);
});

test('addCrime_sameWitnessTwoCrimes_mergesIntoOneEntry', () => {
  const ws = new WitnessSystem(CFG);
  const c = npc('c', 0, 0);
  ws.addCrime({ id: 1, witnessed: false }, [c]);
  ws.addCrime({ id: 2, witnessed: false }, [c]);
  assert.equal(ws.entries.size, 1);
  assert.equal(ws.entryOf(c).crimes.length, 2);
});

test('update_witnessKnockedOut_isSilencedWithoutReport', () => {
  const ws = new WitnessSystem(CFG);
  const crime = { id: 1, witnessed: false };
  const c = npc('c', 0, 0);
  ws.addCrime(crime, [c]);
  c.life = 'KNOCKED_OUT';
  const reports = ws.update(1, { guardFor: () => ({ x: 0.5, z: 0 }) });
  assert.equal(reports.length, 0);
  assert.equal(crime.witnessed, false);
  assert.equal(ws.entries.size, 0);
});

test('silence_removesEntry_crimeStaysUnwitnessed', () => {
  const ws = new WitnessSystem(CFG);
  const crime = { id: 1, witnessed: false };
  const c = npc('c', 0, 0);
  ws.addCrime(crime, [c]);
  ws.silence(c, 'suborno');
  assert.equal(ws.entries.size, 0);
  assert.equal(crime.witnessed, false);
});

test('update_noGuardInVillage_reportsAfterTimeout', () => {
  const ws = new WitnessSystem(CFG);
  const crime = { id: 1, witnessed: false };
  ws.addCrime(crime, [npc('c', 0, 0)]);
  assert.equal(ws.update(20, { guardFor: () => null }).length, 0);
  assert.equal(ws.update(6, { guardFor: () => null }).length, 1);
  assert.equal(crime.witnessed, true);
});
