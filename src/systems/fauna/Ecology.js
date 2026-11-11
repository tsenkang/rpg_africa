import { ECOSYSTEM } from '../../config/ecosystem.js';

/**
 * Regras puras do ecossistema da fauna (sem Three.js, testáveis).
 *
 * - `buildDiet`: matriz da cadeia alimentar (quem come quem) a partir do
 *   nível trófico de cada espécie + dietas extras + espécies que nunca são presa.
 * - `SpatialGrid`: grade espacial (hash por célula) para achar vizinhos em O(1).
 * - `needsStep` / `wantsToHunt`: fome e energia.
 * - `scorePrey`: qual presa escolher (perto, ferida, filhote, mancando).
 * - `statKillChance`: caçada resolvida por estatística (longe do jogador).
 *
 * @example
 *   const diet = buildDiet(ECOSYSTEM);
 *   diet.get('leao').has('zebra'); // true
 */

/**
 * @param {typeof ECOSYSTEM} cfg
 * @returns {Map<string, Set<string>>} predador → presas possíveis
 */
export function buildDiet(cfg = ECOSYSTEM) {
  const out = new Map();
  const never = new Set(cfg.neverPrey ?? []);
  for (const [id, lvl] of Object.entries(cfg.levels)) {
    const set = new Set();
    const eatsLevels = cfg.eats[lvl] ?? [];
    for (const [prey, pl] of Object.entries(cfg.levels)) {
      if (prey === id || never.has(prey)) continue;
      if (eatsLevels.includes(pl)) set.add(prey);
    }
    for (const prey of cfg.extraDiet?.[id] ?? []) if (prey !== id) set.add(prey);
    out.set(id, set);
  }
  return out;
}

/**
 * Grade espacial uniforme: refeita a cada tique de IA (O(n)), consulta só as
 * células que o círculo toca. Objetos precisam de `position: {x, z}`.
 * @example
 *   grid.rebuild(animais); const perto = grid.query(x, z, 30, []);
 */
export class SpatialGrid {
  constructor(cell) {
    this.cell = cell;
    /** @type {Map<number, object[]>} */
    this.cells = new Map();
  }

  key(i, j) {
    return (i + 32768) * 65536 + (j + 32768);
  }

  rebuild(items) {
    for (const list of this.cells.values()) list.length = 0;
    for (const it of items) {
      const k = this.key(Math.floor(it.position.x / this.cell), Math.floor(it.position.z / this.cell));
      let list = this.cells.get(k);
      if (!list) { list = []; this.cells.set(k, list); }
      list.push(it);
    }
  }

  /** Itens a até `r` m de (x, z), acrescentados em `out`. */
  query(x, z, r, out) {
    const c = this.cell, r2 = r * r;
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c);
    const j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (const it of list) {
          const dx = it.position.x - x, dz = it.position.z - z;
          if (dx * dx + dz * dz <= r2) out.push(it);
        }
      }
    }
    return out;
  }
}

/**
 * Fome sobe com o tempo (pelo nível trófico); energia cai correndo e volta parado.
 * @param {{ hunger: number, energy: number }} n (alterado)
 * @param {{ running: boolean, level: number }} o
 */
export function needsStep(n, dt, { running, level }, cfg = ECOSYSTEM) {
  n.hunger = Math.min(1, n.hunger + (cfg.hunger.rate[level] ?? 0) * dt);
  n.energy = running ? Math.max(0, n.energy - cfg.energy.runDrain * dt) : Math.min(1, n.energy + cfg.energy.restGain * dt);
  return n;
}

/** Predador só caça com fome acima do limite e fôlego para correr. */
export function wantsToHunt(n, cfg = ECOSYSTEM) {
  return n.hunger > cfg.hunger.huntAbove && n.energy >= cfg.hunger.minEnergy;
}

/**
 * Custo de uma presa (menor = melhor): distância, pesada pela fraqueza.
 * @param {number} dist m
 * @param {{ health: number, young: boolean, limping: boolean }} p `health` 0..1
 */
export function scorePrey(dist, { health, young, limping }) {
  return dist * (0.5 + 0.5 * health) * (young ? 0.6 : 1) * (limping ? 0.6 : 1);
}

/**
 * Chance de a caçada terminar em abate neste passo, sem simular a perseguição
 * (fora do raio de detalhe). Cresce com a vantagem de velocidade (ao quadrado)
 * e com o tamanho do bando (raiz).
 * @param {{ run: number, pack: number }} pred
 * @param {{ run: number }} prey
 */
export function statKillChance(pred, prey, dt, cfg = ECOSYSTEM) {
  const ratio = pred.run / Math.max(0.1, prey.run);
  const rate = cfg.stat.baseRate * ratio * ratio * Math.sqrt(Math.max(1, pred.pack));
  return 1 - Math.exp(-rate * dt);
}
