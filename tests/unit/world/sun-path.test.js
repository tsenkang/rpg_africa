import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celestial, horizonFade } from '../../../src/world/SunPath.js';
import { DAY_NIGHT } from '../../../src/config/sky.js';

const at = (h) => { const s = {}, m = {}; return { ...celestial(h, DAY_NIGHT, s, m), s, m }; };

test('sol: nasce no leste, alto ao meio-dia, se põe no oeste; abaixo do horizonte à noite', () => {
  const rise = at(DAY_NIGHT.sunrise + 0.2), noon = at((DAY_NIGHT.sunrise + DAY_NIGHT.sunset) / 2), set = at(DAY_NIGHT.sunset - 0.2);
  assert.ok(rise.s.x > 0.9 && rise.sunElevation > 0, 'leste ao nascer');
  assert.ok(set.s.x < -0.9 && set.sunElevation > 0, 'oeste ao pôr');
  assert.ok(Math.abs(noon.sunElevation - DAY_NIGHT.maxElevation) < 1e-9, 'meio-dia no alto');
  assert.ok(at(2).sunElevation < 0 && at(23).sunElevation < 0);
});

test('lua: no céu durante a noite, abaixo durante o dia', () => {
  for (const h of [21, 0, 3]) assert.ok(at(h).moonElevation > 0, `lua às ${h}h`);
  for (const h of [9, 12, 16]) assert.ok(at(h).moonElevation < 0, `sem lua às ${h}h`);
});

test('horizonFade: 0 no horizonte, 1 acima do crepúsculo (troca sol↔lua sem salto)', () => {
  assert.equal(horizonFade(-0.1, 0.14), 0);
  assert.equal(horizonFade(0, 0.14), 0);
  assert.equal(horizonFade(0.2, 0.14), 1);
});
