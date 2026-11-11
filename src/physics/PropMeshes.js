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

  /**
   * Desenha só as instâncias que importam neste quadro (sem mudar a imagem):
   *  - dentro da visão da câmera (esfera folgada contra o frustum) e da distância de desenho;
   *  - perto do foco da sombra (podem jogar sombra na tela mesmo fora dela);
   *  - a menos de `near` m (reflexo da água mostra o que está atrás da câmera).
   * As visíveis vão para os primeiros slots e `count` corta o resto: antes, os ~3 mil objetos
   * do continente eram desenhados em todo quadro, duas vezes (sombra).
   * @param {object[]} props PhysicsWorld.props
   * @param {THREE.Camera} camera
   * @param {{ x: number, z: number }} shadowFocus centro do mapa de sombras
   * @param {number} shadowRadius alcance do mapa de sombras (m)
   * @param {{ near?: number, far?: number }} [o]
   */
  cull(props, camera, shadowFocus, shadowRadius, { near = 60, far = 1500 } = {}) {
    this._fr ??= new THREE.Frustum();
    this._pm ??= new THREE.Matrix4();
    this._sp ??= new THREE.Sphere();
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._fr.setFromProjectionMatrix(this._pm);
    const cx = camera.position.x, cz = camera.position.z, sr2 = (shadowRadius * 1.5 + 4) ** 2;
    const near2 = near * near, far2 = far * far;
    this._k ??= new Map();
    for (const type of this.parts.keys()) this._k.set(type, 0);
    for (const p of props) {
      const dx = p.pos.x - cx, dz = p.pos.z - cz, d2 = dx * dx + dz * dz;
      const sx = p.pos.x - shadowFocus.x, sz = p.pos.z - shadowFocus.z;
      let show = d2 < near2 || sx * sx + sz * sz < sr2;
      if (!show && d2 < far2) show = this._fr.intersectsSphere(this._sp.set(p.pos, 1.5 * p.scale + 0.5));
      if (!show) continue;
      const k = this._k.get(p.type);
      this._k.set(p.type, k + 1);
      this._m.compose(this._p.set(p.pos.x, p.pos.y, p.pos.z), this._q.set(p.quat.x, p.quat.y, p.quat.z, p.quat.w), this._s.setScalar(p.scale));
      for (const mesh of this.parts.get(p.type)) mesh.setMatrixAt(k, this._m);
      p.moved = false;
    }
    for (const [type, meshes] of this.parts) {
      const k = this._k.get(type);
      for (const mesh of meshes) {
        mesh.count = k;
        if (k) mesh.instanceMatrix.addUpdateRange(0, k * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
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
