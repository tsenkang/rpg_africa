import { PACKS } from '../../config/ecosystem.js';

/**
 * Bandos (Etapa F3) — regras puras, sem Three.js. Roda no tique do
 * `EcosystemManager`, depois que ele escolheu alvos e ameaças.
 *
 * **Matilha** (lobo, hiena): o líder (primeiro vivo do grupo) escolhe a presa e
 * todos caçam a mesma. Ao escolher uma presa nova ele **uiva** (evento `howl`).
 * O bando se divide em:
 *  - batedores (`eco.role = 'beater'`): correm direto na presa e a empurram;
 *  - interceptadores (`'interceptor'`): correm para `eco.intercept`, o ponto
 *    onde a presa estará em `leadSeconds` fugindo do líder; de perto, mordem.
 *
 * **Manada** (zebra, capivara, suricato, avestruz): um **vigia** (`eco.sentinel`)
 * percebe predadores mais longe. Quando alguém da manada vê ameaça, a manada
 * inteira é alarmada (evento `alarm`, uma vez por ameaça) e reage:
 *  - **círculo defensivo** (`eco.circle = {x,z}`, adultos virados para fora;
 *    filhotes `eco.huddle` no centro) se a espécie faz círculo, há filhotes e o
 *    predador é de matilha/mesopredador;
 *  - senão **debandada**: todos fogem no mesmo rumo (`eco.fleeDir`).
 *
 * @example
 *   const pc = new PackController(PACKS);
 *   for (const e of pc.update(vivos)) if (e.type === 'howl') sons.howl(e.leader);
 */
export class PackController {
  constructor(cfg = PACKS) {
    this.cfg = cfg;
    this.packSet = new Set(cfg.pack.species);
    this.herdSet = new Set(cfg.herd.species);
    /** grupo → presa atual da matilha (para uivar só na troca). */
    this.packPrey = new Map();
    /** grupo → ameaça que já disparou alarme. */
    this.herdAlarm = new Map();
    this._groups = new Map();
  }

  /**
   * @param {object[]} alive animais vivos com `eco` (já com target/threat do tique)
   * @returns {{ type: 'howl'|'alarm'|'circle'|'stampede', leader?: object, sentinel?: object, group: number }[]}
   */
  update(alive) {
    const ev = [], groups = this._groups;
    for (const g of groups.values()) g.length = 0;
    for (const a of alive) {
      if (!this.packSet.has(a.speciesId) && !this.herdSet.has(a.speciesId)) continue;
      let g = groups.get(a.group);
      if (!g) groups.set(a.group, (g = []));
      g.push(a);
    }
    for (const [id, g] of groups) {
      if (!g.length) { groups.delete(id); this.packPrey.delete(id); this.herdAlarm.delete(id); continue; }
      if (this.packSet.has(g[0].speciesId)) this.pack(id, g, ev);
      else this.herd(id, g, ev);
    }
    return ev;
  }

  /** Matilha: alvo comum, uivo, batedores e interceptadores. */
  pack(id, g, ev) {
    const cfg = this.cfg.pack, leader = g[0];
    for (const a of g) { a.eco.leader = a === leader; a.eco.intercept = null; }
    // Alvo do bando: o do líder; se ele não tem, o de qualquer membro que caça.
    let prey = leader.eco.target;
    if (!prey || prey === 'player') prey = g.find((a) => a.eco.target && a.eco.target !== 'player')?.eco.target ?? leader.eco.target;
    if (!prey) { this.packPrey.delete(id); for (const a of g) a.eco.role = null; return; }
    if (this.packPrey.get(id) !== prey) { this.packPrey.set(id, prey); ev.push({ type: 'howl', leader, group: id }); }
    const pos = prey === 'player' ? null : prey.position;
    const nInt = Math.round((g.length - 1) * cfg.interceptShare);
    let k = 0;
    for (const a of g) {
      a.eco.target = prey;
      a.eco.hunting = true; a.eco.calm = false;
      if (a === leader || k >= nInt || !pos) { a.eco.role = 'beater'; continue; }
      k++;
      a.eco.role = 'interceptor';
      // A presa foge do líder: o ponto à frente dela nessa direção.
      const dx = pos.x - leader.position.x, dz = pos.z - leader.position.z, l = Math.hypot(dx, dz) || 1;
      const lead = (prey.spec?.run ?? 8) * cfg.leadSeconds;
      const side = k % 2 ? 1 : -1; // interceptadores alternam os lados da rota
      a.eco.intercept = { x: pos.x + (dx / l) * lead - (dz / l) * side * lead * 0.3, z: pos.z + (dz / l) * lead + (dx / l) * side * lead * 0.3 };
    }
  }

  /** Manada: vigia, alarme comum, círculo defensivo ou debandada. */
  herd(id, g, ev) {
    const cfg = this.cfg.herd;
    const adults = g.filter((a) => !a.young);
    const sentinel = adults[0] ?? g[0];
    for (const a of g) { a.eco.sentinel = a === sentinel; a.eco.circle = null; a.eco.huddle = null; a.eco.fleeDir = null; }
    const threat = g.find((a) => a.eco.threat?.alive)?.eco.threat ?? null;
    if (!threat) { this.herdAlarm.delete(id); return; }
    for (const a of g) a.eco.threat = threat;
    let cx = 0, cz = 0;
    for (const a of g) { cx += a.position.x; cz += a.position.z; }
    cx /= g.length; cz /= g.length;
    const young = g.some((a) => a.young);
    const circle = young && adults.length >= 2 && cfg.circleSpecies.includes(g[0].speciesId) && (threat.eco?.level ?? 1) >= cfg.circleAgainstLevel;
    if (this.herdAlarm.get(id) !== threat) {
      this.herdAlarm.set(id, threat);
      ev.push({ type: 'alarm', sentinel, group: id }, { type: circle ? 'circle' : 'stampede', group: id });
    }
    if (circle) {
      let i = 0;
      for (const a of g) {
        if (a.young) { a.eco.huddle = { x: cx, z: cz }; continue; }
        const ang = (i++ / adults.length) * Math.PI * 2;
        a.eco.circle = { x: cx + Math.cos(ang) * cfg.circleRadius, z: cz + Math.sin(ang) * cfg.circleRadius };
      }
      return;
    }
    const dx = cx - threat.position.x, dz = cz - threat.position.z, l = Math.hypot(dx, dz) || 1;
    const base = Math.atan2(dx / l, dz / l);
    g.forEach((a, i) => { a.eco.fleeDir = base + ((i % 3) - 1) * cfg.stampedeSpread; });
  }
}
