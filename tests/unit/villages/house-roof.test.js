import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roofSlope, siteSeed } from '../../../src/villages/Builders.js';

test('roofSlope: 45° sem beiral', () => {
  const s = roofSlope(6, 3, 0);
  assert.ok(Math.abs(s.angle - Math.PI / 4) < 1e-9);
  assert.equal(s.run, 3);
  assert.equal(s.eaveDrop, 0);
  assert.ok(Math.abs(s.length - Math.hypot(3, 3)) < 1e-9);
});

test('roofSlope: o beiral desce na mesma inclinação da água', () => {
  const s = roofSlope(6, 2, 0.6);
  assert.ok(Math.abs(s.eaveDrop - 0.6 * (2 / 3)) < 1e-9);
  assert.equal(s.run, 3.6);
  assert.ok(Math.abs(s.length - Math.hypot(3.6, 3.6 * (2 / 3))) < 1e-9);
});

test('siteSeed: determinística e diferente para casas vizinhas', () => {
  assert.equal(siteSeed(12.3, -40.1), siteSeed(12.3, -40.1));
  assert.notEqual(siteSeed(12.3, -40.1), siteSeed(20.3, -40.1));
  assert.ok(siteSeed(-5, 7) >= 0);
});
