import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kelvinToRGB, sunKelvin } from '../../../src/systems/lighting/ColorTemperature.js';
import { LIGHTING } from '../../../src/config/lighting.js';

test('kelvin_6500isNearWhite_lowIsOrange_highIsBlue', () => {
  const w = kelvinToRGB(6500), o = kelvinToRGB(2000), bl = kelvinToRGB(12000);
  assert.ok(w.r > 0.95 && w.g > 0.95 && w.b > 0.9, JSON.stringify(w));
  assert.ok(o.r === 1 && o.g < 0.65 && o.b < 0.25, JSON.stringify(o));
  assert.ok(bl.b === 1 && bl.r < 0.85, JSON.stringify(bl));
});

test('sunKelvin_warmAtHorizon_neutralHigh_moonBluish', () => {
  const k = LIGHTING.kelvin;
  assert.equal(sunKelvin(0, false, k), k.horizon);
  assert.equal(sunKelvin(0.95, false, k), k.noon);
  assert.equal(sunKelvin(0.3, true, k), k.moon);
  // sobe sem voltar (dourado → neutro conforme o sol sobe)
  let prev = 0;
  for (let e = 0; e <= 0.9; e += 0.02) { const v = sunKelvin(e, false, k); assert.ok(v >= prev - 1e-9); prev = v; }
});
