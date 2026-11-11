import { LIMBS, WOUNDS, INFECTION, CONDITIONS } from '../config/survival.js';

/**
 * Biologia do corpo do jogador (regra pura, sem Three.js): ferimentos por
 * membro e doenças do corpo todo.
 *
 * Cada ferimento: { id, type, limb, spot, age, open, bandage }
 * - limb: chave de LIMBS (bracoE, bracoD, pernaE, pernaD)
 * - spot: onde fica na malha { seg: 'upper'|'lower', t: 0..1 ao longo do osso, angle }
 * - open: segundos aberto SEM curativo (conta para infeccionar)
 * - bandage: null | { item, age, infected } — `infected` já foi sorteado na
 *   hora de enfaixar; o pus aparece `INFECTION.revealAfter` s depois
 *
 * Ciclo: laceração aberta sangra → (curativo/sutura) para de sangrar →
 * cicatriza em `healBandaged` s. Curativo com pele suja ou ferida esquecida
 * aberta → infecção (febre, sanidade) → larvas de carne limpam → cobrir de novo.
 *
 * Eventos (`on`): 'wound-added', 'wound-removed', 'wound-changed',
 * 'condition-added', 'condition-removed'.
 *
 * @example
 * const body = new Body({ rng: Math.random });
 * const w = body.addWound('laceracao', 'pernaE');
 * body.treat(w.id, 'curativo_cinza', { dirt: 10 }); // { ok: true, action: 'bandage', ... }
 * const r = body.update(1, { dirt: 10 }); // { hpPerSecond, sanityPerMinute, fever }
 */
export class Body {
  /**
   * @param {{ rng?: () => number }} [o] aleatório injetável (testes)
   */
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    /** @type {object[]} */
    this.wounds = [];
    /** Doenças do corpo todo: id → { age } */
    this.conditions = new Map();
    this.nextId = 1;
    this.listeners = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  emit(event, data) {
    for (const fn of this.listeners.get(event) ?? []) fn(data);
  }

  /**
   * Novo ferimento. Sem `limb`, sorteia um (ou entre braços/pernas).
   * @param {keyof typeof WOUNDS} type
   * @param {keyof typeof LIMBS | 'arms' | 'legs' | 'any'} [limb]
   * @param {{seg:string, t:number, angle:number}} [spot]
   */
  addWound(type, limb = 'any', spot = null) {
    if (!WOUNDS[type]) throw new Error(`Ferimento desconhecido: ${type}`);
    const w = { id: this.nextId++, type, limb: this.pickLimb(limb), spot: spot ?? this.pickSpot(), age: 0, open: 0, bandage: null };
    this.wounds.push(w);
    this.emit('wound-added', w);
    return w;
  }

  pickLimb(limb) {
    if (LIMBS[limb]) return limb;
    const keys = Object.keys(LIMBS).filter((k) => limb === 'any' || (limb === 'arms') === LIMBS[k].arm);
    return keys[Math.floor(this.rng() * keys.length) % keys.length];
  }

  pickSpot() {
    return { seg: this.rng() < 0.6 ? 'lower' : 'upper', t: 0.2 + this.rng() * 0.6, angle: (this.rng() - 0.5) * Math.PI * 1.6 };
  }

  get(id) {
    return this.wounds.find((w) => w.id === id) ?? null;
  }

  /** Ferimentos de um membro. */
  onLimb(limb) {
    return this.wounds.filter((w) => w.limb === limb);
  }

  remove(w) {
    const i = this.wounds.indexOf(w);
    if (i < 0) return;
    this.wounds.splice(i, 1);
    this.emit('wound-removed', w);
  }

  /** Troca o tipo do ferimento (larva → infecção, infecção → limpa…). */
  morph(w, type) {
    w.type = type;
    w.age = 0;
    w.open = 0;
    w.bandage = null;
    this.emit('wound-changed', w);
  }

  // ------------------------------------------------------------ doenças

  hasCondition(id) {
    return this.conditions.has(id);
  }

  addCondition(id) {
    if (this.conditions.has(id)) return false;
    this.conditions.set(id, { age: 0 });
    this.emit('condition-added', { id, def: CONDITIONS[id] });
    return true;
  }

  cureCondition(id) {
    if (!this.conditions.delete(id)) return false;
    this.emit('condition-removed', { id, def: CONDITIONS[id] });
    return true;
  }

  /** Nível de febre (0 = nenhuma; ≥ CONDITIONS.febre.high = alta), somado das feridas. */
  get fever() {
    let f = 0;
    for (const w of this.wounds) f += WOUNDS[w.type].fever ?? 0;
    return Math.min(2, f);
  }

  // ------------------------------------------------------------ tratamento

  /**
   * Chance de o curativo infeccionar a ferida.
   * @param {string} item curativo
   * @param {number} dirt sujeira 0..100
   */
  static infectionChance(item, dirt) {
    const mul = INFECTION.dressings[item] ?? 1;
    return Math.min(1, (INFECTION.base + INFECTION.dirtWeight * (dirt / 100)) * mul);
  }

  /**
   * Aplica um item (ou 'maos') num ferimento.
   * @param {number} id ferimento
   * @param {string} item id do item ('maos' = puxar com a mão)
   * @param {{ dirt?: number }} [ctx]
   * @returns {{ ok: boolean, action?: string, message: string, infected?: boolean }}
   */
  treat(id, item, { dirt = 0 } = {}) {
    const w = this.get(id);
    if (!w) return { ok: false, message: 'Esse ferimento já não existe.' };
    const def = WOUNDS[w.type];
    const action = def.treat?.[item];
    if (!action) return { ok: false, message: `Isso não trata ${def.name.toLowerCase()}.` };
    switch (action) {
      case 'bandage':
      case 'suture': {
        if (w.bandage) return { ok: false, message: 'Já está coberto.' };
        const infected = this.rng() < Body.infectionChance(item, dirt);
        w.bandage = { item, age: 0, infected, suture: action === 'suture' };
        this.emit('wound-changed', w);
        return { ok: true, action, infected, message: action === 'suture' ? 'As formigas fecharam o corte.' : 'Ferida enfaixada.' };
      }
      case 'clean':
        this.morph(w, 'limpa');
        return { ok: true, action, message: 'As larvas comeram o pus e o tecido morto. Agora cubra a ferida.' };
      case 'antivenom': {
        this.morph(w, def.neutralized ?? 'arranhao');
        w.bandage = { item, age: 0, infected: this.rng() < Body.infectionChance(item, dirt), suture: false };
        this.emit('wound-changed', w);
        return { ok: true, action, infected: w.bandage.infected, message: 'O veneno foi neutralizado.' };
      }
      case 'extract':
      case 'pull':
        this.morph(w, 'arranhao');
        return { ok: true, action, message: action === 'pull' ? 'Você arrancou a sanguessuga.' : 'A agulha furou a pele e puxou a larva.' };
      default:
        return { ok: false, message: 'Nada acontece.' };
    }
  }

  /**
   * Tudo o que trata o tipo de ferimento (para a UI sugerir).
   * @param {keyof typeof WOUNDS} type
   */
  static treatmentsFor(type) {
    return Object.keys(WOUNDS[type].treat ?? {});
  }

  /** Cura completa (médico da vila): some com tudo. */
  clear() {
    for (const w of [...this.wounds]) this.remove(w);
    for (const id of [...this.conditions.keys()]) this.cureCondition(id);
  }

  // ------------------------------------------------------------ simulação

  /**
   * Avança a biologia.
   * @param {number} dt s
   * @param {{ dirt?: number }} [ctx] sujeira atual (acelera infecção)
   * @returns {{ hpPerSecond: number, sanityPerMinute: number, fever: number, bleeding: boolean }}
   */
  update(dt, { dirt = 0 } = {}) {
    let hp = 0, sanity = 0, bleeding = false;
    for (const w of [...this.wounds]) {
      const def = WOUNDS[w.type];
      w.age += dt;
      if (w.bandage) {
        w.bandage.age += dt;
        if (w.bandage.infected && w.bandage.age >= INFECTION.revealAfter) { this.morph(w, 'infeccao'); continue; }
        const heal = (def.healBandaged ?? 120) * (w.bandage.suture ? 0.6 : 1);
        if (!w.bandage.infected && w.bandage.age >= heal) { this.remove(w); continue; }
      } else {
        w.open += dt;
        if (def.bleed) { hp += def.bleed; bleeding = bleeding || def.bleed >= 0.1; }
        const limit = def.infectAfter && def.infectAfter * (1 - INFECTION.dirtSpeedup * Math.min(1, dirt / 100));
        if (limit && w.open >= limit) { this.morph(w, 'infeccao'); continue; }
      }
      if (def.damage) hp += def.damage;
      if (def.sanity) sanity += def.sanity;
      if (def.selfHeal && w.age >= def.selfHeal && !w.bandage?.infected) { this.remove(w); continue; }
      if (def.becomes && w.age >= def.becomesAfter) this.morph(w, def.becomes);
    }
    for (const c of this.conditions.values()) c.age += dt;
    const fever = this.fever;
    sanity += CONDITIONS.febre.sanityPerMinute * fever;
    return { hpPerSecond: hp, sanityPerMinute: sanity, fever, bleeding };
  }
}
