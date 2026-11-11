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
    c.cells = [];
    this.all.push(c);
    // Folga de 1 m na grade: um corpo com centro na célula vizinha ainda
    // encosta neste colisor (antes, perto da borda da célula, ele sumia).
    minX -= 1; minZ -= 1; maxX += 1; maxZ += 1;
    const i0 = Math.floor(minX / this.cell), i1 = Math.floor(maxX / this.cell);
    const j0 = Math.floor(minZ / this.cell), j1 = Math.floor(maxZ / this.cell);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.key(i, j);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
        c.cells.push(k);
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

  /**
   * Tira um colisor do mundo (móveis dos interiores, que vêm e vão).
   * @param {object} c o retorno de addCircle/addBox/addWall
   */
  remove(c) {
    for (const k of c.cells ?? []) {
      const list = this.grid.get(k);
      const i = list?.indexOf(c) ?? -1;
      if (i >= 0) list.splice(i, 1);
    }
    const j = this.all.indexOf(c);
    if (j >= 0) this.all.splice(j, 1);
    c.enabled = false;
  }

  /**
   * Limita um colisor a uma faixa de altura (m). Sem faixa = parede infinita
   * (como sempre foi). Com faixa, quem passa por baixo ou por cima não bate —
   * ex.: a cabana numa plataforma a 12 m não bloqueia quem anda no chão.
   * @example world.setHeightRange(world.addCircle(x, z, 3, 'hut'), 12, 15)
   */
  setHeightRange(c, y0, y1) {
    c.y0 = y0;
    c.y1 = y1;
    return c;
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

  /**
   * Anda (dx, dz) colidindo em sub-passos de no máximo `fraction × radius`:
   * correndo ou em viagem rápida o corpo não "pula" um poste ou cerca fina
   * num único quadro (tunneling).
   * @param {{x:number, y:number, z:number}} pos pés (alterado no lugar)
   * @param {number} dx deslocamento do quadro em X
   * @param {number} dz deslocamento do quadro em Z
   * @param {number} radius raio do corpo
   * @param {{fraction:number, maxSteps:number}} cfg MOVE_SUBSTEP
   * @returns {number} sub-passos usados
   */
  move(pos, dx, dz, radius, cfg) {
    const dist = Math.hypot(dx, dz);
    const steps = Math.min(cfg.maxSteps, Math.max(1, Math.ceil(dist / (radius * cfg.fraction))));
    const sx = dx / steps, sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      pos.x += sx;
      pos.z += sz;
      this.resolve(pos, radius);
    }
    return steps;
  }

  /** Empurra `pos` (Vector3) para fora de qualquer colisor. */
  resolve(pos, radius) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.query(pos.x, pos.z)) {
        if (!c.enabled) continue;
        // Faixa de altura: o corpo (pé até ~1,7 m) precisa cruzar a faixa.
        if (c.y0 !== undefined && (pos.y + 1.7 < c.y0 || pos.y > c.y1 - 0.25)) continue;
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
