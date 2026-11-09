import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunDirection } from '../../../src/world/SunPath.js';
import { SUN_CYCLE } from '../../../src/config/sky.js';

test('sunDirection: vetor unitário, sempre acima do horizonte, dentro da faixa', () => {
  const o = {};
  for (let t = 0; t < SUN_CYCLE.period * 2; t += 17) {
    sunDirection(t, SUN_CYCLE, o);
    assert.ok(Math.abs(Math.hypot(o.x, o.y, o.z) - 1) < 1e-9);
    const el = Math.asin(o.y);
    assert.ok(el >= SUN_CYCLE.elevationMin - 1e-9 && el <= SUN_CYCLE.elevationMax + 1e-9);
  }
});

test('sunDirection: o sol anda (devagar) e volta ao mesmo lugar após um período', () => {
  const a = sunDirection(100, SUN_CYCLE, {});
  const b = sunDirection(160, SUN_CYCLE, {});
  const c = sunDirection(100 + SUN_CYCLE.period, SUN_CYCLE, {});
  const ang = Math.acos(a.x * b.x + a.y * b.y + a.z * b.z);
  assert.ok(ang > 0.005 && ang < 0.3, `move ${ang} rad/min`);
  assert.ok(Math.abs(a.x - c.x) < 1e-9 && Math.abs(a.z - c.z) < 1e-9);
});
