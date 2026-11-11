import { NUTRITION } from '../config/survival.js';

/** As 4 barras do relógio bio-nutricional, na ordem da HUD. */
export const MACROS = ['proteins', 'carbs', 'fats', 'water'];

/** Nomes para a interface. */
export const MACRO_NAMES = { proteins: 'Proteínas', carbs: 'Carboidratos', fats: 'Gorduras', water: 'Hidratação' };

/**
 * Nutrição por macronutrientes (regra pura). Cada barra 0..max cai sozinha
 * (mais rápido correndo e com parasitas) e sobe ao comer.
 *
 * @example
 * const n = new Nutrition();
 * n.update(60, { sprinting: false, parasites: false }); // 1 minuto
 * n.eat(FOODS.banana);
 * n.deficits(); // ['water'] se a água estiver abaixo de NUTRITION.deficient
 */
export class Nutrition {
  /** @param {typeof NUTRITION} [cfg] */
  constructor(cfg = NUTRITION) {
    this.cfg = cfg;
    this.values = { ...cfg.start };
  }

  /**
   * Gasta as barras.
   * @param {number} dt s
   * @param {{ sprinting?: boolean, parasites?: boolean }} [ctx]
   */
  update(dt, { sprinting = false, parasites = false } = {}) {
    const c = this.cfg, min = dt / 60;
    for (const k of MACROS) {
      let rate = c.drainPerMinute[k];
      if (sprinting) rate *= c.sprintMultiplier[k];
      if (parasites) rate *= c.parasiteMultiplier;
      this.values[k] = Math.max(0, this.values[k] - rate * min);
    }
  }

  /**
   * Come/bebe: soma os macros do alimento (negativo = tira, ex.: carne seca dá sede).
   * @param {{ proteins?: number, carbs?: number, fats?: number, water?: number }} food
   */
  eat(food) {
    for (const k of MACROS) if (food[k]) this.values[k] = Math.min(this.cfg.max, Math.max(0, this.values[k] + food[k]));
  }

  /** Barras abaixo do limite de deficiência. */
  deficits() {
    return MACROS.filter((k) => this.values[k] < this.cfg.deficient);
  }

  /** Vida/s perdida pelas barras zeradas (fome e sede matam). */
  emptyDamage() {
    let d = 0;
    for (const k of MACROS) if (this.values[k] <= 0) d += this.cfg.emptyDamagePerSecond[k];
    return d;
  }

  /** Renascer: cada barra volta a pelo menos `respawnFloor`. */
  restoreFloor() {
    for (const k of MACROS) this.values[k] = Math.max(this.values[k], this.cfg.respawnFloor);
  }
}
