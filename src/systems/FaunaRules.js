/**
 * Regras puras do spawner de fauna (testáveis sem Three.js).
 *
 * @example
 *   const id = pickWeighted(BIOME_FAUNA.savana, Math.random()); // 'zebra' | 'leao'
 *   const n = groupSize(SPECIES.hiena.group, Math.random());     // 3..5
 */

/**
 * Sorteio por peso.
 * @param {Record<string, number>} table ex.: { zebra: 3, leao: 1 }
 * @param {number} roll em [0, 1)
 * @returns {string|null} chave sorteada (null se a tabela estiver vazia)
 */
export function pickWeighted(table, roll) {
  const entries = Object.entries(table ?? {}).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let r = roll * total;
  for (const [k, w] of entries) {
    if (r < w) return k;
    r -= w;
  }
  return entries[entries.length - 1][0];
}

/**
 * Tabela de sorteio só com quem pode nascer ali: na água só os aquáticos
 * (jacaré); em terra, todos menos os aquáticos.
 * @param {Record<string, number>} table BIOME_FAUNA[bioma]
 * @param {Record<string, object>} species SPECIES
 * @param {boolean} inWater o ponto é água
 * @returns {Record<string, number>}
 */
export function spawnTable(table, species, inWater) {
  const out = {};
  for (const [id, w] of Object.entries(table ?? {})) if (!!species[id]?.aquatic === inWater) out[id] = w;
  return out;
}

/** Tamanho do grupo em [min, max] (inteiro). */
export function groupSize([min, max], roll) {
  return min + Math.min(max - min, Math.floor(roll * (max - min + 1)));
}
