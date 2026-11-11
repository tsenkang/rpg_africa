import { PROJECTILE, HIT_ZONES, ZONE_EFFECTS, WEAPONS } from '../config/hunting.js';

/**
 * Projéteis de caça (regra pura, sem Three.js): lança arremessada e flecha.
 * Voo balístico simples; a cada passo o jogo testa o segmento (anterior →
 * atual) contra as hitboxes dos animais (`hitTest`) e o chão (`groundAt`).
 * Ao cravar, o projétil fica no chão como item para pegar de volta.
 *
 * @example
 * const pr = new Projectiles();
 * pr.launch({ weapon: 'lanca_pedra', item: 'lanca_pedra', x, y, z, dx, dy, dz });
 * const events = pr.step(dt, { groundAt, hitTest: (a, b) => null });
 * // events: [{ p, hit: { animal, zone, point } | null }]  (um por projétil que cravou neste passo)
 */
export class Projectiles {
  constructor(cfg = PROJECTILE) {
    this.cfg = cfg;
    this.list = [];
    this.nextId = 1;
  }

  /**
   * @param {{ weapon: keyof typeof WEAPONS, item: string, x:number, y:number, z:number, dx:number, dy:number, dz:number, speed?: number }} o
   *   `item` = o que cai no chão (a própria lança, ou a flecha)
   */
  launch({ weapon, item, x, y, z, dx, dy, dz, speed }) {
    const w = WEAPONS[weapon];
    const v = speed ?? w.speed;
    const len = Math.hypot(dx, dy, dz) || 1;
    const p = {
      id: this.nextId++, weapon, item,
      pos: { x, y, z }, prev: { x, y, z },
      vel: { x: (dx / len) * v, y: (dy / len + this.cfg.lift) * v, z: (dz / len) * v },
      life: 0, landed: false, hit: null, moved: true,
    };
    this.list.push(p);
    return p;
  }

  /**
   * Avança os projéteis em voo.
   * @param {number} dt
   * @param {{ groundAt: (x:number, z:number) => number, hitTest: (a:object, b:object, p:object) => (null | { animal:object, zone:string, point:{x,y,z} }) }} deps
   * @returns {object[]} eventos de cravada neste passo
   */
  step(dt, { groundAt, hitTest }) {
    const events = [];
    for (const p of this.list) {
      if (p.landed) continue;
      p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
      p.vel.y += this.cfg.gravity * dt;
      p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
      p.life += dt;
      p.moved = true;
      const hit = hitTest?.(p.prev, p.pos, p) ?? null;
      if (hit) {
        p.landed = true;
        p.hit = hit;
        // Cai aos pés do animal.
        p.pos.x = hit.point.x; p.pos.z = hit.point.z;
        p.pos.y = groundAt(p.pos.x, p.pos.z);
        events.push({ p, hit });
        continue;
      }
      const g = groundAt(p.pos.x, p.pos.z);
      if (p.pos.y <= g) {
        p.landed = true;
        p.pos.y = g; // cravada no chão (o render afunda a ponta)
        events.push({ p, hit: null });
      } else if (p.life > this.cfg.maxLife) {
        p.landed = true;
        p.gone = true;
        events.push({ p, hit: null });
      }
    }
    return events;
  }

  /** Tira um projétil (pegou do chão, quebrou, sumiu). */
  remove(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** Projétil cravado mais perto de `pos` (para pegar de volta), ou null. */
  nearestLanded(pos, radius = this.cfg.pickupRadius) {
    let best = null, bd = radius;
    for (const p of this.list) {
      if (!p.landed || p.gone) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}

/**
 * Zona anatômica de um ponto no espaço LOCAL da hitbox do animal.
 * @param {{x:number, y:number, z:number}} local ponto no referencial do animal (sem giro)
 * @param {{x:number, y:number, z:number}} center centro da hitbox (local)
 * @param {{x:number, y:number, z:number}} size tamanho da hitbox
 * @param {typeof HIT_ZONES} [cfg]
 * @returns {'head'|'body'|'legs'}
 */
export function classifyZone(local, center, size, cfg = HIT_ZONES) {
  const nz = (local.z - center.z) / Math.max(1e-6, size.z);
  const ny = (local.y - center.y) / Math.max(1e-6, size.y);
  if (nz > cfg.headFront && ny > cfg.headTop) return 'head';
  if (ny < cfg.legsBelow) return 'legs';
  return 'body';
}

/**
 * Dano final de um acerto: cabeça mata na hora (Infinity), pernas ×0,7…
 * @param {keyof typeof WEAPONS} weapon
 * @param {'head'|'body'|'legs'} zone
 */
export function zoneDamage(weapon, zone) {
  const m = ZONE_EFFECTS[zone]?.multiplier ?? 1;
  return m === Infinity ? Infinity : WEAPONS[weapon].damage * m;
}
