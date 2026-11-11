import * as THREE from 'three';
import { PHANTOMS } from '../config/character.js';

const _v = new THREE.Vector3();

/**
 * Criaturas fantasmas (alucinação nível 3): sombras altas e magras, olhos
 * acesos, que surgem longe do jogador, caminham até ele e se desfazem quando
 * ele chega perto. Só o jogador as vê: não colidem, não entram no combate,
 * não aparecem no minimapa.
 *
 * @example
 * const h = new Hallucinations(); scene.add(h.group);
 * h.onSpawn = () => sanity.drainSanity(PHANTOMS.dread, 'Vulto');
 * h.update(dt, { level, player: pos, groundAt, rng }); // a cada quadro
 */
export class Hallucinations {
  constructor(cfg = PHANTOMS) {
    this.cfg = cfg;
    this.group = new THREE.Group();
    this.group.name = 'hallucinations';
    this.group.userData.noCollide = true;
    this.phantoms = [];
    this.nextIn = 4;
    this.onSpawn = null;
    this.body = new THREE.MeshBasicMaterial({ color: 0x050308, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.eyes = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, fog: false, toneMapped: false });
    this.geos = {
      torso: new THREE.CapsuleGeometry(0.22, 1.1, 4, 8).translate(0, 1.55, 0),
      head: new THREE.SphereGeometry(0.17, 10, 8).translate(0, 2.42, 0),
      limb: new THREE.CapsuleGeometry(0.06, 1.15, 3, 6),
      eye: new THREE.SphereGeometry(0.028, 6, 4),
    };
  }

  /** Monta uma sombra (materiais próprios para cada uma poder sumir sozinha). */
  make() {
    const g = new THREE.Group();
    const body = this.body.clone(), eyes = this.eyes.clone();
    g.add(new THREE.Mesh(this.geos.torso, body), new THREE.Mesh(this.geos.head, body));
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(this.geos.limb, body);
      arm.position.set(s * 0.3, 1.5, 0); arm.rotation.z = s * 0.12;
      const leg = new THREE.Mesh(this.geos.limb, body);
      leg.position.set(s * 0.12, 0.6, 0);
      const eye = new THREE.Mesh(this.geos.eye, eyes);
      eye.position.set(s * 0.06, 2.45, 0.15);
      g.add(arm, leg, eye);
    }
    g.userData = { body, eyes };
    return g;
  }

  /**
   * @param {number} dt
   * @param {{ level: number, player: {x,y,z}, groundAt: (x:number, z:number) => number, rng?: () => number, active?: boolean }} o
   */
  update(dt, { level, player, groundAt, rng = Math.random, active = true }) {
    const c = this.cfg;
    if (active && level >= 3) {
      this.nextIn -= dt;
      if (this.nextIn <= 0 && this.phantoms.length < c.max) {
        this.nextIn = c.spawnEvery[0] + rng() * (c.spawnEvery[1] - c.spawnEvery[0]);
        const a = rng() * Math.PI * 2, d = c.spawnDistance[0] + rng() * (c.spawnDistance[1] - c.spawnDistance[0]);
        const x = player.x + Math.cos(a) * d, z = player.z + Math.sin(a) * d;
        const root = this.make();
        root.position.set(x, groundAt(x, z), z);
        this.group.add(root);
        this.phantoms.push({ root, age: 0, fading: 0, flicker: rng() * 10 });
        this.onSpawn?.();
      }
    }
    for (const p of [...this.phantoms]) {
      p.age += dt;
      const r = p.root, pos = r.position;
      const dx = player.x - pos.x, dz = player.z - pos.z, dist = Math.hypot(dx, dz);
      // Some: chegou perto, a sanidade voltou, ou o tempo acabou.
      if (!p.fading && (dist < c.vanishDistance || level < 3 || !active || p.age > c.life)) p.fading = 1e-6;
      if (p.fading) p.fading += dt;
      else if (dist > 0.1) {
        pos.x += (dx / dist) * c.speed * dt;
        pos.z += (dz / dist) * c.speed * dt;
        pos.y = groundAt(pos.x, pos.z);
        r.rotation.y = Math.atan2(dx, dz);
      }
      const fadeIn = Math.min(1, p.age / 1.5), fadeOut = p.fading ? Math.max(0, 1 - p.fading / c.fade) : 1;
      const flicker = 0.75 + 0.25 * Math.sin(p.age * 9 + p.flicker) * Math.sin(p.age * 2.3);
      r.userData.body.opacity = 0.78 * fadeIn * fadeOut * flicker;
      r.userData.eyes.opacity = fadeIn * fadeOut;
      // Desfazendo: estica para cima e afina, como fumaça.
      if (p.fading) r.scale.set(1 - p.fading * 0.8, 1 + p.fading * 0.9, 1 - p.fading * 0.8);
      if (p.fading >= c.fade) {
        this.group.remove(r);
        r.userData.body.dispose(); r.userData.eyes.dispose();
        this.phantoms.splice(this.phantoms.indexOf(p), 1);
      }
    }
    _v.set(0, 0, 0);
  }

  /** Some com todas na hora (respawn, troca de área). */
  clear() {
    for (const p of this.phantoms) this.group.remove(p.root);
    this.phantoms.length = 0;
  }
}
