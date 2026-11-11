import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispersion, systemParams, buildCascade, cascadeCuts, significantHeight, pcg, GRAVITY } from '../../../src/systems/ocean/WaveSpectrum.js';
import { ifft1D, oceanFieldsCPU } from '../../../src/systems/ocean/OceanFFTReference.js';
import { OCEAN } from '../../../src/config/ocean.js';

const sys = () => [systemParams(OCEAN.local), systemParams(OCEAN.swell)];

test('dispersion_deepWater_matchesGk', () => {
  const k = 0.5;
  assert.ok(Math.abs(dispersion(k, 500) ** 2 - GRAVITY * k) < 1e-9);
  assert.ok(dispersion(0.05, 2) < Math.sqrt(GRAVITY * 0.05)); // raso: mais lenta
});

test('pcg_isDeterministicUnsigned32', () => {
  assert.equal(pcg(12345), pcg(12345));
  for (const v of [0, 1, 2 ** 31, 2 ** 32 - 1]) { const h = pcg(v); assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32); }
  assert.notEqual(pcg(1), pcg(2));
});

test('ifft1D_matchesNaiveInverseDft', () => {
  const N = 16, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { re[i] = Math.sin(i * 1.3) + 0.2 * i; im[i] = Math.cos(i * 0.7); }
  const nr = new Float64Array(N), ni = new Float64Array(N);
  for (let x = 0; x < N; x++) for (let k = 0; k < N; k++) {
    const a = (2 * Math.PI * k * x) / N;
    nr[x] += re[k] * Math.cos(a) - im[k] * Math.sin(a);
    ni[x] += re[k] * Math.sin(a) + im[k] * Math.cos(a);
  }
  ifft1D(re, im);
  for (let x = 0; x < N; x++) { assert.ok(Math.abs(re[x] - nr[x]) < 1e-9); assert.ok(Math.abs(im[x] - ni[x]) < 1e-9); }
});

test('spectrum_moderateWind_givesPlausibleWaveHeight', () => {
  const cuts = cascadeCuts(OCEAN.cascadeSizes);
  let v = 0;
  OCEAN.cascadeSizes.forEach((size, c) => {
    const { h0 } = buildCascade({ N: 64, size, cut: cuts[c], sys: sys(), depth: 500, seed: 1, cascade: c });
    v += (significantHeight(h0) / 4) ** 2;
  });
  const Hs = 4 * Math.sqrt(v);
  // JONSWAP de pista limitada: só o vento local (7 m/s, 120 km) dá ~1,2 m; com o swell, ~3 m
  assert.ok(Hs > 1 && Hs < 5, `Hs = ${Hs.toFixed(2)} m`);
  // mais vento → mais energia nas ondas longas (o pico desce de frequência)
  const weak = [systemParams(OCEAN.local)], strong = [systemParams({ ...OCEAN.local, windSpeed: 14 })];
  const { h0: a } = buildCascade({ N: 64, size: 733, cut: cuts[0], sys: weak, depth: 500, seed: 1, cascade: 0 });
  const { h0: b } = buildCascade({ N: 64, size: 733, cut: cuts[0], sys: strong, depth: 500, seed: 1, cascade: 0 });
  assert.ok(significantHeight(b) > significantHeight(a) * 1.5);
});

test('fields_derivativesMatchFiniteDifferencesOfHeight', () => {
  const N = 64, size = 33.3;
  const { h0, wave } = buildCascade({ N, size, cut: [0.0001, 9999], sys: sys(), depth: 500, seed: 3, cascade: 2 });
  const { disp, deriv } = oceanFieldsCPU(h0, wave, N, 2.5);
  const dx = size / N;
  let err = 0, mag = 0;
  for (let y = 4; y < N - 4; y += 7) for (let x = 4; x < N - 4; x += 7) {
    const fd = (disp[(y * N + x + 1) * 4 + 1] - disp[(y * N + x - 1) * 4 + 1]) / (2 * dx);
    err += Math.abs(fd - deriv[(y * N + x) * 4]); mag += Math.abs(deriv[(y * N + x) * 4]);
  }
  assert.ok(err / mag < 0.35, `erro relativo ${(err / mag).toFixed(2)}`);
});

test('fields_waveMovesOverTime_andHeightIsReal', () => {
  const N = 32;
  const { h0, wave } = buildCascade({ N, size: 33.3, cut: [0.0001, 9999], sys: sys(), depth: 500, seed: 3, cascade: 2 });
  const a = oceanFieldsCPU(h0, wave, N, 0).disp, b = oceanFieldsCPU(h0, wave, N, 1).disp;
  let diff = 0;
  for (let i = 1; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]);
  assert.ok(diff > 0.01);
});
