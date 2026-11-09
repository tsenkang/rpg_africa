import * as THREE from 'three';
import { StaticBatcher } from '../render/StaticBatcher.js';
import { NPC } from '../entities/NPC.js';
import { SKIN_TONES } from '../entities/Humanoid.js';
import { mulberry32 } from '../world/Noise.js';
import { uvToWorld } from '../config/worldConfig.js';

const SHIRTS = [0xb5382a, 0x2f5d8a, 0xd9a02a, 0x4a7a3a, 0x7a3a6a, 0xe0d8c8, 0x8a5a2a, 0x1f6a6a, 0xc0602a];
const PANTS = [0x3a3028, 0x2a2a30, 0x5a4a3a, 0x4a3a2a, 0x2e3a4a];

/**
 * Base comum das vilas: contexto de construção, NPCs, transeuntes,
 * pintura do chão (ruas/praças) e cull por distância.
 */
export class Village {
  constructor(game, config, seed) {
    this.game = game;
    this.config = config;
    const c = uvToWorld(config.u, config.v);
    this.x = c.x;
    this.z = c.z;
    this.radius = config.radius;
    this.group = new THREE.Group();
    this.group.name = config.id;
    this.dynamic = new THREE.Group();
    this.group.add(this.dynamic);
    this.npcs = [];
    this.animals = [];
    this.shapes = []; // pinturas no terreno
    this.streets = []; // segmentos [{ax,az,bx,bz}] para transeuntes
    this.reserved = [];
    this.rnd = mulberry32(seed);
    this.ctx = {
      batch: new StaticBatcher(),
      dynamic: this.dynamic,
      collisions: game.collisions,
      terrain: game.terrain,
      M: game.materials,
      rnd: this.rnd,
    };
  }

  get y() {
    return this.game.terrain.heightAt(this.x, this.z);
  }

  /** Reserva uma área circular (para não colocar casas em cima). */
  reserve(x, z, r) {
    this.reserved.push({ x, z, r });
  }

  isFree(x, z, r) {
    for (const s of this.reserved) if (Math.hypot(x - s.x, z - s.z) < s.r + r) return false;
    if (this.game.collisions.overlaps(x, z, r)) return false;
    return true;
  }

  /** Rua de terra: pinta o chão e vira caminho de transeuntes. */
  street(ax, az, bx, bz, width = 5, color = 0x6e5840) {
    this.shapes.push({ type: 'segment', ax, az, bx, bz, width, color, strength: 0.8 });
    this.streets.push({ ax, az, bx, bz, width });
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= len; t += 6) {
      const k = t / len;
      this.reserve(ax + (bx - ax) * k, az + (bz - az) * k, width / 2 + 1.5);
    }
  }

  paintDisc(x, z, r, color, strength = 0.85) {
    this.shapes.push({ type: 'disc', x, z, r, color, strength, soft: 2 });
  }

  randomLook(extra = {}) {
    const r = this.rnd;
    const hats = [null, null, null, 'straw', 'wrap'];
    return {
      skin: SKIN_TONES[Math.floor(r() * SKIN_TONES.length)],
      shirt: SHIRTS[Math.floor(r() * SHIRTS.length)],
      pants: PANTS[Math.floor(r() * PANTS.length)],
      hat: hats[Math.floor(r() * hats.length)],
      robe: r() < 0.3,
      height: 1.62 + r() * 0.28,
      build: 0.9 + r() * 0.25,
      ...extra,
    };
  }

  /**
   * Cria um NPC. Se `onInteract` for passado, ele vira interagível (E).
   */
  addNPC({ id, name, title = '', look = {}, x, z, y, facing = 0, path = null, onInteract = null, radius = 3, area = 'overworld' }) {
    const groundAt = (px, pz) => this.game.groundHeight(px, pz);
    const npc = new NPC({
      id, name, title, look: { ...this.randomLook(), ...look }, x, z,
      y: y ?? groundAt(x, z), facing, path, groundAt: path ? groundAt : null, area,
    });
    this.dynamic.add(npc.root);
    this.npcs.push(npc);
    npc.onInteract = onInteract; // também usado pelo clique (Raycaster) para conversar
    if (onInteract) {
      this.game.interactions.register({
        id, label: `Falar com ${name}`, area, radius,
        position: () => npc.interactionPoint(),
        onInteract,
      });
      npc.interactive = true;
    }
    return npc;
  }

  /** Transeuntes andando pelas ruas. */
  addWanderers(count, lookExtra = {}) {
    for (let i = 0; i < count && this.streets.length; i++) {
      const s = this.streets[Math.floor(this.rnd() * this.streets.length)];
      const side = (this.rnd() - 0.5) * s.width * 0.6;
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
      const nx = -(s.bz - s.az) / len, nz = (s.bx - s.ax) / len;
      const a = { x: s.ax + nx * side, z: s.az + nz * side };
      const b = { x: s.bx + nx * side, z: s.bz + nz * side };
      const t = this.rnd();
      const npc = this.addNPC({
        id: `${this.config.id}-walker-${i}`, name: 'Morador',
        look: lookExtra, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
        path: this.rnd() < 0.5 ? [b, a] : [a, b],
      });
      npc.speed = 1.1 + this.rnd() * 0.5;
    }
  }

  /** Une a geometria estática e adiciona a vila à cena. */
  finalize() {
    this.ctx.batch.build(this.group);
    this.game.scene.add(this.group);
  }

  /** Forma de pintura para o Terrain (chamada antes de gerar a malha). */
  paint() {
    return { x: this.x, z: this.z, radius: this.radius + 160, shapes: this.shapes };
  }

  update(dt, playerPos) {
    const d = Math.hypot(playerPos.x - this.x, playerPos.z - this.z);
    this.group.visible = d < 1500;
    this.dynamic.visible = d < this.radius + 450;
    if (d > this.radius + 300) return;
    for (const npc of this.npcs) npc.update(dt, playerPos);
    for (const a of this.animals) {
      const u = a.userData;
      u.phase += dt;
      u.head.rotation.x = Math.sin(u.phase * 0.7) * 0.25 + 0.2;
    }
    this.gate?.update(dt);
  }
}
