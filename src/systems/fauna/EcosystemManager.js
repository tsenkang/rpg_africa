import { ECOSYSTEM, PACKS } from '../../config/ecosystem.js';
import { PackController } from './PackController.js';
import { buildDiet, SpatialGrid, needsStep, wantsToHunt, scorePrey, statKillChance } from './Ecology.js';

/**
 * Ecossistema vivo da fauna (Etapa F1). Não move nem anima ninguém: decide,
 * a cada `tick`, para cada animal:
 *  - **predador** (níveis 1–2) com fome > 60% e energia → `eco.target` = a melhor
 *    presa por perto (animal da dieta ou o jogador); alimentado → `eco.calm`
 *    (não ataca o jogador nem as presas, só se for provocado);
 *  - **presa** → `eco.threat` = predador que está caçando por perto (alerta) ou
 *    qualquer um colado nela (pânico). Predador alimentado e presa convivem.
 * Fome e energia andam a cada quadro. Caçadas em que predador **e** presa estão
 * além de `detailRadius` do jogador são resolvidas por estatística (sem
 * perseguição nem combate físico) e viram eventos `kill`.
 *
 * Os animais precisam de: speciesId, spec{sense,run,walk,health}, position{x,z},
 * health, alive, speed, limpT, group, young?.
 *
 * @example
 *   const eco = new EcosystemManager(ECOSYSTEM, { rng: Math.random });
 *   eco.register(animal);                                   // ao nascer
 *   const ev = eco.update(dt, animais, { position, alive, health01 });
 *   for (const e of ev) if (e.type === 'kill') fauna.applyKill(e.predator, e.prey);
 */
export class EcosystemManager {
  constructor(cfg = ECOSYSTEM, { rng = Math.random, packs = PACKS } = {}) {
    this.cfg = cfg;
    /** Matilhas e manadas (F3). */
    this.packs = new PackController(packs);
    this.sentinelScale = packs.herd.sentinelScale;
    this.rng = rng;
    this.diet = buildDiet(cfg);
    /** Espécies que algum predador come (para saber quem vigia). */
    this.preySpecies = new Set();
    for (const s of this.diet.values()) for (const p of s) this.preySpecies.add(p);
    this.grid = new SpatialGrid(cfg.gridCell);
    this._t = 0;
    this._near = [];
    this._alive = [];
    /** Últimos números (HUD de depuração / testes). */
    this.stats = { hunting: 0, alarmed: 0, statKills: 0 };
  }

  /** Cria `animal.eco` (nível, fome, energia, alvo, ameaça). */
  register(a) {
    const lvl = this.cfg.levels[a.speciesId] ?? 4;
    const [h0, h1] = this.cfg.hunger.initial;
    a.eco = {
      level: lvl,
      predator: (this.diet.get(a.speciesId)?.size ?? 0) > 0,
      prey: this.preySpecies.has(a.speciesId),
      needs: { hunger: h0 + (h1 - h0) * this.rng(), energy: 1 },
      hunting: false,
      calm: true,
      target: null, // animal | 'player' | null
      threat: null, // animal | null
    };
    return a.eco;
  }

  /** O predador comeu a presa: fome cai pelo tamanho dela. */
  feed(pred, prey) {
    const e = pred.eco;
    if (!e) return;
    e.needs.hunger = Math.max(0, e.needs.hunger - (prey.spec?.health ?? 60) * this.cfg.hunger.mealPerHealth);
    e.target = null;
    e.hunting = false;
  }

  /**
   * @param {number} dt
   * @param {object[]} animals
   * @param {{ position: {x:number,z:number}, alive: boolean, health01?: number }} player
   * @returns {{ type: string, predator?: object, prey?: object }[]} `kill` (caçada estatística) e os de bando (`howl`, `alarm`…)
   */
  update(dt, animals, player) {
    const cfg = this.cfg, ev = [];
    for (const a of animals) {
      if (!a.eco || !a.alive) continue;
      needsStep(a.eco.needs, dt, { running: a.speed > a.spec.walk * 1.5, level: a.eco.level }, cfg);
    }
    this._t -= dt;
    if (this._t > 0) return ev;
    const step = Math.max(dt, cfg.tick - this._t);
    this._t = cfg.tick;
    const alive = this._alive;
    alive.length = 0;
    for (const a of animals) if (a.eco && a.alive) alive.push(a);
    this.grid.rebuild(alive);
    let hunting = 0, alarmed = 0;
    const p = player.position;
    // 1) Predadores: caçar ou conviver.
    for (const a of alive) {
      const e = a.eco;
      if (!e.predator) continue;
      // À mesa de uma carcaça (F4): come em vez de caçar, e não é ameaça para os vizinhos.
      e.hunting = wantsToHunt(e.needs, cfg) && !(e.feedAt && !e.feedAt.wait);
      e.calm = !e.hunting;
      if (!e.hunting) { e.target = null; continue; }
      hunting++;
      e.target = this.pickTarget(a, player);
    }
    // 2) Presas: vigiar e alarmar.
    for (const a of alive) {
      const e = a.eco;
      if (!e.prey) continue;
      e.threat = this.findThreat(a);
      if (e.threat) alarmed++;
    }
    // 2b) Bandos: alvo comum, papéis, vigia, alarme (F3). Eventos: howl/alarm/circle/stampede.
    for (const e of this.packs.update(alive)) ev.push(e);
    // 3) LOD: caçadas longe do jogador → estatística.
    const R = cfg.detailRadius;
    for (const a of alive) {
      const t = a.eco.target;
      if (!t || t === 'player' || !t.alive) continue;
      const far = (o) => Math.hypot(o.position.x - p.x, o.position.z - p.z) > R;
      if (!far(a) || !far(t)) continue;
      const pack = alive.filter((o) => o.group === a.group && o.eco.target === t).length;
      if (this.rng() < statKillChance({ run: a.spec.run, pack }, { run: t.spec.run }, step, cfg)) {
        ev.push({ type: 'kill', predator: a, prey: t });
        this.stats.statKills++;
      }
    }
    this.stats.hunting = hunting;
    this.stats.alarmed = alarmed;
    return ev;
  }

  /** Melhor presa por perto (mantém a atual se ainda servir). */
  pickTarget(a, player) {
    const cfg = this.cfg, e = a.eco, diet = this.diet.get(a.speciesId);
    const r = a.spec.sense * cfg.huntSenseScale;
    const cur = e.target;
    if (cur && cur !== 'player' && cur.alive && Math.hypot(cur.position.x - a.position.x, cur.position.z - a.position.z) < r * 1.3) return cur;
    let best = null, bs = Infinity;
    const near = this.grid.query(a.position.x, a.position.z, r, (this._near.length = 0, this._near));
    for (const o of near) {
      if (o === a || !diet.has(o.speciesId)) continue;
      const d = Math.hypot(o.position.x - a.position.x, o.position.z - a.position.z);
      const s = scorePrey(d, { health: o.health / o.spec.health, young: !!o.young, limping: o.limpT > 0 });
      if (s < bs) { bs = s; best = o; }
    }
    if (player.alive && cfg.playerPreyOf.includes(e.level)) {
      const d = Math.hypot(player.position.x - a.position.x, player.position.z - a.position.z);
      if (d < r) {
        const s = scorePrey(d, { health: player.health01 ?? 1, young: false, limping: false });
        if (s < bs) { bs = s; best = 'player'; }
      }
    }
    return best;
  }

  /** Predador que ameaça esta presa: caçando por perto (alerta) ou colado (pânico). */
  findThreat(a) {
    const cfg = this.cfg.prey;
    let best = null, bd = Infinity;
    const R = cfg.alarmRadius * (a.eco.sentinel ? this.sentinelScale : 1); // o vigia enxerga mais longe
    const near = this.grid.query(a.position.x, a.position.z, R, (this._near.length = 0, this._near));
    for (const o of near) {
      if (o === a || !o.eco.predator || !this.diet.get(o.speciesId).has(a.speciesId)) continue;
      const d = Math.hypot(o.position.x - a.position.x, o.position.z - a.position.z);
      if (!o.eco.hunting && d > cfg.panicRadius) continue; // alimentado e não colado: convivem
      if (!o.eco.hunting && a.eco.feedAt) continue; // à mesa da carcaça: predador saciado não assusta (F4)
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
}
