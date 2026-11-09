import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Junta geometrias estáticas (casas, muros, pontes) em poucos meshes —
 * um por material — para manter as draw calls baixas mesmo com
 * centenas de construções.
 *
 * Os UVs são reprojetados em coordenadas de mundo ("box projection"),
 * então tijolos e telhas ficam sempre em escala real, independentemente
 * do tamanho de cada peça.
 */
export class StaticBatcher {
  constructor() {
    this.buckets = new Map();
  }

  /** Adiciona `geometry` com transformação direta. */
  add(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.addMatrix(geometry, material, _m);
  }

  addMatrix(geometry, material, matrix) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    g.applyMatrix4(matrix);
    if (!material.userData.keepUV) boxProjectUV(g, material.userData.uvScale ?? 2);
    g.groups = [];
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
  }

  /** Cria os meshes finais dentro de `parent`. */
  build(parent, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [material, geos] of this.buckets) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

/** UV planar por triângulo, escolhendo o eixo dominante da face. */
function boxProjectUV(geo, scale) {
  const pos = geo.attributes.position.array;
  const uv = geo.attributes.uv.array;
  const inv = 1 / scale;
  for (let t = 0; t < pos.length; t += 9) {
    const ax = pos[t], ay = pos[t + 1], az = pos[t + 2];
    const e1x = pos[t + 3] - ax, e1y = pos[t + 4] - ay, e1z = pos[t + 5] - az;
    const e2x = pos[t + 6] - ax, e2y = pos[t + 7] - ay, e2z = pos[t + 8] - az;
    const nx = Math.abs(e1y * e2z - e1z * e2y);
    const ny = Math.abs(e1z * e2x - e1x * e2z);
    const nz = Math.abs(e1x * e2y - e1y * e2x);
    for (let k = 0; k < 3; k++) {
      const p = t + k * 3;
      const u = (t / 3 + k) * 2;
      if (ny >= nx && ny >= nz) { uv[u] = pos[p] * inv; uv[u + 1] = pos[p + 2] * inv; }
      else if (nx >= nz) { uv[u] = pos[p + 2] * inv; uv[u + 1] = pos[p + 1] * inv; }
      else { uv[u] = pos[p] * inv; uv[u + 1] = pos[p + 1] * inv; }
    }
  }
}
