import { RECIPES } from '../config/items.js';

/**
 * Crafting livre por descoberta (regra pura): o jogador põe até `maxSlots`
 * itens na mesa e tenta. Uma receita bate quando o conjunto da mesa é
 * EXATAMENTE os ingredientes + ferramentas dela (sem ordem).
 *
 * @example
 * const c = new Crafting();
 * c.match(['folha_medicinal']);                    // receita curativo_folha
 * c.match(['corda', 'osso']);                      // receita faca_osso
 * c.match(['pedra', 'cipo']);                      // null → "nada aconteceu"
 * c.apply(recipe, state);                          // consome e entrega
 */
export class Crafting {
  constructor({ recipes = RECIPES, maxSlots = 4 } = {}) {
    this.recipes = recipes;
    this.maxSlots = maxSlots;
    this.keys = new Map(recipes.map((r) => [Crafting.key(Crafting.expand(r)), r]));
  }

  /** Lista de ids (com repetição) que a receita exige na mesa. */
  static expand(r) {
    const ids = [];
    for (const [id, n] of Object.entries(r.in)) for (let i = 0; i < n; i++) ids.push(id);
    for (const t of r.tools ?? []) ids.push(t);
    return ids;
  }

  static key(ids) {
    return [...ids].sort().join('+');
  }

  /**
   * Receita que corresponde exatamente ao que está na mesa.
   * @param {string[]} ids itens na mesa (com repetição)
   * @returns {object|null}
   */
  match(ids) {
    if (!ids.length || ids.length > this.maxSlots) return null;
    return this.keys.get(Crafting.key(ids)) ?? null;
  }

  /**
   * Receitas que usam TODOS os itens da mesa (dica: "falta algo").
   * @param {string[]} ids
   */
  partial(ids) {
    if (!ids.length) return [];
    const have = count(ids);
    return this.recipes.filter((r) => {
      const need = count(Crafting.expand(r));
      return Object.entries(have).every(([id, n]) => (need[id] ?? 0) >= n) && Crafting.key(Crafting.expand(r)) !== Crafting.key(ids);
    });
  }

  /**
   * Consome os ingredientes do `state` (PlayerState: hasItem/removeItem/addItem)
   * e entrega o resultado. Ferramentas ficam.
   * @returns {{ ok: boolean, out?: Record<string, number>, message: string }}
   */
  apply(recipe, state) {
    for (const [id, n] of Object.entries(recipe.in)) if ((state.inventory.get(id) ?? 0) < n) return { ok: false, message: `Falta ${id}.` };
    for (const t of recipe.tools ?? []) if (!state.hasItem(t)) return { ok: false, message: `Precisa de ${t}.` };
    for (const [id, n] of Object.entries(recipe.in)) state.removeItem(id, n);
    for (const [id, n] of Object.entries(recipe.out)) state.addItem(id, n);
    return { ok: true, out: recipe.out, message: 'Criado.' };
  }
}

function count(ids) {
  const c = {};
  for (const id of ids) c[id] = (c[id] ?? 0) + 1;
  return c;
}
