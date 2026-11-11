import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SanityManager } from '../../../src/systems/SanityManager.js';
import { Survival } from '../../../src/systems/Survival.js';
import { PlayerState } from '../../../src/systems/PlayerState.js';
import { COMFORT, DISLIKE_MULTIPLIER, SANITY_TRIGGERS } from '../../../src/config/character.js';

const profile = (comfortActivities, dislikes = []) => ({ name: 'Teste', comfortActivities, dislikes });

test('drainSanity_clampsAtZero_andLogsReason', () => {
  const sm = new SanityManager({ profile: profile([]), start: 10 });
  assert.equal(sm.drainSanity(4, 'Susto'), 4);
  assert.equal(sm.drainSanity(50, 'Trauma'), 6);
  assert.equal(sm.value, 0);
  assert.deepEqual(sm.log.map((l) => l.reason), ['Susto', 'Trauma']);
});

test('drainSanity_dislikedTagMultipliesLoss', () => {
  const hates = new SanityManager({ profile: profile([], ['SANGUE']), start: 100 });
  const fine = new SanityManager({ profile: profile([]), start: 100 });
  hates.drainSanity(10, 'Abate', { tags: ['SANGUE'] });
  fine.drainSanity(10, 'Abate', { tags: ['SANGUE'] });
  assert.equal(100 - hates.value, 10 * DISLIKE_MULTIPLIER);
  assert.equal(100 - fine.value, 10);
});

test('comfort_likedActivityRestoresFull_unlikedOnlyFraction', () => {
  const likes = new SanityManager({ profile: profile(['LER_LIVROS']), start: 20 });
  const not = new SanityManager({ profile: profile([]), start: 20 });
  assert.equal(likes.comfort('LER_LIVROS', 0, 0), COMFORT.activities.LER_LIVROS.amount);
  assert.equal(not.comfort('LER_LIVROS', 0, 0), COMFORT.activities.LER_LIVROS.amount * COMFORT.unlikedFactor);
});

test('comfort_pointActivityRespectsCooldown', () => {
  const sm = new SanityManager({ profile: profile(['TOCAR_INSTRUMENTO']), start: 10 });
  const cd = COMFORT.activities.TOCAR_INSTRUMENTO.cooldown;
  assert.ok(sm.comfort('TOCAR_INSTRUMENTO', 0, 100) > 0);
  assert.equal(sm.comfort('TOCAR_INSTRUMENTO', 0, 100 + cd - 1), 0, 'cedo demais');
  assert.ok(sm.comfort('TOCAR_INSTRUMENTO', 0, 100 + cd + 1) > 0);
});

test('comfort_fireIsContinuousPerSecond', () => {
  const sm = new SanityManager({ profile: profile(['FOGUEIRA']), start: 50 });
  for (let i = 0; i < 10; i++) sm.comfort('FOGUEIRA', 1);
  assert.ok(Math.abs(sm.value - (50 + 10 * COMFORT.activities.FOGUEIRA.perSecond)) < 1e-9);
});

test('update_paranormalScalesWithProximity_cursedAndDarkDrain', () => {
  const near = new SanityManager({ profile: profile([]), start: 100 });
  const far = new SanityManager({ profile: profile([]), start: 100 });
  near.update(1, { paranormal: [{ dist: 5, reach: 50 }] });
  far.update(1, { paranormal: [{ dist: 45, reach: 50 }] });
  assert.ok(100 - near.value > 100 - far.value);
  const out = new SanityManager({ profile: profile([]), start: 100 });
  out.update(1, { paranormal: [{ dist: 60, reach: 50 }] });
  assert.equal(out.value, 100, 'fora do raio não drena');
  const cursed = new SanityManager({ profile: profile([]), start: 100 });
  cursed.update(10, { cursed: true });
  assert.ok(Math.abs(100 - cursed.value - SANITY_TRIGGERS.cursedPerSecond * 10) < 1e-9);
  const darkHater = new SanityManager({ profile: profile([], ['ESCURIDAO']), start: 100 });
  darkHater.update(10, { dark: true });
  assert.ok(Math.abs(100 - darkHater.value - SANITY_TRIGGERS.darkPerSecond * 10 * DISLIKE_MULTIPLIER) < 1e-9);
});

test('level_followsThresholds_andEmitsOnChange', () => {
  const sm = new SanityManager({ profile: profile([]), start: 60 });
  const seen = [];
  sm.on('level', (e) => seen.push(e.level));
  assert.equal(sm.level, 0);
  sm.drainSanity(15, 'x'); assert.equal(sm.level, 1);
  sm.drainSanity(20, 'x'); assert.equal(sm.level, 2);
  sm.drainSanity(20, 'x'); assert.equal(sm.level, 3);
  sm.restoreSanity(80, 'cura'); assert.equal(sm.level, 0);
  assert.deepEqual(seen, [1, 2, 3, 0]);
});

test('survival_sanityDelegatesToManager_andSweetFoodComforts', () => {
  const s = new Survival({ state: new PlayerState(), rng: () => 0.99 });
  s.sanity = 40;
  assert.equal(s.sanityMgr.value, 40);
  s.consume('mel');
  assert.ok(s.sanity > 40, 'doce acalma (COMER_DOCES)');
});
