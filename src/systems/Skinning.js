import { SKINNING } from '../config/hunting.js';

/**
 * Esfolamento (regra pura): segurar E perto de uma carcaça com faca.
 *
 * @example
 * const sk = new Skinning();
 * sk.hold(dt, true, corpse);  // 0..1 enquanto segura; 1 = pronto
 * lootFor(spec)               // { carne: 2, pele: 1, osso: 2, tripas: 1 }
 */
export class Skinning {
  constructor(cfg = SKINNING) {
    this.cfg = cfg;
    this.progress = 0;
    this.target = null;
  }

  /**
   * Avança o progresso enquanto `holding` e o alvo é o mesmo; solta → volta a zero.
   * @returns {boolean} true quando completou (e zera para a próxima)
   */
  hold(dt, holding, target) {
    if (!holding || !target || target !== this.target) {
      this.target = holding ? target : null;
      this.progress = 0;
      return false;
    }
    this.progress = Math.min(1, this.progress + dt / this.cfg.holdSeconds);
    if (this.progress >= 1) { this.progress = 0; this.target = null; return true; }
    return false;
  }

  /** Faca equipada? */
  static hasKnife(itemId, cfg = SKINNING) {
    return cfg.knives.includes(itemId);
  }
}

/**
 * Peças que uma carcaça rende, pelo porte (`spec.size`) e tipo (aves dão penas).
 * @param {{ size: number, model?: string }} spec
 * @returns {Record<string, number>} tipo de prop → quantidade
 */
export function lootFor(spec, cfg = SKINNING) {
  if (cfg.birdModels.includes(spec.model)) return { ...cfg.loot.bird };
  const s = spec.size ?? 1;
  if (s >= cfg.sizeThresholds.large) return { ...cfg.loot.large };
  if (s >= cfg.sizeThresholds.medium) return { ...cfg.loot.medium };
  return { ...cfg.loot.small };
}
