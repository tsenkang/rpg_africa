import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER, PARANORMAL_FOG } from '../../../src/config/weather.js';
import {
  createParticleState, seedParticles, stepParticles, cycleIntensity,
  nearestCreatureDistance, paranormalTarget, lightningEnvelope,
} from '../../../src/systems/WeatherSim.js';
import { mulberry32 } from '../../../src/world/Noise.js';

const BIOME_IDS = ['savana', 'taiga', 'deserto', 'kalahari', 'tropical', 'equatorial', 'preta'];
const SPEC = { shape: 'flake', count: 500, box: [40, 20, 40], fall: 3, jitter: 0, flutter: 0 };

function inBox(s, c) {
  const [w, h, d] = s.box;
  for (let i = 0; i < s.active; i++) {
    const x = s.pos[i * 3] - c.x, y = s.pos[i * 3 + 1] - c.y, z = s.pos[i * 3 + 2] - c.z;
    if (Math.abs(x) > w / 2 + 1e-6 || Math.abs(y) > h / 2 + 1e-6 || Math.abs(z) > d / 2 + 1e-6) return false;
  }
  return true;
}

test('config: os 7 biomas têm um clima com partículas e look completos', () => {
  for (const id of BIOME_IDS) {
    const w = WEATHER[id];
    assert.ok(w, id);
    assert.ok(w.particles.length > 0, id);
    for (const k of ['fogColor', 'fogColorMix', 'fogDensity', 'sunTint', 'sunTintMix', 'sunMul', 'hemiMul', 'exposureMul', 'bloom', 'lantern', 'skyToFog']) {
      assert.ok(w.look[k] !== undefined, `${id}.look.${k}`);
    }
  }
  assert.ok(WEATHER.tropical.lightning, 'tropical tem relâmpagos');
  assert.ok(WEATHER.preta.look.sunMul < 0.15, 'floresta preta: sol quase nulo');
  assert.ok(WEATHER.kalahari.look.bloom > WEATHER.savana.look.bloom, 'kalahari ofusca');
  assert.ok(WEATHER.deserto.look.fogDensity > WEATHER.savana.look.fogDensity * 10, 'areia derruba a visibilidade');
});

test('stepParticles: partícula que cai no chão volta para o topo da caixa (pool)', () => {
  const rng = mulberry32(1);
  const s = createParticleState(SPEC, 500, rng);
  const c = { x: 0, y: 10, z: 0 };
  seedParticles(s, c, rng);
  s.pos[1] = c.y - 9.9; // quase no fundo
  const recycled = stepParticles(s, 0.1, c, 0, 0, 0, rng);
  assert.ok(recycled >= 1);
  assert.ok(s.pos[1] > c.y, 'reapareceu na metade de cima');
  assert.equal(s.pos.length, 1500, 'nenhuma partícula criada');
});

test('stepParticles: a caixa acompanha a câmera (inclusive teleporte)', () => {
  const rng = mulberry32(2);
  const s = createParticleState(SPEC, 500, rng);
  seedParticles(s, { x: 0, y: 0, z: 0 }, rng);
  const far = { x: 1234.5, y: 80, z: -987 };
  stepParticles(s, 0.016, far, 5, -3, 1, rng);
  // y só recicla pela queda; depois de passos suficientes tudo está na caixa nova
  for (let i = 0; i < 400; i++) stepParticles(s, 0.05, far, 5, -3, i, rng);
  assert.ok(inBox(s, far));
});

test('stepParticles: quadro longo (dt grande) não deixa partícula fora da caixa', () => {
  const rng = mulberry32(5);
  const s = createParticleState({ ...SPEC, fall: 19 }, 300, rng);
  const c = { x: 0, y: 0, z: 0 };
  seedParticles(s, c, rng);
  stepParticles(s, 10, c, 0, 0, 0, rng); // cai 190 m num passo
  assert.ok(inBox(s, c));
  stepParticles(s, 0.1, { x: 0, y: 300, z: 0 }, 0, 0, 0, rng); // câmera subiu 300 m
  assert.ok(inBox(s, { x: 0, y: 300, z: 0 }));
});

test('stepParticles: vento empurra as partículas', () => {
  const rng = mulberry32(3);
  const s = createParticleState({ ...SPEC, box: [1000, 1000, 1000], fall: 0 }, 10, rng);
  seedParticles(s, { x: 0, y: 0, z: 0 }, rng);
  const x0 = s.pos[0];
  stepParticles(s, 1, { x: 0, y: 0, z: 0 }, 10, 0, 0, rng);
  assert.ok(s.pos[0] - x0 > 7, 'andou com o vento (x)');
});

test('stepParticles: só mexe nas ativas (nível gráfico)', () => {
  const rng = mulberry32(4);
  const s = createParticleState(SPEC, 100, rng);
  seedParticles(s, { x: 0, y: 0, z: 0 }, rng);
  s.active = 10;
  const before = s.pos[50 * 3 + 1];
  stepParticles(s, 0.1, { x: 0, y: 0, z: 0 }, 0, 0, 0, rng);
  assert.equal(s.pos[50 * 3 + 1], before);
});

test('cycleIntensity: fica entre min e 1; min=1 é constante', () => {
  const cycle = { period: 60, min: 0.4 };
  for (let t = 0; t < 200; t += 0.7) {
    const v = cycleIntensity(t, cycle);
    assert.ok(v >= 0.4 - 1e-9 && v <= 1 + 1e-9, `t=${t} v=${v}`);
  }
  assert.equal(cycleIntensity(12, { period: 10, min: 1 }), 1);
});

test('névoa paranormal: 0 fora do raio, 1 perto, cresce ao se aproximar', () => {
  assert.equal(paranormalTarget(Infinity, PARANORMAL_FOG), 0);
  assert.equal(paranormalTarget(PARANORMAL_FOG.radius + 1, PARANORMAL_FOG), 0);
  assert.equal(paranormalTarget(PARANORMAL_FOG.innerRadius - 1, PARANORMAL_FOG), 1);
  let prev = 0;
  for (let d = PARANORMAL_FOG.radius; d >= PARANORMAL_FOG.innerRadius; d -= 2) {
    const v = paranormalTarget(d, PARANORMAL_FOG);
    assert.ok(v >= prev);
    prev = v;
  }
});

test('nearestCreatureDistance: lista vazia, Object3D-like, {x,z} e inativos', () => {
  const me = { x: 0, z: 0 };
  assert.equal(nearestCreatureDistance(me, []), Infinity);
  const list = [{ position: { x: 30, y: 5, z: 40 } }, { x: 3, z: 4 }, { position: { x: 1, z: 0 }, alive: false }];
  assert.equal(nearestCreatureDistance(me, list), 5);
});

test('lightningEnvelope: pico no raio, segundo pulso, apaga', () => {
  assert.equal(lightningEnvelope(-1), 0);
  assert.ok(lightningEnvelope(0) >= 1);
  assert.ok(lightningEnvelope(0.17) > lightningEnvelope(0.15), 'segundo clarão');
  assert.ok(lightningEnvelope(1.5) < 0.01);
});
