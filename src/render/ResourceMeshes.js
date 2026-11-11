import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RESOURCES } from '../config/resources.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** Geometrias simples por tipo de recurso (metros, base no chão). */
function makeGeometries() {
  const stick = (r, len, tilt) => new THREE.CylinderGeometry(r, r * 1.2, len, 5).rotateZ(Math.PI / 2 - tilt).translate(0, r + Math.sin(tilt) * len * 0.5, 0);
  const mushroom = mergeGeometries([
    new THREE.CylinderGeometry(0.04, 0.05, 0.18, 6).translate(0, 0.09, 0),
    new THREE.ConeGeometry(0.15, 0.1, 8).translate(0, 0.22, 0),
  ]);
  const flower = mergeGeometries([
    new THREE.CylinderGeometry(0.012, 0.015, 0.35, 5).translate(0, 0.17, 0),
    new THREE.SphereGeometry(0.09, 7, 5).scale(1, 0.6, 1).translate(0, 0.37, 0),
  ]);
  const leaf = mergeGeometries([0, 1.2, 2.4, 3.6, 4.8].map((a) => new THREE.ConeGeometry(0.09, 0.42, 4).rotateX(-0.9).rotateY(a).translate(0, 0.12, 0)));
  const hive = mergeGeometries([
    new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5).translate(0, 0.55, 0),
    new THREE.SphereGeometry(0.2, 8, 6).scale(1, 1.25, 1).translate(0, 0.95, 0),
  ]);
  return {
    stick: stick(0.02, 0.6, 0.05),
    longstick: stick(0.025, 1.9, 0.18),
    rock: new THREE.DodecahedronGeometry(0.16).translate(0, 0.1, 0),
    vine: new THREE.TorusGeometry(0.22, 0.03, 5, 10).rotateX(Math.PI / 2).translate(0, 0.08, 0),
    leafplant: leaf,
    flower,
    bush: new THREE.SphereGeometry(0.38, 8, 6).scale(1, 0.75, 1).translate(0, 0.3, 0),
    nuts: mergeGeometries([[0, 0], [0.12, 0.08], [-0.1, 0.1], [0.04, -0.12]].map(([x, z]) => new THREE.DodecahedronGeometry(0.07).translate(x, 0.06, z))),
    mushroom,
    hive,
    anthill: new THREE.ConeGeometry(0.32, 0.36, 8).translate(0, 0.18, 0),
    carcass: mergeGeometries([
      new THREE.BoxGeometry(0.7, 0.22, 0.36).translate(0, 0.11, 0),
      new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5).rotateZ(1.3).translate(0.3, 0.25, 0.1),
    ]),
  };
}

/**
 * Desenho dos recursos coletáveis: um InstancedMesh por tipo (cor própria),
 * reconstruído só quando `Resources.version` muda (célula nova, colheita,
 * renascimento).
 *
 * @example
 * const rm = new ResourceMeshes(); scene.add(rm.group);
 * rm.sync(resources); // a cada quadro (barato: compara a versão)
 */
export class ResourceMeshes {
  constructor({ capacity = 120, cfg = RESOURCES } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'resources';
    this.group.userData.noCollide = true;
    const geos = makeGeometries();
    this.meshes = {};
    for (const [type, t] of Object.entries(cfg.types)) {
      const mat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.9 });
      const m = new THREE.InstancedMesh(geos[t.geo], mat, capacity);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = `resource-${type}`;
      this.group.add(m);
      this.meshes[type] = m;
    }
    this._version = -1;
  }

  /** @param {import('../systems/Resources.js').Resources} resources */
  sync(resources) {
    if (resources.version === this._version) return;
    this._version = resources.version;
    for (const m of Object.values(this.meshes)) m.count = 0;
    for (const n of resources.visible()) {
      const m = this.meshes[n.type];
      if (!m || m.count >= m.instanceMatrix.count) continue;
      _q.setFromEuler(_e.set(0, n.rot, 0));
      _m.compose(_p.set(n.x, n.y, n.z), _q, _s.setScalar(n.scale));
      m.setMatrixAt(m.count++, _m);
    }
    for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true;
  }
}
