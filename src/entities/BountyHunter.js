import * as THREE from 'three';
import { Humanoid } from './Humanoid.js';
import { applyGesture } from './NPCAgent.js';
import { hunterStep } from '../systems/law/Hunters.js';
import { LAW } from '../config/law.js';

const HITBOX_MAT = new THREE.MeshBasicMaterial({ visible: false });
const HITBOX_GEO = new THREE.BoxGeometry(1, 1, 1);

/**
 * Caçador de recompensa: humano armado (couro e correias escuras) que corre
 * até o jogador e golpeia de perto. Pode ser socado (perde vida) ou morto por
 * lança/flecha. Matar caçador não é crime.
 *
 * Compatível com `SpeechBubbles` (tem `model`, `look.height`, `rendered`).
 *
 * @example
 *   const h = new BountyHunter({ x, z, name: 'Caçador', group: 1 });
 *   scene.add(h.model.root);
 *   if (h.update(dt, player.position, { move, groundAt })) game.damagePlayer(LAW.hunters.damage, 'Caçador', null, h);
 */
export class BountyHunter {
  constructor({ x, z, name, group, cfg = LAW.hunters, skin = undefined }) {
    this.cfg = cfg;
    this.name = name;
    this.group = group;
    this.look = { height: 1.82 };
    this.model = new Humanoid({ height: 1.82, ...cfg.look, ...(skin !== undefined ? { skin } : {}) });
    this.model.root.userData.hunter = this;
    const hb = new THREE.Mesh(HITBOX_GEO, HITBOX_MAT);
    hb.scale.set(LAW.hitbox.w, LAW.hitbox.h, LAW.hitbox.d);
    hb.position.y = LAW.hitbox.h / 2;
    hb.userData.hunter = this;
    this.model.root.add(hb);
    this.hitbox = hb;
    this.pos = { x, y: 0, z };
    this.yaw = 0;
    this.cd = 0.8; // primeiro golpe só depois de chegar
    this.health = cfg.health;
    this.life = 'ALIVE';
    this.rendered = true;
    this.t = 0;
    this.speed = 0;
  }

  get alive() {
    return this.life === 'ALIVE';
  }

  /** Perde vida; a zero, morre. */
  hurt(n) {
    if (!this.alive) return;
    this.health -= n;
    this.model.flinch?.();
    if (this.health <= 0) this.kill();
  }

  kill() {
    this.life = 'DEAD';
    this.speed = 0;
  }

  /**
   * @param {number} dt
   * @param {{x:number, z:number}} player
   * @param {{ move: (pos: object, dx: number, dz: number) => void, groundAt: (x: number, z: number, feet: number) => number, playerAlive: boolean }} deps
   * @returns {boolean} true quando golpeia o jogador neste passo
   */
  update(dt, player, { move, groundAt, playerAlive }) {
    this.t += dt;
    const m = this.model;
    let attack = false;
    if (this.alive && playerAlive) {
      const r = hunterStep(this, player, dt, this.cfg);
      if (r.dx || r.dz) { move(this.pos, r.dx, r.dz); this.yaw = Math.atan2(r.dx, r.dz); }
      else this.yaw = Math.atan2(player.x - this.pos.x, player.z - this.pos.z);
      this.speed = Math.hypot(r.dx, r.dz) / Math.max(dt, 1e-4);
      attack = r.attack;
    } else this.speed = 0;
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3);
    m.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    m.root.rotation.y = this.yaw;
    m.update(dt, this.speed, { sprinting: this.speed > 4.5 });
    if (!this.alive) { m.body.rotation.x = -Math.PI / 2; m.body.rotation.z = 0.35; m.body.position.y = 0.16; return false; }
    const near = Math.hypot(player.x - this.pos.x, player.z - this.pos.z) <= this.cfg.attackRange * 1.3;
    if (near) applyGesture(m, 'thrust', this.t);
    return attack;
  }
}
