import { LAW } from '../../config/law.js';

/**
 * Memória social na rua (Etapa C5): vítima ou parente de vítima que vê o jogador.
 * Se o jogador é procurado ali, pode correr para chamar a guarda; senão foge gritando.
 *
 * @example
 *   const r = grudgeReaction(npcManager.memoryOf(a), { wanted }, rng); // 'call_guard' | 'flee' | null
 *
 * @param {{ agredido?: boolean, parente_agredido?: boolean, parente_morto?: boolean }} mem
 * @param {{ wanted: boolean }} ctx
 * @param {() => number} rng
 * @param {{ callGuardChance: number }} [cfg]
 */
export function grudgeReaction(mem, { wanted }, rng, cfg = LAW.grudge) {
  if (!mem.agredido && !mem.parente_agredido && !mem.parente_morto) return null;
  if (wanted && rng() < cfg.callGuardChance) return 'call_guard';
  return 'flee';
}
