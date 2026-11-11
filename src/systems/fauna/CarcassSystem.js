import { CARCASS, ECOSYSTEM } from '../../config/ecosystem.js';

/**
 * Carcaças (Etapa F4) — regras puras, sem Three.js.
 *
 * A presa abatida perto do jogador vira uma carcaça com `meat` = vida máxima dela.
 * A cada quadro:
 *  - predadores com fome (> `eatAbove`) num raio curto e **necrófagos** (hiena,
 *    corvo) num raio grande (o cheiro) recebem `eco.feedAt` = um lugar em volta
 *    da carcaça; chegando lá comem: a carne cai e a fome deles também;
 *  - necrófago **espera** a `waitRadius` (`feedAt.wait`) enquanto um predador
 *    mais forte (nível menor) está comendo — a hiena rodeia o leão;
 *  - a carcaça some quando passa `lifetime` (ou vira ossos quando acaba a carne).
 * Comida parada vence a caçada: quem está perto larga a presa viva e vem comer.
 * Quem foge, revida ou mira o jogador não é chamado.
 *
 * @example
 *   const cs = new CarcassSystem();
 *   cs.add(zebra);                                    // abate perto do jogador
 *   for (const c of cs.update(dt, animais)) fauna.remove(c.animal); // decompôs
 */
export class CarcassSystem {
  constructor(cfg = CARCASS, eco = ECOSYSTEM) {
    this.cfg = cfg;
    this.mealPerHealth = eco.hunger.mealPerHealth;
    this.scav = new Set(cfg.scavengers);
    /** @type {{ animal: object, x: number, z: number, meat: number, max: number, age: number, eaters: object[] }[]} */
    this.list = [];
  }

  /** Cria a carcaça de um animal morto (uma vez por animal). */
  add(prey) {
    if (this.of(prey)) return this.of(prey);
    const max = prey.spec?.health ?? 60;
    const c = { animal: prey, x: prey.position.x, z: prey.position.z, meat: max, max, age: 0, eaters: [] };
    prey.carcass = c;
    this.list.push(c);
    return c;
  }

  of(animal) {
    return this.list.find((c) => c.animal === animal) ?? null;
  }

  /** 0..1 da carne que resta (1 fresca, 0 ossos). */
  static fresh(c) {
    return c.max ? c.meat / c.max : 0;
  }

  /**
   * @param {number} dt
   * @param {object[]} animals vivos e mortos (só os vivos com `eco` comem)
   * @returns {object[]} carcaças que decompuseram neste passo (remover do mundo)
   */
  update(dt, animals) {
    const cfg = this.cfg, gone = [];
    for (const a of animals) if (a.eco) a.eco.feedAt = null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.age += dt;
      if (c.age >= cfg.lifetime) { this.list.splice(i, 1); gone.push(c); continue; }
      this.seat(c, animals, dt);
    }
    return gone;
  }

  /** Quem come, quem espera, e a carne que vai embora. */
  seat(c, animals, dt) {
    const cfg = this.cfg;
    c.eaters.length = 0;
    if (c.meat <= 0) return;
    const cands = [];
    for (const a of animals) {
      const e = a.eco;
      if (!a.alive || !e || a === c.animal || e.feedAt) continue;
      if (e.threat || e.retaliate || a.brain?.angry) continue; // comida parada vence a caçada (até a do jogador)
      const scav = this.scav.has(a.speciesId);
      if (!scav && !e.predator) continue;
      if (e.needs.hunger <= (scav ? cfg.scavengeAbove : cfg.eatAbove)) continue;
      const d = Math.hypot(a.position.x - c.x, a.position.z - c.z);
      if (d > (scav ? cfg.attract.scavenger : cfg.attract.predator)) continue;
      cands.push(a);
    }
    // Mais forte primeiro (nível menor); necrófago espera enquanto um mais forte come.
    cands.sort((a, b) => a.eco.level - b.eco.level);
    const top = cands.length ? cands[0].eco.level : 9;
    let k = 0;
    for (const a of cands) {
      const scav = this.scav.has(a.speciesId);
      const wait = (scav && a.eco.level > top) || k >= cfg.maxEaters;
      const n = wait ? cands.length : k++;
      const ang = (n / Math.max(1, Math.min(cands.length, cfg.maxEaters))) * Math.PI * 2 + (wait ? 0.4 : 0);
      const r = wait ? cfg.waitRadius : cfg.seatRadius;
      a.eco.target = null;
      a.eco.calm = true; // à mesa: não persegue ninguém
      a.eco.hunting = false; // e não assusta quem está perto
      a.eco.feedAt = { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r, cx: c.x, cz: c.z, wait, carcass: c };
      if (wait) continue;
      c.eaters.push(a);
      if (Math.hypot(a.position.x - a.eco.feedAt.x, a.position.z - a.eco.feedAt.z) > 0.8) continue; // ainda chegando
      const bite = Math.min(c.meat, cfg.eatRate * dt);
      c.meat -= bite;
      a.eco.needs.hunger = Math.max(0, a.eco.needs.hunger - bite * this.mealPerHealth);
    }
  }
}
