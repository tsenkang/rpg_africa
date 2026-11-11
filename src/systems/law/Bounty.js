import { LAW } from '../../config/law.js';

/**
 * Recompensa e procura por vila (Etapa C3) — regras puras.
 *
 * - Cada crime **testemunhado** soma na recompensa da vila onde aconteceu e
 *   abre (ou reposiciona) uma **zona de busca**: círculo em volta da última
 *   posição conhecida do jogador.
 * - Visto por um guarda daquela vila → o círculo vai para onde ele está e o
 *   contador de fuga zera.
 * - Fora do círculo e sem ser visto, o contador de fuga sobe; ao completar,
 *   a busca termina. A **recompensa continua** (só paga ela limpa — C5).
 *
 * @example
 *   const bounty = new BountyManager(LAW.bounty, { villageAt: (p) => idDaVilaMaisPerto });
 *   bounty.recordWitnessed(crime, player.position);
 *   bounty.update(dt, { playerPos: player.position, seen: (villageId) => guardaViu });
 *   bounty.wantedHere(player.position); // 'renascimento' | null
 */
export class BountyManager {
  /**
   * @param {{ searchRadius: number, escapeSeconds: number }} [cfg]
   * @param {{ villageAt: (p: {x:number, z:number}) => (string|null) }} deps região (vila) de um ponto
   */
  constructor(cfg = LAW.bounty, { villageAt }) {
    this.cfg = cfg;
    this.villageAt = villageAt;
    /** @type {Map<string, number>} recompensa por vila */
    this.bounties = new Map();
    /** @type {Map<string, { x: number, z: number, r: number, t: number, escape: number }>} busca ativa por vila */
    this.searches = new Map();
    /** Crimes já somados (várias testemunhas podem denunciar o mesmo). */
    this.counted = new WeakSet();
  }

  /** Recompensa (moedas) de uma vila. */
  bountyOf(villageId) {
    return this.bounties.get(villageId) ?? 0;
  }

  /** Soma de todas as vilas (caçadores de recompensa usam). */
  total() {
    let s = 0;
    for (const v of this.bounties.values()) s += v;
    return s;
  }

  /** Zona de busca da vila (com `escape` 0..1), ou null. */
  searchOf(villageId) {
    return this.searches.get(villageId) ?? null;
  }

  /** Vila onde o jogador está e que o procura (tem recompensa), ou null. */
  wantedHere(pos) {
    const v = this.villageAt(pos);
    return v && this.bountyOf(v) > 0 ? v : null;
  }

  /** Crime testemunhado: soma a recompensa (uma vez por crime) e abre a busca na posição do jogador. @returns {boolean} true se o crime era novo */
  recordWitnessed(crime, playerPos) {
    const fresh = !this.counted.has(crime);
    if (fresh) {
      this.counted.add(crime);
      this.bounties.set(crime.villageId, this.bountyOf(crime.villageId) + crime.bounty);
    }
    this.startSearch(crime.villageId, playerPos);
    return fresh;
  }

  /** Abre/reposiciona a busca de uma vila. */
  startSearch(villageId, p) {
    const s = this.searches.get(villageId) ?? { r: this.cfg.searchRadius, t: 0, escape: 0 };
    s.x = p.x; s.z = p.z; s.escape = 0;
    this.searches.set(villageId, s);
    return s;
  }

  /**
   * @param {number} dt
   * @param {{ playerPos: {x:number, z:number}, seen: (villageId: string) => boolean }} o
   *   `seen(v)` = algum guarda da vila `v` está vendo o jogador agora
   * @returns {string[]} vilas cuja busca terminou neste passo (o jogador escapou)
   */
  update(dt, { playerPos: p, seen }) {
    const ended = [];
    for (const v of this.bounties.keys()) {
      if (this.bountyOf(v) > 0 && seen(v)) this.startSearch(v, p);
    }
    for (const [v, s] of this.searches) {
      s.t += dt;
      const outside = Math.hypot(p.x - s.x, p.z - s.z) > s.r;
      if (!outside) continue;
      s.escape = Math.min(1, s.escape + dt / this.cfg.escapeSeconds);
      if (s.escape >= 1) { this.searches.delete(v); ended.push(v); }
    }
    return ended;
  }

  /** Ficha limpa numa vila (pagou a recompensa). */
  clear(villageId) {
    this.bounties.delete(villageId);
    this.searches.delete(villageId);
  }
}
