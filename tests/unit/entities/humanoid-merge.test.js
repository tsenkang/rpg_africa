import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Humanoid } from '../../../src/entities/Humanoid.js';

const stats = (root) => {
  root.updateMatrixWorld(true);
  let meshes = 0, tris = 0;
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    g.computeBoundingBox();
    box.union(g.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  return { meshes, tris, box };
};

const LOOK = { height: 1.75, skin: 0x5c3a24, shirt: 0xb5382a, pants: 0x3a3028, hat: 'straw', robe: true, build: 1.1 };

test('Humanoid: peças de mesmo material no mesmo osso viram um mesh só', () => {
  const merged = stats(new Humanoid(LOOK).root);
  assert.ok(merged.meshes <= 26, `esperava ≤26 meshes, veio ${merged.meshes}`);
});

test('Humanoid: a geometria resultante é idêntica (triângulos e caixa envolvente)', () => {
  const h = new Humanoid(LOOK);
  const after = stats(h.root);
  const ref = stats(new Humanoid({ ...LOOK, mergeParts: false }).root);
  assert.equal(after.tris, ref.tris);
  for (const k of ['min', 'max']) for (const a of ['x', 'y', 'z']) {
    assert.ok(Math.abs(after.box[k][a] - ref.box[k][a]) < 1e-5, `${k}.${a}`);
  }
});

test('Humanoid: juntas animadas continuam existindo e peças animadas não são fundidas', () => {
  const h = new Humanoid(LOOK);
  assert.equal(h.legs.length, 2);
  assert.equal(h.hands.length, 2);
  assert.ok(h.chest.isMesh && h.chest.parent === h.torso, 'peito mantém a escala animada');
  h.update(0.016, 3, { sprinting: true });
});
