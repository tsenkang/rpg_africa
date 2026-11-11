import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { autoRig } from '../../../src/render/AutoRig.js';

/**
 * Quadrúpede de caixas (frente = +Z): tronco, 4 pernas, pescoço+cabeça e
 * cauda — o mesmo formato que o AnimalModels.normalize entrega (chão em y=0).
 */
function boxAnimal() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  const part = (w, h, d, x, y, z, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 4, 4), mat);
    m.position.set(x, y, z);
    m.name = name;
    g.add(m);
    return m;
  };
  part(0.5, 0.4, 1.4, 0, 0.8, 0, 'tronco');
  for (const [x, z] of [[-0.18, 0.55], [0.18, 0.55], [-0.18, -0.55], [0.18, -0.55]]) part(0.12, 0.6, 0.12, x, 0.3, z, 'perna');
  part(0.22, 0.25, 0.45, 0, 1.05, 0.95, 'cabeca');
  part(0.06, 0.06, 0.6, 0, 0.85, -0.98, 'cauda');
  return g;
}

const weightsOf = (mesh, v) => {
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const out = {};
  for (let k = 0; k < 4; k++) {
    const w = sw.getComponent(v, k);
    if (w > 0) {
      const name = mesh.skeleton.bones[si.getComponent(v, k)].name;
      out[name] = (out[name] ?? 0) + w;
    }
  }
  return out;
};
const top = (w) => Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];

test('AutoRig: acha 4 patas (frente/trás e lados), coluna, cabeça e cauda', () => {
  const { rig, object } = autoRig(boxAnimal(), { kind: 'quadruped' });
  assert.equal(rig.legs.length, 4);
  assert.equal(rig.legs.filter((l) => l.front).length, 2);
  assert.deepEqual(rig.legs.map((l) => l.side).sort(), [-1, -1, 1, 1]);
  assert.equal(rig.spine.length, 3);
  assert.ok(rig.head && rig.neck && rig.jaw && rig.ribs);
  assert.equal(rig.tail.length, 3);
  assert.ok(Math.abs(rig.dims.legTop - 0.6) < 0.08, `barriga em ${rig.dims.legTop}`);
  for (const n of [rig.head, ...rig.spine, ...rig.tail, ...rig.legs.map((l) => l.upper)]) assert.ok(object.getObjectByName(n), n);
});

test('AutoRig: pesos — pata no osso da perna, focinho na cabeça, ponta da cauda na cauda; soma 1', () => {
  const { rig, object } = autoRig(boxAnimal(), { kind: 'quadruped' });
  const meshes = [];
  object.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  assert.equal(meshes.length, 7);
  const p = new THREE.Vector3();
  let checked = 0;
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      p.fromBufferAttribute(pos, v);
      const w = weightsOf(m, v);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 1e-5, `soma ${sum}`);
      const best = top(w);
      if (p.y < 0.05) {
        const leg = rig.legs.find((l) => l.lower === best);
        assert.ok(leg, `pé em ${best}`);
        assert.equal(leg.side, Math.sign(p.x), 'lado certo');
        assert.equal(leg.front, p.z > 0, 'frente/trás certos');
        checked++;
      }
      if (p.z > 1.15) { assert.ok(best === rig.head || best === rig.jaw, `focinho em ${best}`); checked++; }
      if (p.z < -1.25) { assert.equal(best, rig.tail[rig.tail.length - 1]); checked++; }
    }
  }
  assert.ok(checked > 30);
});

test('AutoRig: girar o osso da perna move só a pata (malha deforma pelos ossos)', () => {
  const { rig, object } = autoRig(boxAnimal(), { kind: 'quadruped' });
  const mesh = [];
  object.traverse((o) => { if (o.isSkinnedMesh) mesh.push(o); });
  const leg = rig.legs.find((l) => l.front && l.side > 0);
  const bone = object.getObjectByName(leg.upper);
  const sample = (m, v) => {
    object.updateMatrixWorld(true);
    return m.getVertexPosition(v, new THREE.Vector3()).applyMatrix4(m.matrixWorld);
  };
  // Um vértice do pé dianteiro direito e um da cabeça.
  const find = (pred) => {
    for (const m of mesh) {
      const pos = m.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) if (pred(new THREE.Vector3().fromBufferAttribute(pos, v))) return [m, v];
    }
    return null;
  };
  const foot = find((p) => p.y < 0.02 && p.x > 0.1 && p.z > 0.5);
  const head = find((p) => p.z > 1.15);
  const f0 = sample(...foot), h0 = sample(...head);
  bone.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.6); // pata para a frente
  const f1 = sample(...foot), h1 = sample(...head);
  assert.ok(f1.z - f0.z > 0.15, `pé avançou ${f1.z - f0.z}`);
  assert.ok(h1.distanceTo(h0) < 1e-6, 'cabeça parada');
});

test('AutoRig: devolve null quando não há malha', () => {
  assert.equal(autoRig(new THREE.Group()), null);
});
