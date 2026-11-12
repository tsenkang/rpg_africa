import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MaterialFactory } from '../../../src/render/lighting/MaterialFactory.js';
import { BIOMES } from '../../../src/config/biomes.js';

const idx = (id) => BIOMES.findIndex((b) => b.id === id);

test('rain_wetsQuickly_driesSlowly_snowAndSandDoNot', () => {
  const mf = new MaterialFactory();
  const eff = new Float32Array(BIOMES.length);
  eff[idx('tropical')] = 1; // chuva torrencial
  for (let i = 0; i < 25; i++) mf.update(1, { eff });
  assert.ok(mf.wet > 0.95, `molhado ${mf.wet}`);
  eff.fill(0);
  for (let i = 0; i < 30; i++) mf.update(1, { eff });
  assert.ok(mf.wet > 0.6 && mf.wet < 0.85, `secando ${mf.wet.toFixed(2)}`); // 30 s depois ainda úmido
  const dry = new MaterialFactory(), e2 = new Float32Array(BIOMES.length);
  e2[idx('taiga')] = 1; e2[idx('kalahari')] = 1; // nevasca e tempestade de areia
  for (let i = 0; i < 30; i++) dry.update(1, { eff: e2 });
  assert.equal(dry.wet, 0);
});

test('install_chainsExistingHook_andKeysProgramByEffects', () => {
  const mf = new MaterialFactory();
  const m = new THREE.MeshStandardMaterial();
  let called = 0;
  m.onBeforeCompile = () => { called++; };
  mf.install(m, { wet: true, veins: true });
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <normal_fragment_maps>' };
  m.onBeforeCompile(shader);
  assert.equal(called, 1);
  assert.ok(shader.fragmentShader.includes('#define SURF_WET') && shader.fragmentShader.includes('#define SURF_VEINS'));
  assert.ok(shader.uniforms.uWet === mf.uniforms.uWet);
  assert.match(m.customProgramCacheKey(), /surf:SURF_WET,SURF_VEINS/);
});
