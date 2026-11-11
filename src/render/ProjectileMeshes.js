import * as THREE from 'three';
import { WEAPONS, PROJECTILE } from '../config/hunting.js';

const _v = new THREE.Vector3();

/**
 * Malhas das lanças e flechas em voo ou cravadas no chão: uma malha por
 * projétil vivo (poucas), apontada na direção do voo; ao cravar, afunda a
 * ponta `PROJECTILE.sink` m.
 *
 * @example
 * const pm = new ProjectileMeshes(materials); scene.add(pm.group);
 * pm.sync(projectiles.list); // a cada quadro
 */
export class ProjectileMeshes {
  constructor(M) {
    this.M = M;
    this.group = new THREE.Group();
    this.group.name = 'projectiles';
    this.group.userData.noCollide = true;
    this.byId = new Map();
    this.protos = {};
  }

  prototype(kind) {
    if (this.protos[kind]) return this.protos[kind];
    const len = kind === 'spear' ? WEAPONS.lanca_pedra.length : WEAPONS.arco.length;
    const r = kind === 'spear' ? 0.018 : 0.008;
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6).rotateX(Math.PI / 2), this.M.woodDark);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 2.2, kind === 'spear' ? 0.22 : 0.08, 6).rotateX(Math.PI / 2).translate(0, 0, len / 2), this.M.iron);
    g.add(shaft, tip);
    if (kind !== 'spear') g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.09).translate(0, 0, -len / 2 + 0.05), this.M.woodLight));
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.protos[kind] = g;
    return g;
  }

  /** @param {object[]} list Projectiles.list */
  sync(list) {
    const live = new Set();
    for (const p of list) {
      live.add(p.id);
      let m = this.byId.get(p.id);
      if (!m) {
        m = this.prototype(WEAPONS[p.weapon].kind).clone();
        this.group.add(m);
        this.byId.set(p.id, m);
      }
      if (!p.moved) continue;
      p.moved = false;
      m.position.set(p.pos.x, p.pos.y, p.pos.z);
      _v.set(p.vel.x, p.vel.y, p.vel.z);
      if (_v.lengthSq() > 1e-6) {
        _v.normalize();
        m.lookAt(m.position.x + _v.x, m.position.y + _v.y, m.position.z + _v.z);
      }
      // Cravada: a ponta afunda na direção do voo; o cabo fica para fora.
      if (p.landed) m.position.addScaledVector(_v, PROJECTILE.sink - WEAPONS[p.weapon].length / 2 + 0.15);
    }
    for (const [id, m] of this.byId) if (!live.has(id)) { this.group.remove(m); this.byId.delete(id); }
  }
}
