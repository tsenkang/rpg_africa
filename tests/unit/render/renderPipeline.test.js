import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePassNames, godRayStrength } from '../../../src/render/RenderPipeline.js';
import { GRAPHICS_PRESETS } from '../../../src/config/graphics.js';
import { POST } from '../../../src/config/lighting.js';
import { BIOMES } from '../../../src/config/biomes.js';

const only = (id) => BIOMES.map((b) => (b.id === id ? 1 : 0));

test('RenderPipeline: sem flags não há passes (desenho direto)', () => {
  assert.deepEqual(activePassNames(null), []);
});

test('RenderPipeline: ordem dos passes é AO → SSR → raios → bloom → saída → cor → SMAA', () => {
  const all = activePassNames({ ao: true, ssr: true, godrays: true, bloom: true, grade: true, smaa: true });
  assert.deepEqual(all, ['gtao', 'ssr', 'godrays', 'bloom', 'output', 'grade', 'smaa']);
  assert.deepEqual(activePassNames({}), ['output'], 'ACES + sRGB sempre que há alvo HDR');
});

test('RenderPipeline: níveis baixos desenham direto; Alto/Ultra têm pós; SSR fica para o Cinemático', () => {
  const by = Object.fromEntries(GRAPHICS_PRESETS.map((p) => [p.id, p.post]));
  for (const id of ['muito-baixo', 'baixo', 'medio']) assert.equal(by[id], null, id);
  assert.equal(by.alto.ao, false);
  assert.equal(by.ultra.ao, true);
  for (const p of GRAPHICS_PRESETS) assert.ok(!p.post?.ssr, `${p.id} sem SSR`);
});

test('Raios de sol: floresta > savana > deserto; zero sem sol ou de costas', () => {
  const f = (id) => godRayStrength(only(id), 0.3, 0.9, 0);
  assert.ok(f('tropical') > f('savana') && f('savana') > f('deserto'));
  assert.ok(f('preta') >= f('tropical'), 'névoa de Kaelen');
  assert.equal(godRayStrength(only('tropical'), -0.1, 1, 0), 0, 'sol abaixo do horizonte');
  assert.equal(godRayStrength(only('tropical'), 0.3, POST.godrays.facing, 0), 0, 'câmera de costas');
});

test('Raios de sol: sol baixo e de frente mais forte; lua bem mais fraca', () => {
  const w = only('equatorial');
  assert.ok(godRayStrength(w, 0.15, 1, 0) > godRayStrength(w, 0.85, 1, 0));
  assert.ok(godRayStrength(w, 0.3, 1, 0) > godRayStrength(w, 0.3, 0.6, 0));
  const moon = godRayStrength(w, 0.3, 1, 1), sun = godRayStrength(w, 0.3, 1, 0);
  assert.ok(Math.abs(moon / sun - POST.godrays.night) < 1e-9);
});
