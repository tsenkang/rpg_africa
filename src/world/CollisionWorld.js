/**
 * Colisão 2D (plano XZ) simples e rápida, com grade espacial.
 * Suporta círculos (troncos, poços, torres) e caixas orientadas
 * (paredes, casas, muralhas). O jogador é tratado como um círculo.
 */
export class CollisionWorld {
  constructor(cellSize = 24) {
    this.cell = cellSize;
    this.grid = new Map();
    this.all = [];
  }

  key(i, j) {
    return i * 73856093 ^ j * 19349663;
  }

  insert(c, minX, minZ, maxX, maxZ) {
    c.enabled = true;
    this.all.push(c);
    const i0 = Math.floor(minX / this.cell), i1 = Math.floor(maxX / this.cell);
    const j0 = Math.floor(minZ / this.cell), j1 = Math.floor(maxZ / this.cell);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.key(i, j);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
      }
    }
    return c;
  }

  addCircle(x, z, r, tag) {
    return this.insert({ type: 'circle', x, z, r, tag }, x - r, z - r, x + r, z + r);
  }

  /** Caixa centrada em (x,z), meia-largura hw (eixo X local), meia-profundidade hd, rotação em Y. */
  addBox(x, z, hw, hd, rot = 0, tag) {
    const ext = Math.hypot(hw, hd);
    return this.insert(
      { type: 'box', x, z, hw, hd, cos: Math.cos(rot), sin: Math.sin(rot), tag },
      x - ext, z - ext, x + ext, z + ext,
    );
  }

  /** Parede entre dois pontos com espessura. */
  addWall(ax, az, bx, bz, thickness, tag) {
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(-(bz - az), bx - ax);
    return this.addBox((ax + bx) / 2, (az + bz) / 2, len / 2, thickness / 2, rot, tag);
  }

  query(x, z) {
    return this.grid.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) ?? [];
  }

  /** Há algum colisor ativo cobrindo o ponto (com folga `pad`)? */
  overlaps(x, z, pad = 0) {
    for (const c of this.query(x, z)) {
      if (!c.enabled) continue;
      if (c.type === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
      } else {
        const { lx, lz } = toLocal(c, x, z);
        if (Math.abs(lx) < c.hw + pad && Math.abs(lz) < c.hd + pad) return true;
      }
    }
    return false;
  }

  /** Empurra `pos` (Vector3) para fora de qualquer colisor. */
  resolve(pos, radius) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.query(pos.x, pos.z)) {
        if (!c.enabled) continue;
        if (c.type === 'circle') {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + radius;
          if (d < min && d > 1e-6) {
            pos.x = c.x + (dx / d) * min;
            pos.z = c.z + (dz / d) * min;
            moved = true;
          }
        } else {
          const { lx, lz } = toLocal(c, pos.x, pos.z);
          const cx = Math.max(-c.hw, Math.min(c.hw, lx));
          const cz = Math.max(-c.hd, Math.min(c.hd, lz));
          let nx = lx - cx, nz = lz - cz;
          const d = Math.hypot(nx, nz);
          let outX, outZ;
          if (d > 1e-6) {
            if (d >= radius) continue;
            outX = cx + (nx / d) * radius;
            outZ = cz + (nz / d) * radius;
          } else {
            // Centro dentro da caixa: sai pelo lado mais próximo.
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) { outX = Math.sign(lx || 1) * (c.hw + radius); outZ = lz; }
            else { outX = lx; outZ = Math.sign(lz || 1) * (c.hd + radius); }
          }
          // local → mundo
          pos.x = c.x + outX * c.cos + outZ * c.sin;
          pos.z = c.z - outX * c.sin + outZ * c.cos;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
}

function toLocal(c, x, z) {
  const dx = x - c.x, dz = z - c.z;
  // Rotação inversa (rotY): x' = x cos - z sin ; z' = x sin + z cos  (inversa abaixo)
  return { lx: dx * c.cos - dz * c.sin, lz: dx * c.sin + dz * c.cos };
}
