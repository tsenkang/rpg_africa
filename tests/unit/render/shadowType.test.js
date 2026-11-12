import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regressão: PCFSoftShadowMap foi removido no Three r187. O jogo pedia esse tipo, o Three só
// trocava para PCF depois do 1º quadro, e os shaders compilados nesse quadro liam o mapa de
// profundidade com sampler2D comum → erro WebGL "Mismatch between texture format and sampler type".
test('Sombras: o renderer usa PCFShadowMap (não o PCFSoft removido no r187)', () => {
  const src = readFileSync(new URL('../../../src/core/Game.js', import.meta.url), 'utf8');
  assert.match(src, /shadowMap\.type\s*=\s*THREE\.PCFShadowMap/);
  assert.doesNotMatch(src, /THREE\.PCFSoftShadowMap/);
});
