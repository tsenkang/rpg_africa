import { GAMEPLAY, STATUS_EFFECTS } from '../config/gameplay.js';

/** Itens do inventário. */
export const ITEMS = {
  pocao_cura_total: { name: 'Poção de Cura Total', description: 'Restaura toda a vida. Não cura doenças.' },
  carta_recomendacao: { name: 'Carta de Recomendação', description: 'Escrita pelo Senhor da Vila Renascimento. O prefeito da Bússola do Sul confia nele.' },
};

/**
 * Estado do jogador: vida, moedas, inventário, efeitos (buffs/doenças),
 * exposição paranormal, poder das relíquias e confiança com facções.
 * Emite eventos simples para a UI: 'change', 'effect-added', 'effect-removed', 'message'.
 */
export class PlayerState {
  constructor() {
    this.maxHealth = GAMEPLAY.player.maxHealth;
    this.health = this.maxHealth;
    this.coins = GAMEPLAY.player.startCoins;
    this.inventory = new Map();
    /** @type {{id:string, def:object, remaining:number|null, tick:number}[]} */
    this.effects = [];
    this.paranormalExposure = 0; // %
    this.trust = { bussola: 0 };
    this.flags = new Set();
    this.listeners = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  emit(event, data) {
    for (const fn of this.listeners.get(event) ?? []) fn(data);
    if (event !== 'change') for (const fn of this.listeners.get('change') ?? []) fn();
  }

  // ---- vida ----
  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.emit('change');
  }

  healFull() {
    this.health = this.maxHealth;
    this.emit('change');
  }

  damage(amount, floor = 0) {
    this.health = Math.max(floor, this.health - amount);
    this.emit('change');
  }

  // ---- moedas e itens ----
  spend(amount) {
    if (this.coins < amount) return false;
    this.coins -= amount;
    this.emit('change');
    return true;
  }

  addItem(id, n = 1) {
    this.inventory.set(id, (this.inventory.get(id) ?? 0) + n);
    this.emit('change');
  }

  hasItem(id) {
    return (this.inventory.get(id) ?? 0) > 0;
  }

  removeItem(id, n = 1) {
    const c = this.inventory.get(id) ?? 0;
    if (c < n) return false;
    if (c === n) this.inventory.delete(id);
    else this.inventory.set(id, c - n);
    this.emit('change');
    return true;
  }

  /** Usa a poção de cura total (tecla H). */
  usePotion() {
    if (!this.removeItem('pocao_cura_total')) {
      this.emit('message', 'Você não tem Poção de Cura Total.');
      return false;
    }
    this.healFull();
    const sick = this.effects.some((e) => e.def.kind === 'disease');
    this.emit('message', sick
      ? 'Vida restaurada! Mas a febre continua… só o Senhor da Vila Renascimento pode curá-la.'
      : 'Vida totalmente restaurada.');
    return true;
  }

  // ---- efeitos ----
  hasEffect(id) {
    return this.effects.some((e) => e.id === id);
  }

  addEffect(id) {
    const def = STATUS_EFFECTS[id];
    const existing = this.effects.find((e) => e.id === id);
    if (existing) {
      existing.remaining = def.duration; // renova a duração
    } else {
      this.effects.push({ id, def, remaining: def.duration, tick: 0 });
      this.emit('effect-added', { id, def });
    }
    this.emit('change');
  }

  /** Remove um efeito. `by` = quem está curando (checa `curableBy`). */
  removeEffect(id, by = null) {
    const e = this.effects.find((x) => x.id === id);
    if (!e) return false;
    if (e.def.curableBy && by && !e.def.curableBy.includes(by)) return false;
    this.effects = this.effects.filter((x) => x !== e);
    this.emit('effect-removed', { id, def: e.def });
    return true;
  }

  /** Multiplica os modificadores ativos (ex.: 'speed', 'relicPower'). */
  modifier(name) {
    let m = 1;
    for (const e of this.effects) if (e.def.modifiers?.[name]) m *= e.def.modifiers[name];
    return m;
  }

  get relicPower() {
    return this.modifier('relicPower');
  }

  addParanormalExposure(pct) {
    this.paranormalExposure = Math.min(100, this.paranormalExposure + pct);
    this.emit('change');
  }

  update(dt) {
    let changed = false;
    for (const e of [...this.effects]) {
      if (e.remaining !== null) {
        e.remaining -= dt;
        if (e.remaining <= 0) {
          this.removeEffect(e.id);
          this.emit('message', `${e.def.name} terminou.`);
          changed = true;
          continue;
        }
      }
      if (e.def.tickSeconds) {
        e.tick += dt;
        if (e.tick >= e.def.tickSeconds) {
          e.tick = 0;
          this.damage(e.def.damagePerTick, e.def.minHealth ?? 0);
        }
      }
    }
    if (changed) this.emit('change');
  }
}
