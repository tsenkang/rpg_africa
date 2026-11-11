import { LAW } from '../../config/law.js';

/**
 * Caçadores de recompensa (Etapa C5) — regras puras.
 *
 * Com recompensa total ≥ `threshold`, quando o jogador viaja **fora das vilas**
 * (na estrada/trilha), de tempos em tempos um grupo de caçadores com cães
 * surge atrás dele e embosca.
 *
 * @example
 *   const dir = new HunterDirector(LAW.hunters);
 *   if (dir.update(dt, { totalBounty, onRoad, groupsAlive }, rng)) spawnAt(ambushPoint(player, forward, rng));
 */
export class HunterDirector {
  /** @param {object} [cfg] `LAW.hunters` */
  constructor(cfg = LAW.hunters) {
    this.cfg = cfg;
    /** Segundos (viajando com recompensa alta) até a próxima tentativa. */
    this.cooldown = cfg.firstDelay;
  }

  /**
   * @param {number} dt
   * @param {{ totalBounty: number, onRoad: boolean, groupsAlive: number }} ctx
   * @param {() => number} rng
   * @returns {boolean} true = soltar um grupo agora
   */
  update(dt, { totalBounty, onRoad, groupsAlive }, rng) {
    const c = this.cfg;
    if (totalBounty < c.threshold || !onRoad || groupsAlive >= c.maxGroups) return false;
    this.cooldown -= dt;
    if (this.cooldown > 0) return false;
    const [a, b] = c.interval;
    this.cooldown = a + rng() * (b - a);
    return rng() < c.chance;
  }
}

/**
 * Ponto da emboscada: atrás/de lado do jogador (fora da vista), a `spawnDist` m.
 * @param {{x:number,z:number}} player
 * @param {{x:number,z:number}} forward direção para onde o jogador olha (horizontal)
 * @param {() => number} rng
 */
export function ambushPoint(player, forward, rng, cfg = LAW.hunters) {
  const [a0, a1] = cfg.behindArc;
  const ang = ((a0 + rng() * (a1 - a0)) * Math.PI) / 180;
  const fl = Math.hypot(forward.x, forward.z) || 1, fx = forward.x / fl, fz = forward.z / fl;
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: player.x + (fx * c - fz * s) * cfg.spawnDist, z: player.z + (fx * s + fz * c) * cfg.spawnDist };
}

/**
 * Um passo do caçador: corre até o jogador e golpeia de perto com recarga.
 * Atualiza `h.cd`. Não move: devolve o deslocamento desejado.
 * @param {{ pos: {x:number,z:number}, cd: number }} h
 * @returns {{ dx: number, dz: number, attack: boolean }}
 */
export function hunterStep(h, player, dt, cfg = LAW.hunters) {
  h.cd = Math.max(0, h.cd - dt);
  const dx = player.x - h.pos.x, dz = player.z - h.pos.z, d = Math.hypot(dx, dz);
  if (d <= cfg.attackRange) {
    if (h.cd > 0) return { dx: 0, dz: 0, attack: false };
    h.cd = cfg.attackCooldown;
    return { dx: 0, dz: 0, attack: true };
  }
  const step = Math.min(d - cfg.attackRange * 0.8, cfg.speed * dt);
  return { dx: (dx / d) * step, dz: (dz / d) * step, attack: false };
}
