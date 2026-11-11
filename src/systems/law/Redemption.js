/**
 * Redenção (Etapa C5): pagar a recompensa ao Comandante da Guarda limpa a
 * ficha daquela vila — desde que nenhum guarda esteja atrás do jogador.
 *
 * @example
 *   const q = payQuote(bounty.bountyOf(v), { chasing: algumGuardaPerseguindo, coins: state.coins });
 *   if (q.ok && state.spend(q.cost)) bounty.clear(v);
 *
 * @param {number} bounty recompensa da vila
 * @param {{ chasing: boolean, coins: number }} ctx
 * @returns {{ ok: boolean, cost: number, reason: null | 'limpa' | 'combate' | 'moedas' }}
 */
export function payQuote(bounty, { chasing, coins }) {
  if (bounty <= 0) return { ok: false, cost: 0, reason: 'limpa' };
  if (chasing) return { ok: false, cost: bounty, reason: 'combate' };
  if (coins < bounty) return { ok: false, cost: bounty, reason: 'moedas' };
  return { ok: true, cost: bounty, reason: null };
}
