import { LAW } from '../../config/law.js';

/**
 * Testemunhas (Etapa C2) — regras puras, sem Three.js.
 *
 * Um crime vira **testemunhado** quando:
 *  - um guarda o vê (na hora), ou
 *  - um civil o vê, corre até o guarda mais próximo e chega a ele.
 * Enquanto o civil corre, o jogador pode silenciá-lo (intimidar, subornar,
 * nocautear); aí o crime continua registrado, mas sem testemunha.
 *
 * Convenção de giro dos moradores: `yaw` 0 olha para +z; frente = (sin yaw, cos yaw).
 *
 * @example
 *   const ws = new WitnessSystem(LAW.witness);
 *   ws.addCrime(crime, findWitnesses(agents, crime, LAW.witness));
 *   for (const r of ws.update(dt, { guardFor: (a) => guardPos })) console.log(r.agent.name, 'avisou');
 */

/**
 * O observador percebe o ponto? Vê dentro de um cone à frente até `radius`, ou ouve a qualquer lado até `hearRadius`.
 * @param {{ x: number, z: number, yaw: number }} obs
 * @param {{ x: number, z: number }} target
 * @param {{ radius: number, fovDot: number, hearRadius: number }} cfg
 */
export function canSee(obs, target, cfg) {
  const dx = target.x - obs.x, dz = target.z - obs.z, d = Math.hypot(dx, dz);
  if (d <= cfg.hearRadius) return true;
  if (d > cfg.radius) return false;
  const dot = (Math.sin(obs.yaw) * dx + Math.cos(obs.yaw) * dz) / d;
  return dot >= cfg.fovDot;
}

/**
 * Moradores que presenciam um crime: vivos, acordados, fora de casa, que não são a vítima e passam no `filter`.
 * @param {object[]} agents NPCAgent (ou parecidos: { id, pos, yaw, down, indoors })
 * @param {{ x: number, z: number, victimId?: string|null }} crime
 * @param {object} cfg `LAW.witness`
 * @param {(agent: object) => boolean} [filter] regra extra (ex.: só quem está dentro da mesma casa)
 */
export function findWitnesses(agents, crime, cfg, filter = () => true) {
  const out = [];
  for (const a of agents) {
    if (a.down || a.indoors || a.id === crime.victimId || !filter(a)) continue;
    if (canSee({ x: a.pos.x, z: a.pos.z, yaw: a.yaw }, crime, cfg)) out.push(a);
  }
  return out;
}

/** Fila de testemunhas correndo até a guarda. */
export class WitnessSystem {
  /** @param {object} [cfg] `LAW.witness` */
  constructor(cfg = LAW.witness) {
    this.cfg = cfg;
    /** @type {Map<object, { agent: object, crimes: object[], t: number }>} */
    this.entries = new Map();
  }

  /** Entrada da testemunha (ou undefined). */
  entryOf(agent) {
    return this.entries.get(agent);
  }

  /**
   * Distribui um crime entre quem viu. Guarda que vê = testemunhado na hora.
   * @returns {{ reportedNow: boolean, runners: object[] }}
   */
  addCrime(crime, witnesses) {
    let reportedNow = false;
    const runners = [];
    for (const a of witnesses) {
      if (a.person?.profession === 'guarda') { crime.witnessed = true; crime.reportedBy = a.id; reportedNow = true; continue; }
      const e = this.entries.get(a);
      if (e) { if (!e.crimes.includes(crime)) e.crimes.push(crime); continue; }
      this.entries.set(a, { agent: a, crimes: [crime], t: 0 });
      runners.push(a);
    }
    return { reportedNow, runners };
  }

  /** Tira a testemunha da corrida (intimidada, subornada…). O crime segue sem testemunha. */
  silence(agent, reason = 'silenciada') {
    const e = this.entries.get(agent);
    if (e) e.silenced = reason;
    this.entries.delete(agent);
    return e ?? null;
  }

  /**
   * Faz as testemunhas correrem e avisa quem chegou.
   * @param {number} dt
   * @param {{ guardFor: (agent: object) => ({ x: number, z: number } | null) }} deps
   *   guarda mais próximo da testemunha (null = vila sem guarda)
   * @returns {{ agent: object, crimes: object[] }[]} denúncias feitas neste passo
   */
  update(dt, { guardFor }) {
    const cfg = this.cfg, reports = [];
    for (const [a, e] of this.entries) {
      if (a.down) { this.entries.delete(a); continue; } // nocauteada/morta no caminho
      if (e.paused) continue; // conversando com o jogador (interceptação)
      e.t += dt;
      const g = guardFor(a);
      let arrived;
      if (g) {
        arrived = Math.hypot(g.x - a.pos.x, g.z - a.pos.z) <= cfg.reportRadius;
        if (!arrived) a.react('RUN_TO', 1, g);
      } else arrived = e.t >= cfg.noGuardReportAfter; // sem guarda: grita até alguém ouvir
      if (!arrived && e.t >= cfg.maxRunSeconds) arrived = true;
      if (!arrived) continue;
      for (const c of e.crimes) { c.witnessed = true; c.reportedBy = a.id; }
      this.entries.delete(a);
      reports.push({ agent: a, crimes: e.crimes });
    }
    return reports;
  }
}
