import { DIALOGUE, MOOD_LABELS, PERCEPTION } from '../../config/dialogues.js';
import { ENERGY } from '../../config/npcLife.js';

/**
 * Motor de diálogo contextual (regra pura):
 *   Fala = F(profissão, humor, cansaço, horário, clima, bioma, família, estado do jogador, memória)
 *
 * @example
 * const ctx = DialogueEngine.context({ person, energy, activity, hour, weather, region, family, player, memory, hoursWorked });
 * DialogueEngine.header(ctx);                 // "Alberto Torres - Agricultor | Cansado & Cabisbaixo"
 * DialogueEngine.line('greet', ctx, rng);     // fala mais específica que casa com o contexto
 */
export const DialogueEngine = {
  /** Período do dia pela hora. */
  period(hour) {
    if (hour < 5) return 'madrugada';
    if (hour < 11.5) return 'manha';
    if (hour < 13) return 'almoco';
    if (hour < 17) return 'tarde';
    if (hour < 20.5) return 'fim_de_tarde';
    return 'noite';
  },

  /**
   * Humor a partir do estado do NPC e do mundo.
   * @returns {keyof typeof MOOD_LABELS}
   */
  mood({ energy = 1, weather = 'limpo', memory = {}, fear = false, hoursWorked = 0 }) {
    if (memory.agredido || memory.parente_agredido) return 'RANCOROSO';
    if (fear) return 'ASSUSTADO';
    if (memory.provocado >= 2) return 'IRRITADO';
    if (energy < ENERGY.exhausted || (energy < ENERGY.tired && hoursWorked >= 8)) return 'TRISTE_E_CANSADO';
    if (energy < ENERGY.tired) return 'CANSADO';
    if (weather === 'frio' || weather === 'neve') return 'COM_FRIO';
    if (weather === 'calor') return 'COM_CALOR';
    if (energy > 0.8 && weather === 'limpo') return 'FELIZ';
    return 'NEUTRO';
  },

  /**
   * Contexto completo de uma fala.
   * @param {object} o
   * @param {{ first: string, last: string, fullName: string, profession: string|null, age: string, role: string }} o.person
   * @param {string[]} [o.family] nomes completos da família
   * @param {string[]} [o.player] tags do jogador (armado, ensanguentado, insano, correndo, procurado)
   * @param {Record<string, number|boolean>} [o.memory] provocado (n), agredido, parente_agredido
   */
  context({ person, energy = 1, activity = 'WORK', hour = 12, weather = 'limpo', region = 'central', family = [], player = [], memory = {}, hoursWorked = 0, village = '', professionName = '', fear = false }) {
    const profession = person.age === 'child' ? 'crianca' : person.age === 'elder' ? 'idoso' : person.profession ?? 'morador';
    const spouse = family.find((n) => n !== person.fullName) ?? null;
    const kid = family[family.length - 1] ?? null;
    const memTags = Object.entries(memory).filter(([, v]) => v).map(([k]) => k);
    return {
      person, profession, professionName, energy, activity, hour, weather, region, village, hoursWorked,
      period: this.period(hour),
      mood: this.mood({ energy, weather, memory, fear, hoursWorked }),
      family: family.length > 0, spouse, kid,
      player, memory: memTags,
    };
  },

  /** Cabeçalho da caixa: "Nome - Profissão | Humor". */
  header(ctx) {
    return `${ctx.person.fullName} - ${ctx.professionName || ctx.profession} | ${MOOD_LABELS[ctx.mood] ?? ctx.mood}`;
  },

  /** Quantas condições da fala batem; -1 = alguma não bate. */
  score(when, ctx) {
    if (!when) return 0;
    let n = 0;
    for (const [k, want] of Object.entries(when)) {
      const list = Array.isArray(want) ? want : [want];
      let ok;
      if (k === 'player' || k === 'memory') ok = list.some((t) => ctx[k].includes(t));
      else if (k === 'family') ok = ctx.family === want;
      else ok = list.includes(ctx[k]);
      if (!ok) return -1;
      n++;
    }
    return n;
  },

  /**
   * Fala para a intenção. Entre as que batem, as mais específicas ganham;
   * empate = sorteio pelo `rng`.
   * @param {keyof typeof DIALOGUE} intent
   * @returns {string}
   */
  line(intent, ctx, rng = Math.random, table = DIALOGUE) {
    const lines = table[intent] ?? [];
    let best = -1, pool = [];
    for (const l of lines) {
      const s = this.score(l.when, ctx);
      if (s > best) { best = s; pool = [l]; } else if (s === best && s >= 0) pool.push(l);
    }
    if (!pool.length) return '...';
    return this.fill(pool[Math.floor(rng() * pool.length) % pool.length].text, ctx);
  },

  /** Troca os marcadores {nome} {conjuge}… pelos valores do contexto. */
  fill(text, ctx) {
    const first = (n) => (n ? n.split(' ')[0] : 'a família');
    const values = {
      nome: ctx.person.fullName, primeiro: ctx.person.first, vila: ctx.village || 'a vila', profissao: (ctx.professionName || ctx.profession).toLowerCase(),
      conjuge: first(ctx.spouse), filho: first(ctx.kid), horas: Math.max(1, Math.round(ctx.hoursWorked)),
      jogador_titulo: ctx.memory.includes('provocado') ? 'encrenqueiro' : 'forasteiro',
    };
    return text.replace(/\{(\w+)\}/g, (m, k) => (values[k] ?? m));
  },

  /**
   * Estado do jogador visto pelo NPC: tags e pontos de ameaça.
   * @param {{ armed: boolean, dirt: number, bleeding: boolean, sanity: number, sprinting: boolean, towardDot: number, dist: number, wanted?: boolean }} p
   * @returns {{ tags: string[], threat: number }}
   */
  perceive(p, cfg = PERCEPTION) {
    const tags = [];
    if (p.dist > Math.max(cfg.radius, cfg.sprintRadius)) return { tags, threat: 0 };
    const close = p.dist <= cfg.radius;
    if (close && p.armed) tags.push('armado');
    if (close && (p.bleeding || p.dirt >= cfg.bloodyDirt)) tags.push('ensanguentado');
    if (close && p.sanity < cfg.insaneBelow) tags.push('insano');
    if (p.sprinting && p.towardDot >= cfg.approachDot && p.dist <= cfg.sprintRadius) tags.push('correndo');
    if (p.wanted) tags.push('procurado');
    return { tags, threat: tags.filter((t) => t !== 'procurado').length };
  },
};
