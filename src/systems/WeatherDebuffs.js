/**
 * Debuffs climáticos no personagem (lógica pura, testável em Node).
 * Entrada: intensidade efetiva de cada clima no jogador (peso do bioma ×
 * nível sorteado × abrigo). Saída: multiplicadores e danos do quadro.
 */

/**
 * @param {Array<{ debuff: string|null, intensity: number }>} climates um por bioma
 * @param {Record<string, object>} defs DEBUFFS
 * @param {{ threshold: number }} rules DEBUFF_RULES
 * @param {{ nearFire?: boolean }} [ctx]
 * @returns {{ speed: number, jump: number, dps: number, exposure: number,
 *            active: Array<{ id: string, name: string, icon: string, description: string, strength: number }>,
 *            warmed: boolean }}
 * @example computeDebuffs([{ debuff: 'areia', intensity: 1 }], DEBUFFS, DEBUFF_RULES)
 */
export function computeDebuffs(climates, defs, rules, { nearFire = false } = {}) {
  const out = { speed: 1, jump: 1, dps: 0, exposure: 0, active: [], warmed: false };
  for (const c of climates) {
    const def = c.debuff && defs[c.debuff];
    if (!def || c.intensity < rules.threshold) continue;
    if (def.fireCancels && nearFire) { out.warmed = true; continue; }
    // 0 no limiar → 1 na tempestade cheia
    const s = Math.min(1, (c.intensity - rules.threshold) / (1 - rules.threshold));
    if (s <= 0) continue;
    out.speed *= 1 + ((def.speed ?? 1) - 1) * s;
    out.jump *= 1 + ((def.jump ?? 1) - 1) * s;
    out.dps += (def.dps ?? 0) * s;
    out.exposure += (def.exposure ?? 0) * s;
    out.active.push({ id: c.debuff, name: def.name, icon: def.icon, description: def.description, strength: s });
  }
  return out;
}
