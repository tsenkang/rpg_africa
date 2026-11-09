import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHICS_PRESETS, DEFAULT_GRAPHICS, GRAPHICS_STORAGE_KEY } from '../../../src/config/graphics.js';
// Valores originais de RENDER (worldConfig.js usa import.meta.env do Vite,
// que o Node não tem). Se RENDER mudar, este teste lembra de mudar o Ultra.
const RENDER = { shadowMapSize: 4096, shadowRange: 110, grassRadius: 62, treeViewDistance: 1100, treeHighDetailDistance: 150 };
import { presetById, stepPreset, GraphicsStore, FpsMeter, applyGraphics } from '../../../src/render/GraphicsSettings.js';

const NUMERIC = ['weatherDensity', 'pixelRatio', 'shadowMapSize', 'shadowRange', 'grassRadius', 'treeViewDistance', 'treeHighDetailDistance'];

test('presets: vão do mais leve ao mais pesado (nenhum valor diminui ao subir)', () => {
  for (let i = 1; i < GRAPHICS_PRESETS.length; i++) {
    for (const k of NUMERIC) assert.ok(GRAPHICS_PRESETS[i][k] >= GRAPHICS_PRESETS[i - 1][k], `${k} em ${GRAPHICS_PRESETS[i].id}`);
  }
  assert.equal(GRAPHICS_PRESETS.length, 5);
});

test('ultra = visual original (mesmos valores de RENDER)', () => {
  const u = presetById('ultra');
  assert.equal(u.shadowMapSize, RENDER.shadowMapSize);
  assert.equal(u.shadowRange, RENDER.shadowRange);
  assert.equal(u.grassRadius, RENDER.grassRadius);
  assert.equal(u.treeViewDistance, RENDER.treeViewDistance);
  assert.equal(u.treeHighDetailDistance, RENDER.treeHighDetailDistance);
  assert.equal(u.pixelRatio, 1.75);
  assert.ok(u.antialias && u.shadows);
});

test('presetById: id desconhecido cai no padrão', () => {
  assert.equal(presetById('nao-existe').id, DEFAULT_GRAPHICS);
  assert.equal(presetById(null).id, DEFAULT_GRAPHICS);
  assert.equal(presetById('baixo').id, 'baixo');
});

test('stepPreset: anda um degrau e para nas pontas', () => {
  assert.equal(stepPreset('medio', -1).id, 'baixo');
  assert.equal(stepPreset('medio', 1).id, 'alto');
  assert.equal(stepPreset(GRAPHICS_PRESETS[0].id, -1).id, GRAPHICS_PRESETS[0].id);
  assert.equal(stepPreset('ultra', 1).id, 'ultra');
});

test('GraphicsStore: salva, lê e sobrevive a armazenamento quebrado', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const store = new GraphicsStore(storage);
  assert.equal(store.load(), DEFAULT_GRAPHICS);
  store.save('baixo');
  assert.equal(mem.get(GRAPHICS_STORAGE_KEY), 'baixo');
  assert.equal(store.load(), 'baixo');
  const broken = new GraphicsStore({ getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } });
  assert.equal(broken.load(), DEFAULT_GRAPHICS);
  assert.doesNotThrow(() => broken.save('medio'));
});

test('FpsMeter: avisa uma vez depois de N segundos lentos', () => {
  const m = new FpsMeter({ minFps: 30, seconds: 2 });
  let hints = 0;
  for (let i = 0; i < 60 * 3; i++) if (m.tick(1 / 60)) hints++; // rápido
  assert.equal(hints, 0);
  for (let i = 0; i < 20 * 5; i++) if (m.tick(1 / 20)) hints++; // 20 FPS por 5 s
  assert.equal(hints, 1);
  assert.ok(Math.abs(m.fps - 20) < 0.5);
});

test('applyGraphics: repassa os valores aos sistemas e detecta troca de antialias', () => {
  const calls = {};
  const game = {
    renderer: {
      setPixelRatio: (v) => { calls.pr = v; },
      setSize: () => {},
      getContextAttributes: () => ({ antialias: true }),
    },
    environment: { setShadows: (q) => { calls.shadows = q.shadows; } },
    grass: { setRadius: (r) => { calls.grass = r; } },
    vegetation: { setDistances: (v, h) => { calls.trees = [v, h]; } },
  };
  const low = presetById('muito-baixo');
  const res = applyGraphics(game, low, 2);
  assert.equal(calls.pr, low.pixelRatio);
  assert.equal(calls.shadows, false);
  assert.equal(calls.grass, low.grassRadius);
  assert.deepEqual(calls.trees, [low.treeViewDistance, low.treeHighDetailDistance]);
  assert.equal(res.needsReload, true);
  assert.equal(applyGraphics(game, presetById('ultra'), 1).needsReload, false);
  assert.equal(calls.pr, 1, 'tela comum: não passa da densidade real');
});
