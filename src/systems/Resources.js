import { RESOURCES } from '../config/resources.js';
import { mulberry32 } from '../world/Noise.js';

/**
 * Nós de recurso (regra pura): gera deterministicamente, por célula, os
 * recursos coletáveis em volta do jogador, respeitando o bioma e o que
 * está bloqueado (vilas, água, construções). Colher esconde o nó por
 * `respawnSeconds`.
 *
 * @example
 * const res = new Resources({ seed, biomeAt: (x, z) => 'savana', groundAt, isBlocked, waterLevel });
 * res.update(player.position, time);                // carrega/descarrega células
 * const node = res.nearest(player.position, time);  // nó colhível ao alcance
 * const got = res.harvest(node, time, Math.random); // { item, n, also, dirt }
 */
export class Resources {
  /**
   * @param {{ seed: number, biomeAt: (x:number, z:number) => string, groundAt: (x:number, z:number) => number,
   *   isBlocked?: (x:number, z:number) => boolean, waterLevel?: number, cfg?: typeof RESOURCES }} o
   */
  constructor({ seed = 1, biomeAt, groundAt, isBlocked = () => false, waterLevel = -Infinity, cfg = RESOURCES }) {
    this.seed = seed;
    this.biomeAt = biomeAt;
    this.groundAt = groundAt;
    this.isBlocked = isBlocked;
    this.waterLevel = waterLevel;
    this.cfg = cfg;
    this.cells = new Map(); // "i,j" → nós
    this.taken = new Map(); // id → tempo da colheita
    /** Muda sempre que o conjunto visível muda (o render reconstrói). */
    this.version = 0;
    this._lastCell = null;
  }

  /** Nós de uma célula (gera na primeira vez). */
  cell(i, j) {
    const key = `${i},${j}`;
    let list = this.cells.get(key);
    if (list) return list;
    list = [];
    const c = this.cfg, rng = mulberry32((i * 73856093) ^ (j * 19349663) ^ (this.seed * 83492791));
    const types = Object.entries(c.types);
    for (let k = 0; k < c.perCell; k++) {
      const x = (i + rng()) * c.cell, z = (j + rng()) * c.cell;
      const y = this.groundAt(x, z);
      if (y < this.waterLevel + 0.15 || this.isBlocked(x, z)) continue;
      const biome = this.biomeAt(x, z);
      const nearWater = y < this.waterLevel + 1.4;
      const pool = types.filter(([, t]) => (t.biomes === 'all' || t.biomes.includes(biome)) && (!t.water || nearWater));
      if (!pool.length) continue;
      let total = 0;
      for (const [, t] of pool) total += t.weight;
      let r = rng() * total, type = pool[pool.length - 1][0];
      for (const [id, t] of pool) { r -= t.weight; if (r <= 0) { type = id; break; } }
      list.push({ id: `${key}:${k}`, type, x, y, z, rot: rng() * Math.PI * 2, scale: 0.85 + rng() * 0.4 });
    }
    this.cells.set(key, list);
    return list;
  }

  /** Carrega as células no raio; descarrega as de longe. */
  update(pos, time) {
    const c = this.cfg, n = Math.ceil(c.radius / c.cell);
    const ci = Math.floor(pos.x / c.cell), cj = Math.floor(pos.z / c.cell);
    const key = `${ci},${cj}`;
    let changed = false;
    if (key !== this._lastCell) {
      this._lastCell = key;
      const keep = new Set();
      for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) { keep.add(`${i},${j}`); this.cell(i, j); }
      for (const k of this.cells.keys()) if (!keep.has(k)) this.cells.delete(k);
      changed = true;
    }
    // Renascimento dos colhidos.
    for (const [id, t] of this.taken) if (time - t >= c.respawnSeconds) { this.taken.delete(id); changed = true; }
    if (changed) this.version++;
  }

  /** Nós visíveis (carregados e não colhidos). */
  visible() {
    const out = [];
    for (const list of this.cells.values()) for (const n of list) if (!this.taken.has(n.id)) out.push(n);
    return out;
  }

  /** Nó colhível mais perto de `pos` (dentro de `reach`), ou null. */
  nearest(pos, reach = this.cfg.reach) {
    let best = null, bd = reach;
    for (const list of this.cells.values()) {
      for (const n of list) {
        if (this.taken.has(n.id)) continue;
        const d = Math.hypot(n.x - pos.x, n.z - pos.z);
        if (d < bd) { bd = d; best = n; }
      }
    }
    return best;
  }

  /**
   * Colhe o nó.
   * @returns {{ item: string, n: number, also: string|null, dirt: number, label: string }}
   */
  harvest(node, time, rng = Math.random) {
    const t = this.cfg.types[node.type];
    this.taken.set(node.id, time);
    this.version++;
    const n = t.n[0] + Math.floor(rng() * (t.n[1] - t.n[0] + 1));
    return { item: t.item, n, also: t.also ?? null, dirt: t.dirt ?? 0, label: t.label };
  }
}
