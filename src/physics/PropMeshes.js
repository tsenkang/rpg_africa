import * as THREE from 'three';
import { PROP_TYPES } from '../config/physics.js';
import { G } from '../villages/Builders.js';

/**
 * Desenho dos objetos dinâmicos com InstancedMesh: cada PARTE de cada tipo
 * (ex.: madeira do barril, aros de ferro) é um InstancedMesh com todas as
 * instâncias — 1 draw call por parte para o continente inteiro.
 * A cada quadro, só os objetos que se mexeram (`moved`) têm a matriz
 * reescrita; parados e congelados não custam nada.
 *
 * @example
 * const meshes = new PropMeshes(physics.byType, materials);
 * scene.add(meshes.group);
 * meshes.sync(physics.props); // depois de physics.update()
 */
export class PropMeshes {
  /**
   * @param {Map<string, object[]>} byType PhysicsWorld.byType
   * @param {Record<string, THREE.Material>} M materiais
   */
  constructor(byType, M) {
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.parts = new Map(); // tipo → [InstancedMesh]
    const geos = { box: G.box, cyl: G.cyl, cyl6: G.cyl6, torus: G.torus, sphere: G.sphere };
    const m = new THREE.Matrix4(), e = new THREE.Euler();
    for (const [type, list] of byType) {
      const def = PROP_TYPES[type];
      const meshes = def.parts.map((part) => {
        // A peça já vem posicionada no espaço do objeto: matriz da instância = corpo.
        e.set(...(part.rot ?? [0, 0, 0]));
        m.compose(new THREE.Vector3(...(part.pos ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(...part.scale));
        const geo = geos[part.geo].clone().applyMatrix4(m);
        const mesh = new THREE.InstancedMesh(geo, M[part.mat], list.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // instâncias espalhadas pelo mapa
        mesh.name = `prop-${type}-${part.geo}`;
        this.group.add(mesh);
        return mesh;
      });
      this.parts.set(type, meshes);
    }
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }

  /** Copia posição/rotação dos objetos que se mexeram para as instâncias. */
  sync(props) {
    const dirty = new Set();
    for (const p of props) {
      if (!p.moved) continue;
      p.moved = false;
      this._m.compose(this._p.set(p.pos.x, p.pos.y, p.pos.z), this._q.set(p.quat.x, p.quat.y, p.quat.z, p.quat.w), this._s.setScalar(p.scale));
      for (const mesh of this.parts.get(p.type)) mesh.setMatrixAt(p.index, this._m);
      dirty.add(p.type);
    }
    for (const type of dirty) for (const mesh of this.parts.get(type)) mesh.instanceMatrix.needsUpdate = true;
  }
}
