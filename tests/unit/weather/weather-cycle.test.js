import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameClock, WeatherScheduler } from '../../../src/systems/WeatherClock.js';
import { computeDebuffs } from '../../../src/systems/WeatherDebuffs.js';
import { stepSplashes } from '../../../src/systems/WeatherSim.js';
import { WEATHER, WEATHER_CYCLE, DEBUFFS, DEBUFF_RULES } from '../../../src/config/weather.js';
import { mulberry32 } from '../../../src/world/Noise.js';

const IDS = ['savana', 'taiga', 'deserto', 'kalahari', 'tropical', 'equatorial', 'preta'];
const biomes = IDS.map((id) => WEATHER[id]);

test('GameClock: horas, dias e rótulo', () => {
  const c = new GameClock({ hourSeconds: 50, start: { day: 1, hour: 23 } });
  assert.equal(c.label(), 'Dia 1 · 23:00');
  c.update(50 * 1.5); // +1h30
  assert.equal(c.day, 2);
  assert.equal(c.label(), 'Dia 2 · 00:30');
  assert.equal(c.hourIndex, 24);
});

test('WeatherScheduler: sorteia a cada hora, com tempestades e dias limpos', () => {
  const s = new WeatherScheduler(biomes, WEATHER_CYCLE, mulberry32(7));
  const seen = { limpo: 0, nublado: 0, tempestade: 0 };
  for (let h = 0; h < 400; h++) {
    s.update(0.016, h);
    seen[s.state(2)]++; // deserto
  }
  assert.ok(seen.tempestade > 40 && seen.limpo > 100, JSON.stringify(seen));
});

test('WeatherScheduler: transição gradual de 5 a 10 s (sem pulo)', () => {
  const s = new WeatherScheduler(biomes, WEATHER_CYCLE, mulberry32(3));
  s.update(0.016, 0);
  s.force(2, 'limpo');
  for (let t = 0; t < 12; t += 0.1) s.update(0.1, 0);
  assert.equal(s.level(2), WEATHER_CYCLE.levels.limpo);
  s.force(2, 'tempestade');
  let t = 0, prev = s.level(2), maxStep = 0;
  while (s.level(2) < WEATHER_CYCLE.levels.tempestade && t < 20) {
    s.update(0.1, 0); t += 0.1;
    maxStep = Math.max(maxStep, s.level(2) - prev); prev = s.level(2);
  }
  assert.ok(t >= WEATHER_CYCLE.transition[0] - 0.11 && t <= WEATHER_CYCLE.transition[1] + 0.11, `durou ${t.toFixed(1)} s`);
  assert.ok(maxStep < 0.2, 'sobe aos poucos');
});

test('WeatherScheduler: tempestade dura as horas sorteadas', () => {
  const s = new WeatherScheduler(biomes, WEATHER_CYCLE, mulberry32(11));
  s.update(0.016, 0);
  s.force(1, 'tempestade', 3);
  s.update(0.016, 1); s.update(0.016, 2);
  assert.equal(s.state(1), 'tempestade');
});

test('computeDebuffs: só na tempestade, escala com a intensidade e soma climas', () => {
  const none = computeDebuffs([{ debuff: 'areia', intensity: 0.42 }], DEBUFFS, DEBUFF_RULES);
  assert.equal(none.active.length, 0, 'dia nublado não tem debuff');
  const full = computeDebuffs([{ debuff: 'areia', intensity: 1 }], DEBUFFS, DEBUFF_RULES);
  assert.ok(Math.abs(full.speed - DEBUFFS.areia.speed) < 1e-9);
  assert.ok(full.dps > 0);
  const half = computeDebuffs([{ debuff: 'areia', intensity: (1 + DEBUFF_RULES.threshold) / 2 }], DEBUFFS, DEBUFF_RULES);
  assert.ok(half.speed > full.speed && half.speed < 1);
  const two = computeDebuffs([{ debuff: 'areia', intensity: 1 }, { debuff: 'lama', intensity: 1 }], DEBUFFS, DEBUFF_RULES);
  assert.ok(two.speed < full.speed && two.jump < 1);
});

test('computeDebuffs: fogueira perto cancela o frio ("Aquecido")', () => {
  const cold = computeDebuffs([{ debuff: 'frio', intensity: 1 }], DEBUFFS, DEBUFF_RULES);
  const warm = computeDebuffs([{ debuff: 'frio', intensity: 1 }], DEBUFFS, DEBUFF_RULES, { nearFire: true });
  assert.ok(cold.dps > 0 && cold.speed < 1);
  assert.equal(warm.active.length, 0);
  assert.ok(warm.warmed);
});

test('config: cada bioma tem estados, sorteio, debuff e vinheta válidos', () => {
  for (const id of IDS) {
    const w = WEATHER[id];
    assert.ok(w.states.limpo && w.states.nublado && w.states.tempestade, id);
    assert.ok(w.roll.storm > 0 && w.roll.storm + w.roll.clear <= 1, id);
    assert.ok(DEBUFFS[w.debuff], `${id}: debuff ${w.debuff}`);
    assert.ok(['sand', 'frost', 'rain', 'heat', 'ash'].includes(w.overlay), id);
  }
  assert.ok(WEATHER.taiga.particles[0].sizes.length === 3, 'neve em 3 tamanhos');
  assert.ok(WEATHER.tropical.splashes && WEATHER.tropical.lightning.sunFlash > 0);
});

test('stepSplashes: respingos nascem no chão perto da câmera e respeitam o limite', () => {
  const n = 50;
  const s = { pos: new Float32Array(n * 3), age: new Float32Array(n).fill(-1), count: n };
  const rng = mulberry32(5);
  const cfg = { radius: 10, life: 0.3 };
  stepSplashes(s, 0.016, { x: 100, z: 50 }, cfg, 20, () => 7, rng);
  let alive = 0;
  for (let i = 0; i < n; i++) {
    if (s.age[i] < 0) continue;
    alive++;
    assert.ok(Math.hypot(s.pos[i * 3] - 100, s.pos[i * 3 + 2] - 50) <= 10 + 1e-9);
    assert.ok(Math.abs(s.pos[i * 3 + 1] - 7.03) < 1e-6);
  }
  assert.equal(alive, 20);
});
