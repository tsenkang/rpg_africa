import { GAMEPLAY } from '../config/gameplay.js';

/**
 * Efeito da Injeção Suspeita (regra pura, testável).
 * `roll` < healChance → cura total: vida cheia e remove TODAS as doenças.
 * Senão → pega a Febre do Mendigo.
 *
 * @example
 *   const r = applySuspiciousInjection(game.state, Math.random()); // 'cura' | 'doenca'
 * @param {import('./PlayerState.js').PlayerState} state
 * @param {number} roll número em [0, 1)
 * @returns {'cura' | 'doenca'}
 */
export function applySuspiciousInjection(state, roll, cfg = GAMEPLAY.items.injecao_suspeita) {
  if (roll < cfg.healChance) {
    state.healFull();
    for (const e of [...state.effects]) if (e.def.kind === 'disease') state.removeEffect(e.id);
    return 'cura';
  }
  state.addEffect('febre_mendigo');
  return 'doenca';
}

/**
 * O que acontece ao clicar com cada item equipado. Recebe o `game` e o item;
 * devolve true se o item foi gasto (sai da hotbar).
 */
export const ITEM_USES = {
  injecao_suspeita(game) {
    const r = applySuspiciousInjection(game.state, game.random());
    game.ui.dialogue.open({
      speaker: 'Injeção Suspeita',
      text: r === 'cura'
        ? 'A agulha arde, depois um calor bom sobe pelo braço. Você se sente inteiro de novo: vida cheia e nenhuma doença.'
        : 'O líquido queima nas veias. A vista amarela, a testa ferve: você pegou a <b>Febre do Mendigo</b>. '
          + 'Só o Senhor da casa destruída, na Vila Renascimento, conhece a cura.',
      options: [{ label: r === 'cura' ? 'Que alívio…' : 'Ah, não…' }],
    });
    return true;
  },
};
