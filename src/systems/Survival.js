import {
  NUTRITION, DEFICIENCY, STAMINA, SANITY, DIRT, CONDITIONS, CONTAMINATION, FOODS, ANIMAL_WOUNDS, HAZARDS, WOUNDS,
} from '../config/survival.js';
import { Body } from './Body.js';
import { Nutrition, MACRO_NAMES } from './Nutrition.js';
import { SanityManager } from './SanityManager.js';

/**
 * Sobrevivência avançada: junta corpo (ferimentos/doenças), nutrição,
 * stamina, sanidade, sujeira e desmaios, e converte tudo em dano de vida
 * no PlayerState (pode matar). Regra pura: o jogo passa o ambiente a cada
 * quadro; o aleatório é injetável.
 *
 * Integração no loop (Game.update):
 * ```js
 * const r = survival.update(dt, { moving, sprinting, swimming, rain, sand, ash, nearFire, inVillage, jungle });
 * if (r.died) game.killPlayer(r.died);
 * ```
 *
 * Eventos (`on`): 'alert' { icon, title, text, inspect } — pop-up de
 * condição nova; 'whisper' (texto de alucinação); 'faint' (s); 'message'.
 *
 * @example
 * const s = new Survival({ state, rng: Math.random });
 * s.consume('agua_rio');      // pode dar parasitas
 * s.onAnimalHit('vibora');    // picada venenosa numa perna
 * s.canSprint();              // false com stamina zerada
 */
export class Survival {
  /**
   * @param {{ state: import('./PlayerState.js').PlayerState, rng?: () => number }} o
   */
  constructor({ state, rng = Math.random }) {
    this.state = state;
    this.rng = rng;
    this.body = new Body({ rng });
    this.nutrition = new Nutrition();
    this.stamina = STAMINA.max;
    this.exhausted = false;
    /** Dono da sanidade: gatilhos de trauma, ficha do personagem, níveis de alucinação. */
    this.sanityMgr = new SanityManager({ start: SANITY.start, max: SANITY.max });
    this.clock = 0; // s de jogo (recargas das atividades de conforto)
    this.dirt = 0;
    this.faintLeft = 0;
    this._restFor = 0;
    this._hpDebt = 0;
    this._whisperIn = this.whisperDelay();
    this.listeners = new Map();
    this.lastCause = null;

    this.body.on('wound-added', (w) => {
      const d = WOUNDS[w.type];
      this.emit('alert', { icon: d.icon, title: d.name, text: `Novo ferimento: ${d.name.toLowerCase()}. Inspecione o corpo.`, inspect: true });
    });
    this.body.on('wound-changed', (w) => {
      if (w.type === 'infeccao') this.emit('alert', { icon: WOUNDS.infeccao.icon, title: 'Infecção!', text: 'Uma ferida acumulou pus. Larvas de carne limpam o tecido morto.', inspect: true });
    });
    this.body.on('condition-added', ({ def }) => this.emit('alert', { icon: def.icon, title: def.name, text: 'Você ficou doente. Coma Cogumelo Azul/Roxo ou Guanábana.', inspect: false }));
    this.body.on('condition-removed', ({ def }) => this.emit('message', `${def.name}: curado.`));
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  emit(event, data) {
    for (const fn of this.listeners.get(event) ?? []) fn(data);
  }

  whisperDelay() {
    const [a, b] = SANITY.whisperEvery;
    return a + this.rng() * (b - a);
  }

  // ------------------------------------------------------------ estado derivado

  /** Sanidade 0..100 (vive no SanityManager). */
  get sanity() {
    return this.sanityMgr.value;
  }

  set sanity(v) {
    this.sanityMgr.value = Math.max(0, Math.min(this.sanityMgr.max, v));
    this.sanityMgr.checkLevel();
  }

  /** Máximo de stamina hoje: deficiências e febre encolhem a barra. */
  get staminaMax() {
    const deficits = this.nutrition.deficits().length;
    const fever = Math.min(1, this.body.fever);
    return Math.max(15, STAMINA.max - deficits * DEFICIENCY.staminaMaxPerDeficit - fever * CONDITIONS.febre.staminaMax);
  }

  /** Correr: precisa de stamina (zerou → espera recuperar `recoverThreshold`). */
  canSprint() {
    return !this.exhausted && this.stamina > 0 && this.faintLeft <= 0;
  }

  /** 0..1: força da distorção visual (começa no nível 1 de alucinação, sanidade < 50). */
  get hallucination() {
    return Math.max(0, Math.min(1, (50 - this.sanity) / 50));
  }

  get fainted() {
    return this.faintLeft > 0;
  }

  /** Pele suja o bastante para a HUD avisar. */
  get dirty() {
    return this.dirt >= DIRT.dirtyWarning;
  }

  // ------------------------------------------------------------ eventos do jogo

  /** Algo sujou o jogador (soco, caça, esfolar). */
  addDirt(n) {
    this.dirt = Math.min(DIRT.max, this.dirt + n);
  }

  /**
   * Um animal acertou o jogador: talvez deixe um ferimento (tipo por espécie).
   * @param {string} speciesId chave de SPECIES
   * @returns {object|null} o ferimento criado
   */
  onAnimalHit(speciesId) {
    const rule = ANIMAL_WOUNDS[speciesId] ?? ANIMAL_WOUNDS.default;
    this.addDirt(DIRT.perAnimalHit);
    if (this.rng() >= rule.chance) return null;
    return this.body.addWound(rule.type, rule.limbs);
  }

  /**
   * Come ou bebe (FOODS). Aplica macros, cura e contaminação.
   * @param {keyof typeof FOODS} id
   * @returns {string} mensagem para a HUD
   */
  consume(id) {
    const food = FOODS[id];
    if (!food) return 'Isso não se come.';
    this.nutrition.eat(food);
    const parts = [food.name];
    if (food.sanity) this.sanity = this.sanity + food.sanity;
    if (food.sweet && this.sanityMgr.comfort('COMER_DOCES', 0, this.clock) > 0) parts.push('a mente acalma');
    for (const c of food.cures ?? []) {
      if (c === 'veneno') {
        const venom = this.body.wounds.filter((w) => w.type === 'veneno');
        for (const w of venom) this.body.morph(w, WOUNDS.veneno.neutralized);
        if (venom.length) parts.push('o veneno perdeu a força');
      } else if (this.body.cureCondition(c)) parts.push(`${CONDITIONS[c].name.toLowerCase()} curado`);
    }
    if (food.contamination && this.rng() < CONTAMINATION[food.contamination]) this.body.addCondition('parasitas');
    return parts.join(' · ');
  }

  /** Médico da vila: trata tudo (ferimentos, doenças, sujeira). */
  treatAll() {
    this.body.clear();
    this.dirt = 0;
  }

  /** Renasceu: corpo limpo, barras com um mínimo, sanidade e stamina cheias. */
  respawn() {
    this.body.clear();
    this.nutrition.restoreFloor();
    this.stamina = STAMINA.max;
    this.exhausted = false;
    this.sanity = Math.max(this.sanity, SANITY.start * 0.6);
    this.dirt = 0;
    this.faintLeft = 0;
    this._hpDebt = 0;
  }

  // ------------------------------------------------------------ simulação

  /**
   * Um quadro de sobrevivência.
   * @param {number} dt s
   * @param {{ moving?: boolean, sprinting?: boolean, swimming?: boolean, rain?: number, sand?: number, ash?: number,
   *   nearFire?: boolean, inVillage?: boolean, jungle?: boolean, freshWater?: boolean, paused?: boolean }} env
   *   rain/sand/ash = intensidade 0..1 do clima no jogador
   * @returns {{ died: string|null, hpPerSecond: number, fever: number }}
   */
  update(dt, env = {}) {
    if (env.paused) return { died: null, hpPerSecond: 0, fever: this.body.fever };
    const min = dt / 60;
    this.clock += dt;

    // Sujeira: anda/corre/tempestade suja; rio e chuva lavam.
    if (env.swimming) this.dirt -= DIRT.swimWashPerSecond * dt;
    else {
      if (env.moving) this.dirt += (env.sprinting ? DIRT.sprintPerSecond : DIRT.walkPerSecond) * dt;
      this.dirt += (DIRT.sandstormPerSecond * (env.sand ?? 0) + DIRT.ashPerSecond * (env.ash ?? 0)) * dt;
      this.dirt -= DIRT.rainWashPerSecond * (env.rain ?? 0) * dt;
    }
    this.dirt = Math.max(0, Math.min(DIRT.max, this.dirt));

    // Desmaio: sem controle até passar.
    if (this.faintLeft > 0) this.faintLeft -= dt;

    // Stamina.
    const max = this.staminaMax;
    if (env.sprinting && this.canSprint()) {
      this.stamina -= STAMINA.sprintDrainPerSecond * dt;
      this._restFor = 0;
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
    } else {
      this._restFor += dt;
      if (this._restFor >= STAMINA.regenDelay) {
        const regen = STAMINA.regenPerSecond * (this.nutrition.deficits().length ? DEFICIENCY.staminaRegenDeficit : 1);
        this.stamina += regen * dt;
      }
      if (this.exhausted && this.stamina >= STAMINA.recoverThreshold) this.exhausted = false;
    }
    this.stamina = Math.min(this.stamina, max);

    // Nutrição.
    const parasites = this.body.hasCondition('parasitas');
    this.nutrition.update(dt, { sprinting: !!env.sprinting && this.canSprint(), parasites });
    const deficits = this.nutrition.deficits();

    // Corpo (sangramento, infecção, veneno, febre).
    const b = this.body.update(dt, { dirt: this.dirt });

    // Ambiente: sanguessugas na água doce, larvas na mata fechada.
    if (env.swimming && env.freshWater !== false && this.rng() < HAZARDS.leechPerMinuteSwimming * min) this.body.addWound('sanguessuga', 'legs');
    if (env.jungle && env.moving && this.rng() < HAZARDS.wormPerMinuteJungle * min) this.body.addWound('larva');

    // Desmaio por falta de água ou carboidrato.
    if (this.faintLeft <= 0 && (deficits.includes('water') || deficits.includes('carbs')) && this.rng() < DEFICIENCY.faintChancePerMinute * min) {
      this.faintLeft = DEFICIENCY.faintSeconds;
      this.emit('faint', DEFICIENCY.faintSeconds);
    }

    // Sanidade.
    let sanityRate = -b.sanityPerMinute;
    if (deficits.includes('proteins') || deficits.includes('fats')) sanityRate -= DEFICIENCY.sanityDrainPerMinute;
    // Fogo agora é conforto da ficha (SanityManager.comfort('FOGUEIRA')); a vila ainda acalma um pouco mais.
    if (sanityRate >= 0 && !deficits.length) sanityRate += env.inVillage ? SANITY.regenNearFirePerMinute : SANITY.regenPerMinute;
    if (sanityRate < 0) this.sanityMgr.drainSanity(-sanityRate * min, 'Corpo doente', { quiet: true });
    else this.sanityMgr.restoreSanity(sanityRate * min, 'Descanso', { quiet: true });
    if (this.sanityMgr.level >= 2) { // nível 2: vozes
      this._whisperIn -= dt;
      if (this._whisperIn <= 0) {
        this._whisperIn = this.whisperDelay() * (1.2 - this.hallucination);
        this.emit('whisper', SANITY.whispers[Math.floor(this.rng() * SANITY.whispers.length)]);
      }
    }

    // Vida: sangue, veneno, infecção, fome/sede, colapso mental.
    const starving = this.nutrition.emptyDamage();
    const breakdown = this.sanity < SANITY.breakdown ? SANITY.breakdownDamagePerSecond : 0;
    const hps = b.hpPerSecond + starving + breakdown;
    if (hps > 0) {
      this.lastCause = this.causeOf(b, starving, breakdown);
      this._hpDebt += hps * dt;
      if (this._hpDebt >= 1) {
        const n = Math.floor(this._hpDebt);
        this._hpDebt -= n;
        this.state.damage(n);
      }
    }
    const died = this.state.health <= 0 ? this.lastCause : null;
    return { died, hpPerSecond: hps, fever: b.fever };
  }

  /** Frase de morte: o que mais pesou. */
  causeOf(b, starving, breakdown) {
    if (starving >= b.hpPerSecond && starving >= breakdown) {
      const empty = Object.entries(this.nutrition.values).filter(([, v]) => v <= 0).map(([k]) => MACRO_NAMES[k].toLowerCase());
      return empty.includes('hidratação') ? 'Você morreu de sede' : `Você morreu de fome (sem ${empty.join(', ')})`;
    }
    if (breakdown > b.hpPerSecond) return 'Sua mente cedeu';
    if (this.body.wounds.some((w) => w.type === 'veneno')) return 'O veneno chegou ao coração';
    if (this.body.wounds.some((w) => w.type === 'infeccao')) return 'A infecção tomou seu corpo';
    return 'Você sangrou até a morte';
  }
}
