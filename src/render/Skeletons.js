import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKELETONS } from '../config/character.js';
import { mulberry32 } from '../world/Noise.js';

/** Ossada deitada (crânio, costelas, ossos longos) numa só geometria. */
function skeletonGeometry() {
  const parts = [];
  parts.push(new THREE.SphereGeometry(0.11, 10, 8).scale(1, 0.9, 1.15).translate(0, 0.09, 0.85)); // crânio
  parts.push(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6).rotateX(Math.PI / 2).translate(0, 0.04, 0.4)); // coluna
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) parts.push(new THREE.TorusGeometry(0.13, 0.012, 4, 8, Math.PI * 0.7).rotateY(Math.PI / 2).rotateZ(s * 0.3).translate(s * 0.02, 0.06, 0.62 - i * 0.07));
  }
  for (const s of [-1, 1]) {
    parts.push(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5).rotateX(Math.PI / 2 - s * 0.2).translate(s * 0.22, 0.03, 0.45)); // braço
    parts.push(new THREE.CylinderGeometry(0.028, 0.028, 0.75, 5).rotateX(Math.PI / 2).rotateY(s * 0.15).translate(s * 0.12, 0.03, -0.3)); // fêmur/canela
  }
  parts.push(new THREE.SphereGeometry(0.12, 8, 6).scale(1.3, 0.5, 0.8).translate(0, 0.05, 0.02)); // bacia
  const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of geos) { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); }
  return mergeGeometries(geos);
}

/**
 * Ossadas espalhadas pelo mapa (Ruínas de Kaelen, arredores do deserto).
 * Encontrar uma (perto e à vista) é trauma de sanidade, uma vez por ossada.
 *
 * @example
 * const sk = new Skeletons(game); scene.add(sk.mesh);
 * sk.noticed(pos, forward); // → ossada recém-vista ou null
 */
export class Skeletons {
  constructor({ villages, groundAt, seed = 1, cfg = SKELETONS }) {
    this.cfg = cfg;
    this.sites = [];
    const rng = mulberry32(seed * 7919 + 13);
    for (const site of cfg.sites) {
      const v = villages[site.village];
      if (!v) continue;
      for (let k = 0; k < site.count; k++) {
        const a = rng() * Math.PI * 2;
        const r = site.outside ? v.radius + site.outside[0] + rng() * (site.outside[1] - site.outside[0]) : site.ring[0] + rng() * (site.ring[1] - site.ring[0]);
        const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
        this.sites.push({ x, y: groundAt(x, z), z, rot: rng() * Math.PI * 2, seen: false });
      }
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.85 });
    this.mesh = new THREE.InstancedMesh(skeletonGeometry(), mat, Math.max(1, this.sites.length));
    this.mesh.name = 'skeletons';
    this.mesh.userData.noCollide = true;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.sites.forEach((s, i) => {
      q.setFromEuler(e.set(0, s.rot, 0));
      m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(1, 1, 1));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.count = this.sites.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  /**
   * Ossada que o jogador acabou de ver (perto e na frente), marcada como vista.
   * @param {{x:number, z:number}} pos
   * @param {{x:number, z:number}} fwd direção do olhar (unitária no plano)
   * @param {number} [minDot]
   */
  noticed(pos, fwd, minDot = 0.3) {
    for (const s of this.sites) {
      if (s.seen) continue;
      const dx = s.x - pos.x, dz = s.z - pos.z, d = Math.hypot(dx, dz);
      if (d > this.cfg.noticeRadius) continue;
      if (d > 1.5 && (dx * fwd.x + dz * fwd.z) / d < minDot) continue;
      s.seen = true;
      return s;
    }
    return null;
  }
}
