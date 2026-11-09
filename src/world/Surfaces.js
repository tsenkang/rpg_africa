/**
 * Superfícies andáveis acima do terreno: plataformas das casas nas árvores,
 * pontes de corda, degraus de escada em caracol, varandas de palafita e
 * trapiches. Puro (sem Three.js), consultado por `Game.groundHeight`.
 *
 * Diferente do terreno, uma superfície só conta como chão se o pé estiver
 * perto dela por cima: `heightAt(x, z, feetY)` aceita superfícies até
 * `step` metros ACIMA do pé (degrau que se sobe sozinho) — então dá para
 * subir a escada degrau a degrau e andar POR BAIXO de uma plataforma.
 *
 * Tipos:
 *   disc     { x, z, r, y }                         plataforma redonda
 *   segment  { ax, az, bx, bz, width, y0, y1 }      ponte / trapiche / rampa (y varia de a até b)
 *   box      { x, z, hw, hd, rot, y }               degrau / assoalho retangular
 *
 * @example
 * const s = new Surfaces();
 * s.addDisc({ x: 0, z: 0, r: 4.6, y: 12 });
 * s.heightAt(1, 1, 11.8) // 12 (sobe na plataforma)
 * s.heightAt(1, 1, 0)    // -Infinity (está embaixo dela)
 */
export class Surfaces {
  /** @param {{ cell?: number, step?: number }} [o] */
  constructor({ cell = 8, step = 0.6 } = {}) {
    this.cell = cell;
    this.step = step;
    this.grid = new Map();
    this.all = [];
  }

  key(i, j) { return i * 73856093 ^ j * 19349663; }

  insert(s, x0, z0, x1, z1) {
    this.all.push(s);
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const k = this.key(i, j);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(s);
      }
    }
    return s;
  }

  addDisc({ x, z, r, y }) {
    return this.insert({ type: 'disc', x, z, r, y }, x - r, z - r, x + r, z + r);
  }

  addSegment({ ax, az, bx, bz, width, y0, y1 = y0 }) {
    const m = width / 2;
    return this.insert({ type: 'segment', ax, az, bx, bz, width, y0, y1 },
      Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m);
  }

  addBox({ x, z, hw, hd, rot = 0, y }) {
    const m = Math.hypot(hw, hd);
    return this.insert({ type: 'box', x, z, hw, hd, cos: Math.cos(rot), sin: Math.sin(rot), y }, x - m, z - m, x + m, z + m);
  }

  /** Altura da superfície `s` em (x, z), ou null se o ponto está fora dela. */
  static surfaceY(s, x, z) {
    if (s.type === 'disc') return (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r ? s.y : null;
    if (s.type === 'segment') {
      const abx = s.bx - s.ax, abz = s.bz - s.az;
      const len2 = abx * abx + abz * abz || 1;
      const t = ((x - s.ax) * abx + (z - s.az) * abz) / len2;
      if (t < 0 || t > 1) return null;
      if (Math.hypot(s.ax + abx * t - x, s.az + abz * t - z) > s.width / 2) return null;
      return s.y0 + (s.y1 - s.y0) * t;
    }
    // box — mesma convenção de rotação Y do Three.js / CollisionWorld
    const dx = x - s.x, dz = z - s.z;
    const lx = dx * s.cos - dz * s.sin, lz = dx * s.sin + dz * s.cos;
    return Math.abs(lx) <= s.hw && Math.abs(lz) <= s.hd ? s.y : null;
  }

  /**
   * Superfície mais alta sob (x, z) que o pé alcança.
   * @param {number} x
   * @param {number} z
   * @param {number} [feetY] altura do pé; Infinity = a mais alta (chuva, NPCs)
   * @returns {number} -Infinity se não há nenhuma
   */
  heightAt(x, z, feetY = Infinity) {
    const list = this.grid.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!list) return -Infinity;
    let best = -Infinity;
    const limit = feetY + this.step;
    for (const s of list) {
      const y = Surfaces.surfaceY(s, x, z);
      if (y !== null && y <= limit && y > best) best = y;
    }
    return best;
  }
}
