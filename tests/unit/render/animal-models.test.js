import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cleanClips } from '../../../src/render/AnimalModels.js';

test('cleanClips: tira posição/escala dos ossos e normaliza quatérnios comprimidos', () => {
  const clip = new THREE.AnimationClip('Walk', 1, [
    new THREE.VectorKeyframeTrack('Back.position', [0, 1], [0, 0.02, -0.01, 0, 0.03, 0]),
    new THREE.VectorKeyframeTrack('Back.scale', [0, 1], [1, 1, 1, 1, 1, 1]),
    new THREE.QuaternionKeyframeTrack('Back.quaternion', [0, 1], [0.71, 0, 0, 0.71, 0, 0, 0, 0.99]),
  ]);
  const [out] = cleanClips([clip]);
  assert.deepEqual(out.tracks.map((t) => t.name), ['Back.quaternion']);
  const v = out.tracks[0].values;
  for (let i = 0; i < v.length; i += 4) assert.ok(Math.abs(Math.hypot(v[i], v[i + 1], v[i + 2], v[i + 3]) - 1) < 1e-6);
  assert.ok(Math.abs(v[0] - Math.SQRT1_2) < 1e-6, 'direção mantida');
});
