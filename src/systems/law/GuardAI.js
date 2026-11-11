import { LAW } from '../../config/law.js';
import { canSee } from './Witness.js';

/**
 * IA de lei dos guardas (Etapa C4). Fica por cima da rotina: enquanto o
 * guarda está em PATROL, quem manda é a rotina normal (ronda); nos outros
 * modos o controlador assume com reações (`agent.react`).
 *
 * Modos:
 *  - PATROL: ronda. Vendo o jogador **procurado na vila dele**, enche o
 *    medidor de reconhecimento (mais rápido de perto) e o encara; cheio → CHASE.
 *  - CHASE: corre até o jogador (o parceiro de dupla flanqueia pelo lado),
 *    ataca de perto com recarga; perdeu de vista por um tempo → INVESTIGATE.
 *  - INVESTIGATE: vasculha pontos dentro da zona de busca; a busca acabou → PATROL.
 * Ao reconhecer, o guarda **apita** e chama os guardas da vila num raio (reforço).
 *
 * Não toca em Three.js nem no jogador: devolve eventos para o jogo aplicar
 * (`suspect`, `whistle`, `attack`, `lost`).
 *
 * @example
 *   const ai = new GuardAIController(LAW.guards);
 *   const ev = ai.update(dt, guardas, { player, playerDead, wanted: (v) => …, searchOf: (v) => …, rng });
 *   for (const e of ev) if (e.type === 'attack') game.damagePlayer(e.damage, 'Guarda', null, e.guard);
 */
export class GuardAIController {
  /** @param {object} [cfg] `LAW.guards` */
  constructor(cfg = LAW.guards) {
    this.cfg = cfg;
    /** @type {Map<object, { mode: string, meter: number, lostT: number, cd: number, side: number, last: {x:number,z:number}|null, inv: object|null, suspected: boolean }>} */
    this.states = new Map();
    /** Todos os guardas vistos no último update (para o reforço). */
    this.known = [];
  }

  /** Estado do guarda (cria em PATROL). */
  stateOf(g) {
    let s = this.states.get(g);
    if (!s) { s = { mode: 'PATROL', meter: 0, lostT: 0, cd: 0, side: 0, last: null, inv: null, suspected: false }; this.states.set(g, s); }
    return s;
  }

  /** Guarda em ação (fora da ronda)? */
  engaged(g) {
    return this.stateOf(g).mode !== 'PATROL';
  }

  /**
   * Alerta imediato (o guarda viu o crime ou reconheceu o procurado): apita e chama reforço.
   * @param {object} g guarda que deu o alerta
   * @param {{ player: {x:number,z:number} }} ctx
   * @param {object[]} [guards] candidatos a reforço (padrão: os do último update)
   * @returns {object[]} eventos
   */
  alert(g, ctx, guards = this.known) {
    const ev = [];
    this.toChase(g, ctx.player);
    ev.push({ type: 'whistle', guard: g });
    const vid = g.village.config.id, R = this.cfg.reinforceRadius;
    const pool = guards.includes(g) ? guards : [g, ...guards];
    for (const o of pool) {
      if (o === g || o.down || o.village.config.id !== vid) continue;
      if (Math.hypot(o.pos.x - g.pos.x, o.pos.z - g.pos.z) > R) continue;
      if (this.stateOf(o).mode !== 'CHASE') this.toChase(o, ctx.player);
    }
    return ev;
  }

  toChase(g, player) {
    const s = this.stateOf(g);
    s.mode = 'CHASE'; s.meter = 1; s.lostT = 0; s.last = { x: player.x, z: player.z }; s.inv = null;
  }

  reset(g) {
    const s = this.stateOf(g);
    if (s.mode !== 'PATROL') g.reaction = null;
    s.mode = 'PATROL'; s.meter = 0; s.lostT = 0; s.inv = null; s.suspected = false; s.side = 0;
  }

  /**
   * @param {number} dt
   * @param {object[]} guards guardas (NPCAgent) das vilas ativas
   * @param {{ player: {x:number,z:number}, playerDead: boolean, wanted: (villageId: string) => boolean,
   *           searchOf: (villageId: string) => ({x:number,z:number,r:number}|null), rng: () => number }} ctx
   * @returns {{ type: 'suspect'|'whistle'|'attack'|'lost', guard: object, damage?: number }[]}
   */
  update(dt, guards, ctx) {
    const cfg = this.cfg, p = ctx.player, ev = [];
    const merged = new Set([...guards, ...this.known]);
    this.known = [...merged];
    for (const g of guards) {
      const s = this.stateOf(g);
      if (g.down || g.indoors || ctx.playerDead || !ctx.wanted(g.village.config.id)) { if (s.mode !== 'PATROL' || s.meter) this.reset(g); continue; }
      s.cd = Math.max(0, s.cd - dt);
      const dx = p.x - g.pos.x, dz = p.z - g.pos.z, d = Math.hypot(dx, dz);
      const sees = canSee({ x: g.pos.x, z: g.pos.z, yaw: g.yaw }, p, cfg.sight) || (s.mode === 'CHASE' && d <= cfg.sight.radius * 0.5);
      if (s.mode === 'CHASE') { this.chase(g, s, sees, d, dt, ctx, ev); continue; }
      // PATROL / INVESTIGATE: conferindo o rosto.
      if (sees) {
        if (!s.suspected) { s.suspected = true; ev.push({ type: 'suspect', guard: g }); }
        s.meter += (dt / cfg.recognizeSeconds) * (d <= cfg.closeRadius ? 2 : 1);
        if (s.meter >= 1) { ev.push(...this.alert(g, ctx, this.known)); continue; }
        g.react('FACE', 0.6, p, 'point');
        continue;
      }
      s.meter = Math.max(0, s.meter - dt * cfg.meterDecay);
      if (s.meter === 0) s.suspected = false;
      const search = ctx.searchOf(g.village.config.id);
      if (s.mode === 'INVESTIGATE' && !search) { this.reset(g); continue; }
      if (s.mode === 'PATROL' && search) s.mode = 'INVESTIGATE';
      if (s.mode === 'INVESTIGATE') this.investigate(g, s, search, dt, ctx);
    }
    return ev;
  }

  chase(g, s, sees, d, dt, ctx, ev) {
    const cfg = this.cfg, p = ctx.player;
    if (sees) { s.lostT = 0; s.last = { x: p.x, z: p.z }; }
    else {
      s.lostT += dt;
      if (s.lostT >= cfg.loseSeconds) { s.mode = 'INVESTIGATE'; s.inv = null; ev.push({ type: 'lost', guard: g }); return; }
    }
    if (sees && d <= cfg.attackRange) {
      g.react('FACE', 0.5, p, 'thrust');
      if (s.cd <= 0) { s.cd = cfg.attackCooldown; ev.push({ type: 'attack', guard: g, damage: cfg.damage }); }
      return;
    }
    let tx = s.last.x, tz = s.last.z;
    // Dupla: o segundo da dupla (em perseguição) mira um ponto de lado até chegar perto.
    const partner = this.known.find((o) => o !== g && o.person.patrolPair === g.person.patrolPair && o.village.config.id === g.village.config.id && this.stateOf(o).mode === 'CHASE');
    if (partner && d > cfg.flankStopDist) {
      if (!s.side && !this.stateOf(partner).side) s.side = 1; // o primeiro a decidir flanqueia
      if (s.side) {
        const gx = tx - g.pos.x, gz = tz - g.pos.z, gl = Math.hypot(gx, gz) || 1;
        tx += (-gz / gl) * cfg.flankDist * s.side;
        tz += (gx / gl) * cfg.flankDist * s.side;
      }
    }
    g.react('RUN_TO', 0.5, { x: tx, z: tz }, null, cfg.chaseSpeed);
  }

  investigate(g, s, search, dt, ctx) {
    const cfg = this.cfg;
    if (!s.inv || (s.inv.wait !== undefined && (s.inv.wait -= dt) <= 0)) {
      const a = ctx.rng() * Math.PI * 2, r = ctx.rng() * search.r * 0.8;
      s.inv = { x: search.x + Math.cos(a) * r, z: search.z + Math.sin(a) * r };
    }
    if (s.inv.wait !== undefined) { g.react('FACE', 0.5, { x: g.pos.x + Math.sin(ctx.rng() * 6.28), z: g.pos.z + 1 }, 'scout'); return; }
    if (Math.hypot(s.inv.x - g.pos.x, s.inv.z - g.pos.z) < 1.5) { s.inv.wait = cfg.investigatePause; return; }
    g.react('RUN_TO', 0.5, s.inv, null, cfg.chaseSpeed * 0.6);
  }
}
