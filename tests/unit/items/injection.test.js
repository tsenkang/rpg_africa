import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySuspiciousInjection } from '../../../src/systems/Items.js';
import { PlayerState } from '../../../src/systems/PlayerState.js';

const CFG = { healChance: 0.5 };

test('injeção: abaixo de healChance cura vida e remove doença', () => {
  const s = new PlayerState();
  s.addEffect('febre_mendigo');
  s.damage(60);
  assert.equal(applySuspiciousInjection(s, 0.49, CFG), 'cura');
  assert.equal(s.health, s.maxHealth);
  assert.equal(s.hasEffect('febre_mendigo'), false);
});

test('injeção: a partir de healChance pega a Febre do Mendigo', () => {
  const s = new PlayerState();
  assert.equal(applySuspiciousInjection(s, 0.5, CFG), 'doenca');
  assert.equal(s.hasEffect('febre_mendigo'), true);
});
