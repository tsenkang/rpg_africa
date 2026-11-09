import * as THREE from 'three';
import { StaticBatcher } from '../render/StaticBatcher.js';
import { NPC } from '../entities/NPC.js';
import { SKIN_TONES } from '../entities/Humanoid.js';
import { mulberry32 } from '../world/Noise.js';
import { uvToWorld } from '../config/worldConfig.js';
import { VILLAGE_LAYOUT, CLUTTER } from '../config/settlements.js';
import { poissonAnnulus, faceStreet, randInt } from './Layout.js';
import * as B from './Builders.js';
import { Mechanics } from '../systems/Mechanics.js';

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
    /** Árvores fixas (palmeiras do oásis…) — a Vegetation planta depois. */
    this.plants = [];
    /** Fontes de luz viva (fogueiras, luzes errantes) — viram FireLights. */
    this.fires = [];
    /** Luzes errantes (malhas) animadas no update. */
    this.wisps = [];
    /** "Presenças" paranormais fixas: a névoa engrossa perto ({x, z, reach}). */
    this.presences = [];
    /** Objetos dinâmicos (barris, caixotes…) — viram corpos no PhysicsWorld. */
    this.props = [];
    this.rnd = mulberry32(seed);
    this.ctx = {
      batch: new StaticBatcher(),
      dynamic: this.dynamic,
      collisions: game.collisions,
      terrain: game.terrain,
      M: game.materials,
      rnd: this.rnd,
      plants: this.plants,
      props: this.props,
      surfaces: game.surfaces, // chão com andares (plataformas, pontes, palafitas)
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

  /**
   * Ancião que conta a história da vila (lore de VILLAGES[id].lore).
   * @example v.addElder(cx + 3, cz, Math.PI)
   */
  addElder(x, z, facing = 0) {
    const lore = this.config.lore;
    return this.addNPC({
      id: `${this.config.id}-anciao`, name: lore.speaker, title: lore.title, look: lore.look ?? {},
      x, z, facing, onInteract: (g) => Mechanics.lore(g, lore),
    });
  }

  /**
   * Fogueira com luz dinâmica laranja (FireLights) e chamas tremulando.
   * @param {{flames: THREE.Mesh[], light: {x,y,z}}} fire retorno de bonfire()
   * @param {{intensity?: number, range?: number}} [o]
   */
  addFire(fire, { intensity = 40, range = 24 } = {}) {
    this.fires.push({ ...fire.light, color: 0xff8a3a, intensity, range, flames: fire.flames, warm: true }); // warm: aquece (cancela o frio)
  }

  /** Poste de lanterna: luz amarela real quando perto (FireLights). */
  addLamp(lamp) {
    this.fires.push({ ...lamp.light, color: 0xffc77a, intensity: 14, range: 15 });
  }

  /** Luz errante roxa (ruínas): flutua e ganha luz real quando perto. */
  addWisp(mesh) {
    const light = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, color: 0x9a5aff, intensity: 8, range: 14 };
    mesh.userData.light = light;
    this.wisps.push(mesh);
    this.fires.push(light);
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

  /**
   * Espalha casas de forma orgânica (Poisson Disk no anel de VILLAGE_LAYOUT),
   * cada uma virada para a rua mais próxima com um desvio aleatório, e
   * depois decora os quintais (cercas, barris, caixotes, arbustos, pedras),
   * pinta terra batida em volta e uma trilha da porta até a rua.
   *
   * @param {(x:number, z:number, rot:number) => ({ door?: {x:number,z:number}, w?: number, d?: number, r: number } | null)} build
   *   constrói UMA casa e devolve a porta e o raio ocupado (m); null = pula
   * @param {object} [overrides] sobrescreve campos de VILLAGE_LAYOUT[id]
   * @returns {number} quantas casas foram construídas
   * @example
   * v.scatterHouses((x, z, rot) => {
   *   const info = B.house(ctx, { x, z, rot, w: 7, d: 6 });
   *   return { door: info.door, w: 7, d: 6, r: 4.6 };
   * });
   */
  scatterHouses(build, overrides = {}) {
    const cfg = { ...VILLAGE_LAYOUT[this.config.id], ...overrides };
    const outer = cfg.outer <= 0 ? this.radius + cfg.outer : cfg.outer;
    const pts = poissonAnnulus({
      cx: this.x, cz: this.z, inner: cfg.inner, outer, spacing: cfg.spacing, rng: this.rnd,
      accept: (x, z) => this.isFree(x, z, cfg.spacing * 0.36),
    });
    const placed = [];
    for (const p of pts) {
      const { rot, street } = faceStreet(p.x, p.z, {
        streets: this.streets, cx: this.x, cz: this.z, reach: cfg.streetReach, jitter: cfg.jitter, rng: this.rnd,
      });
      const info = build(p.x, p.z, rot);
      if (!info) continue;
      this.reserve(p.x, p.z, info.r);
      placed.push({ ...info, x: p.x, z: p.z, rot, street });
    }
    // Segunda passada: só agora os quintais (as casas já ocupam seu lugar).
    for (const h of placed) {
      this.paintDisc(h.x, h.z, h.r + 2.5, CLUTTER.yardDirt.color, CLUTTER.yardDirt.strength);
      if (h.door && h.street && h.street.dist <= cfg.pathMax) {
        this.shapes.push({ type: 'segment', ax: h.door.x, az: h.door.z, bx: h.street.x, bz: h.street.z, ...CLUTTER.path });
      } else if (h.door) {
        // Sem rua por perto: trilha até a porta do vizinho mais próximo
        // (as trilhas formam uma rede entre as casas).
        let best = null, bd = cfg.pathMax * 1.2;
        for (const o of placed) {
          if (o === h || !o.door) continue;
          const dd = Math.hypot(o.door.x - h.door.x, o.door.z - h.door.z);
          if (dd < bd) { bd = dd; best = o; }
        }
        if (best) this.shapes.push({ type: 'segment', ax: h.door.x, az: h.door.z, bx: best.door.x, bz: best.door.z, ...CLUTTER.path });
      }
      this.decorateYard(h);
    }
    return placed.length;
  }

  /**
   * Objetos soltos em volta de uma casa, longe da porta e fora das ruas.
   * @param {{x:number, z:number, rot:number, r:number, w?:number, d?:number}} h
   */
  decorateYard(h) {
    const { ctx, rnd } = this;
    const spot = (pad) => {
      for (let t = 0; t < 8; t++) {
        // Ângulo longe da frente (a porta fica em rot, na direção +Z local).
        const a = Math.PI / 2 - h.rot + (0.7 + rnd() * (Math.PI * 2 - 1.4));
        const dist = h.r + 0.6 + rnd() * CLUTTER.yard;
        const x = h.x + Math.cos(a) * dist, z = h.z + Math.sin(a) * dist;
        if (this.isFree(x, z, pad)) return { x, z };
      }
      return null;
    };
    const solid = (p, r) => { this.reserve(p.x, p.z, r); ctx.collisions.addCircle(p.x, p.z, r, 'clutter'); };
    // Barris e caixotes são dinâmicos (física): só reservam o lugar, sem parede fixa.
    const prop = (p, r) => this.reserve(p.x, p.z, r);
    for (let i = randInt(CLUTTER.barrels, rnd); i > 0; i--) {
      const p = spot(0.5); if (!p) break;
      B.barrel(ctx, p); prop(p, 0.4);
    }
    for (let i = randInt(CLUTTER.crates, rnd); i > 0; i--) {
      const p = spot(0.6); if (!p) break;
      const sz = 0.6 + rnd() * 0.35;
      B.crate(ctx, { ...p, s: sz, rot: rnd() * 3 });
      if (rnd() < 0.35) B.crate(ctx, { x: p.x + (rnd() - 0.5) * 0.2, z: p.z + (rnd() - 0.5) * 0.2, s: sz * 0.75, rot: rnd() * 3, y: sz });
      prop(p, sz * 0.6);
    }
    for (let i = randInt(CLUTTER.bushes, rnd); i > 0; i--) {
      const p = spot(0.8); if (!p) break;
      B.bush(ctx, { ...p, s: 0.7 + rnd() * 0.7 });
      this.reserve(p.x, p.z, 0.6);
    }
    for (let i = randInt(CLUTTER.rocks, rnd); i > 0; i--) {
      const p = spot(0.4); if (!p) break;
      const s = 0.25 + rnd() * 0.5;
      B.rock(ctx, { ...p, s });
      if (s > 0.5) solid(p, s * 0.7);
    }
    if (h.w && rnd() < CLUTTER.fenceChance) {
      // Cerca num dos lados do quintal (lado esquerdo ou direito da casa).
      const side = rnd() < 0.5 ? -1 : 1;
      const off = h.w / 2 + 1.6 + rnd() * 1.5;
      const a = B.local(h.x, h.z, h.rot, side * off, h.d / 2 - 0.5);
      const b = B.local(h.x, h.z, h.rot, side * (off + (rnd() - 0.5) * 0.8), -h.d / 2 - 2 - rnd() * 3);
      if (this.isFree((a.x + b.x) / 2, (a.z + b.z) / 2, 0.8) && this.isFree(a.x, a.z, 0.3) && this.isFree(b.x, b.z, 0.3)) {
        B.fenceRun(ctx, { ax: a.x, az: a.z, bx: b.x, bz: b.z });
        ctx.collisions.addWall(a.x, a.z, b.x, b.z, 0.2, 'fence');
      }
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
      // Respiração: o corpo incha no eixo Y (e um pouco no X) num ritmo lento.
      const breath = Math.sin(u.phase * u.breathRate);
      u.body.scale.y = u.bodyScale.y * (1 + breath * 0.035);
      u.body.scale.x = u.bodyScale.x * (1 + breath * 0.02);
    }
    for (const m of this.wisps) {
      const u = m.userData;
      u.phase += dt;
      m.position.set(
        u.home.x + Math.cos(u.phase * 0.31) * 1.8,
        u.home.y + Math.sin(u.phase * 0.9) * 0.45,
        u.home.z + Math.sin(u.phase * 0.27) * 1.8,
      );
      m.scale.setScalar(u.base.x * (0.85 + 0.15 * Math.sin(u.phase * 3.1)));
      u.light.x = m.position.x; u.light.y = m.position.y; u.light.z = m.position.z;
    }
    this.gate?.update(dt);
  }
}
