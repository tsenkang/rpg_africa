import { LAW } from '../../config/law.js';

/**
 * Registro de crimes do jogador (regras puras, sem Three.js).
 *
 * Todo crime nasce **sem testemunha** (`witnessed: false`). O sistema de
 * testemunhas (Etapa C2) marca `witnessed = true` quando um civil vê o crime e
 * avisa um guarda; só então ele entra na recompensa da vila (`witnessedBounty`).
 *
 * @example
 *   const log = new CrimeLog();
 *   log.onCrime = (c) => console.log(c.label);
 *   const c = log.report({ type: 'agressao', villageId: 'renascimento', x, z, time });
 *   c.witnessed = true;
 *   log.witnessedBounty('renascimento'); // 50
 */
export class CrimeLog {
  /** @param {Record<string, { label: string, bounty: number }>} [crimes] tabela de crimes (`LAW.crimes`) */
  constructor(crimes = LAW.crimes) {
    this.crimes = crimes;
    /** @type {object[]} todos os crimes, em ordem */
    this.list = [];
    this.nextId = 1;
    /** @type {null | ((crime: object) => void)} chamado a cada crime novo */
    this.onCrime = null;
  }

  /**
   * Registra um crime.
   * @param {{ type: string, villageId: string, x?: number, z?: number, time?: number, victimId?: string|null, details?: object }} c
   * @returns {object} o registro ({ id, type, label, bounty, villageId, x, z, time, victimId, witnessed, ...details })
   */
  report({ type, villageId, x = 0, z = 0, time = 0, victimId = null, details = {} }) {
    const def = this.crimes[type];
    if (!def) throw new Error(`Crime desconhecido: ${type}`);
    const crime = { id: this.nextId++, type, label: def.label, bounty: def.bounty, villageId, x, z, time, victimId, witnessed: false, ...details };
    this.list.push(crime);
    this.onCrime?.(crime);
    return crime;
  }

  /** Crimes cometidos numa vila. */
  byVillage(villageId) {
    return this.list.filter((c) => c.villageId === villageId);
  }

  /** Soma da recompensa dos crimes testemunhados numa vila. */
  witnessedBounty(villageId) {
    let sum = 0;
    for (const c of this.list) if (c.villageId === villageId && c.witnessed) sum += c.bounty;
    return sum;
  }
}

/**
 * Zona de acerto num humano pela altura do impacto acima dos pés.
 * @param {number} y metros acima dos pés
 * @param {{ headAbove: number, legsBelow: number }} [cfg]
 * @returns {'head'|'body'|'legs'}
 * @example humanZone(1.7); // 'head'
 */
export function humanZone(y, cfg = LAW.hitZones) {
  if (y > cfg.headAbove) return 'head';
  if (y < cfg.legsBelow) return 'legs';
  return 'body';
}

/**
 * Sorteia o que se acha ao vasculhar uma casa.
 * Cada sorteio usa dois números do `rng`: um para a entrada (por peso), outro para a quantidade.
 * @param {{ id?: string, coins?: boolean, weight: number, count: [number, number] }[]} table
 * @param {number} rolls quantos sorteios
 * @param {() => number} rng
 * @returns {({ id: string, count: number } | { coins: number })[]}
 * @example rollLoot(LAW.theft.loot, 2, Math.random);
 */
export function rollLoot(table, rolls, rng) {
  const total = table.reduce((s, e) => s + e.weight, 0);
  const out = [];
  for (let i = 0; i < rolls; i++) {
    let r = rng() * total, e = table[table.length - 1];
    for (const cand of table) { if (r < cand.weight) { e = cand; break; } r -= cand.weight; }
    const [lo, hi] = e.count;
    const n = lo + Math.floor(rng() * (hi - lo + 1));
    out.push(e.coins ? { coins: n } : { id: e.id, count: n });
  }
  return out;
}

/**
 * Detecta invasão: o jogador ficou `grace` segundos dentro da mesma casa alheia.
 * Dispara uma vez por visita; sair (id null) ou trocar de casa recomeça.
 * @example
 *   const t = new TrespassTracker(1.5);
 *   if (t.update(homeIdOuNull, dt)) log.report({ type: 'invasao', ... });
 */
export class TrespassTracker {
  constructor(grace = LAW.trespass.graceSeconds) {
    this.grace = grace;
    this.homeId = null;
    this.time = 0;
    this.fired = false;
  }

  /** @returns {boolean} true no instante em que a invasão passa a contar */
  update(homeId, dt) {
    if (homeId !== this.homeId) { this.homeId = homeId; this.time = 0; this.fired = false; }
    if (!homeId || this.fired) return false;
    this.time += dt;
    if (this.time > this.grace) { this.fired = true; return true; }
    return false;
  }
}
