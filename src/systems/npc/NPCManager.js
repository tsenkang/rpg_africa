import { NPCAgent } from '../../entities/NPCAgent.js';
import { generatePopulation, familyOf } from './Population.js';
import { buildLook } from './NPCVisualBuilder.js';
import { POPULATION, NPC_LOD, WEATHER_REACT, PROFESSIONS, OUTFIT_REGION, COMMANDER_LOOK } from '../../config/npcLife.js';
import { DialogueEngine } from './DialogueEngine.js';
import { PERCEPTION, SOCIAL } from '../../config/dialogues.js';
import { mulberry32 } from '../../world/Noise.js';
import { BIOMES } from '../../config/biomes.js';
import { WORLD } from '../../config/worldConfig.js';

const local = (x, z, rot, lx, lz) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
};

/**
 * Mundo vivo: cria e simula os moradores de todas as vilas.
 *
 * - Casas: cada interior de casa/cabana da vila vira um lar (`homeId`) com
 *   porta, quintal e ponto de dormir.
 * - Postos de trabalho por profissão: plantação (borda), barracas (praça),
 *   forja, quintal, mata, margem d'água e ronda dos guardas.
 * - LOD de IA: vila longe = parada (ao chegar perto, cada morador é colocado
 *   direto onde a rotina manda); vila perto = simulada; só os
 *   `NPC_LOD.maxRendered` mais próximos do jogador têm boneco 3D animado.
 * - À noite, a porta de uma casa com gente dormindo fica trancada (colisor).
 *
 * @example
 * const npcs = new NPCManager(game);
 * // no loop:
 * npcs.update(dt);            // rotina, rotas, LOD, portas
 * npcs.nearest(pos, 2.5);     // morador para conversar (E)
 */
export class NPCManager {
  constructor(game) {
    this.game = game;
    this.villages = [];
    this.agents = [];
    this.day = 0;
    this.dt = 1 / 60;
    this._lastHour = null;
    this._lodT = 0;
    this._logicT = 0;
    this._socialT = 0;
    this._perceiveT = 0;
    /** Memória social: id do morador → { provocado: n, agredido: bool }; família → { parente_agredido }. */
    this.memory = new Map();
    this.familyMemory = new Map();
    /** Só o relevo (sem pisos): normal da superfície e limite de 45° dos moradores. */
    this.terrainAt = (x, z) => game.terrain.heightAt(x, z);
    /** Chamado quando um morador ganha boneco 3D (o jogo registra o alvo do soco). */
    this.onModelBuilt = null;
    /** Balões de fala (SpeechBubbles) — o jogo injeta. */
    this.bubbles = null;
    this.rng = mulberry32(4242);
    this._logicHours = 0;
    for (const v of Object.values(game.villages)) {
      if (v.config.abandoned) continue;
      const vs = this.setupVillage(v);
      if (vs) this.villages.push(vs);
    }
  }

  /** Lares, pontos da vila e moradores. */
  setupVillage(v) {
    const game = this.game;
    const rng = mulberry32((v.x * 928371 + v.z * 1237) | 0);
    // Vilas temáticas declaram o bioma; as centrais/sul usam nomes e trajes "comuns" (camponeses).
    const biome = v.config.biome ?? 'central';
    const homes = v.interiors.filter((d) => d.doorW).map((d, i) => {
      const half = d.round ? d.round : d.d / 2;
      return {
        id: `${v.config.id}-casa-${i}`, desc: d, x: d.x, z: d.z, rot: d.rot, floorY: d.floorY, half,
        door: local(d.x, d.z, d.rot, 0, half + 0.9),
        yard: local(d.x, d.z, d.rot, (rng() - 0.5) * 2, half + 2.4),
        inside: local(d.x, d.z, d.rot, (rng() - 0.5) * (d.round ? d.round : d.w / 2) * 0.6, -(d.round ? d.round : d.d / 2) * 0.35),
        yaw: d.rot,
        doorCollider: null,
      };
    });
    if (!homes.length) return null;
    const people = generatePopulation({ villageId: v.config.id, biome, homes, rng });
    const homeById = new Map(homes.map((h) => [h.id, h]));
    const R = v.radius, cx = v.x, cz = v.z;
    // Ponto sorteado num anel em volta do centro — em terra firme e fora de paredes (ex.: o lago do oásis).
    const dry = (x, z) => game.terrain.heightAt(x, z) > WORLD.waterLevel + 0.3 && !game.collisions.overlaps(x, z, 0.6);
    const ring = (r0, r1) => {
      let a = 0, r = 0;
      for (let k = 0; k < 24; k++) {
        a = rng() * Math.PI * 2; r = r0 + rng() * (r1 - r0) + k * 1.5; // se não achar, abre o anel aos poucos
        if (dry(cx + Math.cos(a) * r, cz + Math.sin(a) * r)) break;
      }
      return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, yaw: a + Math.PI };
    };
    const forge = ring(10, 18);
    const water = this.findWater(v, rng);
    const plaza = dry(cx, cz) ? { x: cx + (rng() - 0.5) * 6, z: cz + (rng() - 0.5) * 6 } : ring(4, 12);
    const leisure = [
      { id: 0, x: plaza.x, z: plaza.z },
      ...v.fires.filter((f) => f.warm && Math.hypot(f.x - cx, f.z - cz) < R).slice(0, 4).map((f, i) => ({ id: i + 1, x: f.x + 2.2, z: f.z })),
    ];
    // Rondas: duas voltas (anel de 6 pontos) por dupla de guardas, defasadas.
    const loops = [0, 1, 2].map((k) => Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + k * 0.5;
      let r = R * (k === 0 ? 0.8 : k === 1 ? 0.45 : 0.95);
      for (let j = 0; j < 10 && !dry(cx + Math.cos(a) * r, cz + Math.sin(a) * r); j++) r += 3;
      if (!dry(cx + Math.cos(a) * r, cz + Math.sin(a) * r)) { const q = ring(R * 0.3, R * 0.9); return { x: q.x, z: q.z }; } // vila de rio: ponto seco qualquer
      return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
    }));
    const vs = { village: v, biome, homes, homeById, people, agents: [], active: false, center: { x: cx, z: cz }, forge, water };
    for (const p of people) {
      const home = homeById.get(p.homeId) ?? homes[0];
      const prof = PROFESSIONS[p.profession];
      let wp;
      switch (prof?.place) {
        case 'farm': wp = ring(R * 0.85, R * 1.05); break;
        case 'plaza': wp = ring(7, 16); break;
        case 'forge': wp = { ...forge }; break;
        case 'yard': wp = local(home.x, home.z, home.rot, home.half + 1.5, home.half * 0.4); wp.yaw = home.rot; break;
        case 'wild': wp = ring(R + 20, R + 55); break;
        case 'water': {
          // Pescador: na margem, mas com os pés em terra firme (recua até secar).
          wp = water ? { x: water.x + (rng() - 0.5) * 4, z: water.z + (rng() - 0.5) * 4, yaw: water.yaw } : ring(R * 0.85, R);
          for (let k = 0; k < 20 && !dry(wp.x, wp.z); k++) { wp.x -= Math.cos(wp.yaw) * 0.8; wp.z -= Math.sin(wp.yaw) * 0.8; }
          break;
        }
        default: wp = ring(6, 14);
      }
      let lunch = { x: wp.x + (rng() - 0.5) * 3, z: wp.z + (rng() - 0.5) * 3, yaw: rng() * Math.PI * 2 };
      if (!dry(lunch.x, lunch.z)) lunch = { x: wp.x, z: wp.z, yaw: lunch.yaw };
      const agent = new NPCAgent(p, {
        look: buildLook(p, biome, rng), home, workplace: wp, lunchSpot: lunch, leisure,
        patrol: p.profession === 'guarda' ? loops[p.patrolPair % loops.length].map((q) => ({ ...q })) : null,
        village: v, manager: this, rng,
      });
      if (agent.patrol && p.patrolPair % 2) agent.patrolIndex = 3; // a dupla começa do outro lado
      vs.agents.push(agent);
      this.agents.push(agent);
    }
    // Comandante da Guarda: um guarda do turno do dia fica fixo na praça (paga-se a recompensa a ele).
    const cmd = vs.agents.find((a) => a.person.profession === 'guarda' && a.person.shift === 'day');
    if (cmd) {
      cmd.commander = true;
      cmd.patrol = null;
      cmd.workplace = { x: plaza.x + 2.5, z: plaza.z + 2.5, yaw: rng() * Math.PI * 2, gesture: 'guard' };
      cmd.look = { ...cmd.look, cape: COMMANDER_LOOK.cape, armor: COMMANDER_LOOK.armor };
      vs.commander = cmd;
    }
    // Família: referência rápida (diálogos).
    for (const a of vs.agents) a.family = familyOf(a.person, people).map((p) => p.fullName);
    return vs;
  }

  biomeId(v) {
    return BIOMES[this.game.terrain.dominantBiome(v.x, v.z)]?.id ?? 'savana';
  }

  /** Margem d'água mais perto da vila (pescadores), ou null. */
  findWater(v, rng) {
    const g = this.game, WL = WORLD.waterLevel;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + rng() * 0.2;
      for (let r = v.radius * 0.5; r < v.radius + 160; r += 3) {
        const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
        if (g.terrain.heightAt(x, z) < WL - 0.2) {
          const bx = v.x + Math.cos(a) * (r - 2.5), bz = v.z + Math.sin(a) * (r - 2.5);
          return { x: bx, z: bz, yaw: a };
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------ rotas

  /** Ponto mais próximo de (x, z) nas ruas da vila. */
  streetPoint(v, x, z) {
    let best = null, bd = Infinity;
    for (const s of v.streets) {
      const ux = s.bx - s.ax, uz = s.bz - s.az, L2 = ux * ux + uz * uz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * ux + (z - s.az) * uz) / L2));
      const px = s.ax + ux * t, pz = s.az + uz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, street: s }; }
    }
    return best;
  }

  /**
   * Rota simples: (sai pela porta) → rua mais perto → (centro, se mudar de
   * rua) → rua do destino → (entra pela porta) → destino.
   */
  route(agent, from, goal) {
    const v = agent.village, h = agent.home, pts = [];
    const fromInside = agent.indoors || Math.hypot(from.x - h.inside.x, from.z - h.inside.z) < 1.5;
    if (fromInside) pts.push({ x: h.door.x, z: h.door.z });
    const start = pts.length ? pts[0] : from;
    const toInside = goal.viaDoor;
    const end = toInside ? h.door : goal;
    if (Math.hypot(end.x - start.x, end.z - start.z) > 14 && v.streets.length) {
      const a = this.streetPoint(v, start.x, start.z), b = this.streetPoint(v, end.x, end.z);
      if (a && b) {
        pts.push({ x: a.x, z: a.z });
        if (a.street !== b.street) pts.push({ x: v.x, z: v.z });
        pts.push({ x: b.x, z: b.z });
      }
    }
    if (toInside) pts.push({ x: h.door.x, z: h.door.z });
    pts.push({ x: goal.x, z: goal.z });
    return pts;
  }

  // ------------------------------------------------------------ loop

  /** Clima no jogador (vale para a vila onde ele está). */
  weatherEnv(vs) {
    const fx = this.game.weather?.overlays ?? {};
    const hour = this.game.gameClock.hour;
    // Temporal: chuva/areia/cinzas fortes, ou nevasca (gelo no máximo).
    const shelter = Math.max(fx.rain ?? 0, fx.sand ?? 0, fx.ash ?? 0) > WEATHER_REACT.shelter || (fx.frost ?? 0) > 0.75;
    const cold = (fx.frost ?? 0) > WEATHER_REACT.cold || WEATHER_REACT.coldBiomes.includes(vs.biome);
    const heat = (fx.heat ?? 0) > WEATHER_REACT.heat || (WEATHER_REACT.hotBiomes.includes(vs.biome) && hour > 10 && hour < 17);
    return { shelter, cold, heat };
  }

  update(dt) {
    const game = this.game, pos = game.player.position, hour = game.gameClock.hour;
    this.dt = dt;
    let hoursPassed = this._lastHour === null ? 0 : ((hour - this._lastHour + 24) % 24);
    if (this._lastHour !== null && hour < this._lastHour) this.day++;
    this._lastHour = hour;
    // Salto de relógio (viagem rápida, depuração): ninguém "trabalha 18 h num quadro" — todos vão direto para a rotina.
    if (hoursPassed > 0.5) {
      hoursPassed = 0;
      for (const vs of this.villages) if (vs.active) for (const a of vs.agents) a.snap(hour, vs.env ?? {});
    }
    const over = game.areaId === 'overworld';
    this._logicT += dt;
    this._logicHours += hoursPassed;
    const logicTick = this._logicT >= NPC_LOD.logicTick;
    const logicDt = this._logicT, logicHours = this._logicHours;
    if (logicTick) { this._logicT = 0; this._logicHours = 0; }
    const move = (p, dx, dz) => game.collisions.move(p, dx, dz, 0.3, { fraction: 0.6, maxSteps: 4 });
    for (const vs of this.villages) {
      const d = Math.hypot(pos.x - vs.center.x, pos.z - vs.center.z) - vs.village.radius;
      const active = over && d < NPC_LOD.activeRadius;
      if (!active) {
        if (vs.active) { for (const a of vs.agents) a.hideModel(); vs.active = false; }
        continue;
      }
      const env = this.weatherEnv(vs);
      if (!vs.active) { vs.active = true; for (const a of vs.agents) a.snap(hour, env); }
      for (const a of vs.agents) {
        if (a.rendered) a.update(dt, { hour, hoursPassed, env, detailed: true, move });
        else if (logicTick) a.update(logicDt, { hour, hoursPassed: logicHours, env, detailed: false });
      }
      this.updateDoors(vs, pos);
      vs.env = env;
    }
    this._lodT -= dt;
    if (this._lodT <= 0) { this._lodT = 0.3; this.updateLOD(pos); }
    const groundAt = (x, z, f) => game.groundHeight(x, z, f);
    for (const a of this.rendering ?? []) if (a.rendered && a.model) a.syncModel({ env: a.villageState.env ?? {}, groundAt, dt });
  }

  /** LOD: só os mais próximos (fora de casa, ou dentro e o jogador também) ganham boneco. */
  updateLOD(pos) {
    const R2 = NPC_LOD.renderRadius ** 2, cands = [];
    for (const vs of this.villages) {
      if (!vs.active) continue;
      for (const a of vs.agents) {
        a.villageState = vs;
        const d2 = (a.pos.x - pos.x) ** 2 + (a.pos.z - pos.z) ** 2;
        const hidden = a.indoors && d2 > 36; // dormindo lá dentro: só aparece com o jogador pertinho
        if (d2 < R2 && !hidden) cands.push([d2, a]);
        else a.hideModel();
      }
    }
    cands.sort((a, b) => a[0] - b[0]);
    let builds = NPC_LOD.buildsPerFrame * 3;
    this.rendering = [];
    cands.forEach(([, a], i) => {
      if (i >= NPC_LOD.maxRendered) { a.hideModel(); return; }
      if (!a.model) { if (builds <= 0) return; builds--; a.ensureModel(this.game.scene); this.onModelBuilt?.(a); }
      a.rendered = true;
      this.rendering.push(a);
    });
  }

  /** Portas trancadas à noite: casa com alguém dormindo e o jogador fora dela. */
  updateDoors(vs, pos) {
    const col = this.game.collisions;
    for (const h of vs.homes) {
      const asleep = vs.agents.some((a) => a.home === h && a.state === 'SLEEPING');
      const playerInside = Math.hypot(pos.x - h.x, pos.z - h.z) < h.half;
      const lock = asleep && !playerInside;
      if (lock && !h.doorCollider) {
        const c = local(h.x, h.z, h.rot, 0, h.half - 0.1);
        h.doorCollider = col.addBox(c.x, c.z, 0.75, 0.22, h.rot, 'door');
        h.locked = true;
      } else if (!lock && h.doorCollider) {
        col.remove(h.doorCollider);
        h.doorCollider = null;
        h.locked = false;
      }
    }
  }

  /** Morador com boneco mais perto de `pos` (para conversar). */
  nearest(pos, radius = 2.5) {
    let best = null, bd = radius;
    for (const a of this.rendering ?? []) {
      if (!a.rendered || a.state === 'SLEEPING' || a.down) continue;
      const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  // ------------------------------------------------------------ memória e diálogo

  /** Memória do morador (inclui o que aconteceu com a família dele). */
  memoryOf(agent) {
    const own = this.memory.get(agent.id) ?? {};
    const fam = this.familyMemory.get(`${agent.village.config.id}:${agent.person.familyId}`) ?? {};
    return { ...own, ...fam };
  }

  /**
   * Grava um acontecimento na memória do morador (e da família, se for agressão).
   * @param {'provocado'|'agredido'|'morto'} key
   */
  remember(agent, key) {
    const m = this.memory.get(agent.id) ?? {};
    if (key === 'provocado') m.provocado = (m.provocado ?? 0) + 1;
    else m[key] = true;
    this.memory.set(agent.id, m);
    const famKey = `${agent.village.config.id}:${agent.person.familyId}`;
    if (key === 'agredido') this.familyMemory.set(famKey, { ...this.familyMemory.get(famKey), parente_agredido: true });
    if (key === 'morto') this.familyMemory.set(famKey, { ...this.familyMemory.get(famKey), parente_agredido: true, parente_morto: true });
  }

  /**
   * Lar correspondente a uma casa do `InteriorManager` (mesmo centro), com a vila e os moradores.
   * @returns {null | { home: object, vs: object, residents: NPCAgent[] }}
   * @example nm.homeOfHouse(game.interiors.insideAt(pos)?.house);
   */
  homeOfHouse(house) {
    if (!house) return null;
    for (const vs of this.villages) {
      for (const h of vs.homes) {
        if (Math.abs(h.x - house.x) > 0.01 || Math.abs(h.z - house.z) > 0.01) continue;
        return { home: h, vs, residents: vs.agents.filter((a) => a.home === h) };
      }
    }
    return null;
  }

  /** Clima como palavra (diálogos). */
  weatherWord(vs) {
    const fx = this.game.weather?.overlays ?? {};
    if ((fx.rain ?? 0) > 0.3) return 'chuva';
    if ((fx.sand ?? 0) > 0.3) return 'areia';
    if ((fx.frost ?? 0) > 0.6) return 'neve';
    if (vs?.env?.cold) return 'frio';
    if (vs?.env?.heat) return 'calor';
    return 'limpo';
  }

  /** Contexto de diálogo de um morador agora (DialogueEngine.context). */
  contextFor(agent, playerTags = [], { fear = false } = {}) {
    const vs = this.villages.find((v) => v.village === agent.village);
    const hour = this.game.gameClock.hour;
    const region = { taiga: 'taiga', desert: 'deserto', jungle: 'mata' }[OUTFIT_REGION[vs?.biome]] ?? 'central';
    const worked = Math.max(0, Math.min(4.5, hour - 7.5)) + Math.max(0, Math.min(4.5, hour - 13));
    return DialogueEngine.context({
      person: agent.person, energy: agent.energy, activity: (agent.activity ?? 'WORK').replace(/^LEISURE.*/, 'LEISURE'), hour,
      weather: this.weatherWord(vs), region, family: agent.family, player: playerTags, memory: this.memoryOf(agent),
      hoursWorked: agent.person.profession && agent.person.age === 'adult' ? worked : 0, village: agent.village.config.name,
      professionName: PROFESSIONS[agent.person.profession]?.name ?? (agent.person.age === 'child' ? 'Criança' : agent.person.age === 'elder' ? 'Idoso' : 'Morador'), fear,
    });
  }

  // ------------------------------------------------------------ vida social

  /**
   * Percepção e vida social (só moradores com boneco):
   * - jogador ameaçador perto → encara e reclama, ou foge gritando;
   * - dois moradores que se cruzam → param, viram-se e trocam balões.
   * @param {number} dt
   * @param {{ x:number, z:number, armed:boolean, dirt:number, bleeding:boolean, sanity:number, sprinting:boolean, vx:number, vz:number, wanted?:boolean }} player
   */
  updateSocial(dt, player) {
    const list = (this.rendering ?? []).filter((a) => a.rendered && !a.indoors && !a.down);
    this._perceiveT -= dt;
    if (this._perceiveT <= 0) {
      this._perceiveT = 0.25;
      for (const a of list) {
        if (a.reactCooldown > 0 || a.reaction?.kind === 'FLEE' || a.reaction?.kind === 'RUN_TO') continue;
        const dx = a.pos.x - player.x, dz = a.pos.z - player.z, dist = Math.hypot(dx, dz);
        const sp = Math.hypot(player.vx, player.vz) || 1;
        const towardDot = dist > 0.01 ? (player.vx * dx + player.vz * dz) / (sp * dist) : 1;
        const { tags, threat } = DialogueEngine.perceive({ ...player, towardDot, dist });
        if (threat < PERCEPTION.startle) continue;
        a.reactCooldown = PERCEPTION.cooldown;
        const guard = a.person.profession === 'guarda';
        const flee = threat >= PERCEPTION.flee && !guard;
        const ctx = this.contextFor(a, tags, { fear: !guard });
        this.bubbles?.say(a, DialogueEngine.line('react', ctx, this.rng), 3, flee ? 'medo' : 'alerta');
        if (flee) a.react('FLEE', PERCEPTION.fleeSeconds, player);
        else a.react('FACE', 2.5, player, guard ? 'point' : null);
      }
    }
    this._socialT -= dt;
    if (this._socialT > 0) return;
    this._socialT = SOCIAL.checkEvery;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.reaction || a.chatCooldown > 0 || a.state === 'WORKING' || a.state === 'SLEEPING') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.reaction || b.chatCooldown > 0 || b.state === 'WORKING' || b.state === 'SLEEPING') continue;
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > SOCIAL.radius) continue;
        a.chatCooldown = b.chatCooldown = SOCIAL.cooldown;
        if (this.rng() > SOCIAL.chance) break;
        const secs = SOCIAL.seconds[0] + this.rng() * (SOCIAL.seconds[1] - SOCIAL.seconds[0]);
        a.react('CHAT', secs, b.pos); b.react('CHAT', secs, a.pos);
        const family = a.person.familyId === b.person.familyId && a.village === b.village;
        const ca = this.contextFor(a), cb = this.contextFor(b);
        if (family) { ca.spouse = b.name; cb.spouse = a.name; }
        this.bubbles?.say(a, DialogueEngine.line(family ? 'family' : 'smalltalk', ca, this.rng), SOCIAL.bubbleSeconds);
        setTimeout(() => this.bubbles?.say(b, DialogueEngine.line(family ? 'family' : 'smalltalk', cb, this.rng), SOCIAL.bubbleSeconds), 1100);
        this.chats = (this.chats ?? 0) + 1;
        break;
      }
    }
  }

  /** Números para a HUD/depuração. */
  stats() {
    let active = 0, rendered = 0;
    for (const vs of this.villages) if (vs.active) active += vs.agents.length;
    for (const a of this.agents) if (a.rendered) rendered++;
    return { villages: this.villages.length, total: this.agents.length, simulated: active, rendered };
  }
}

export { POPULATION };
