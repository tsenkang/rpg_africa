/**
 * Recuo da câmera de 3ª pessoa dentro de um cômodo (lógica pura, testável em Node).
 *
 * Em vez de prender cada eixo da câmera separadamente (o que entorta o ângulo
 * e faz a câmera "pular"), anda pela linha foco → câmera e para no primeiro
 * obstáculo: parede interna, chão, teto ou divisória. O vão da porta (frente,
 * +Z local) deixa passar: com o jogador perto da porta, a câmera sai por ela.
 *
 * Coordenadas LOCAIS da casa (mesma convenção de `InteriorLayout`): x de −hw a
 * +hw, z de −hd a +hd, porta no meio da parede da frente (z = +hd).
 *
 * @example
 * const room = { hw: 3, hd: 2.5, y0: 0, y1: 2.6, doorW: 1.1, doorH: 2.1, partitions: [] };
 * cameraReach(room, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 3, z: -6 }, 0.25); // ≈ 0.38
 */

/**
 * Fração (0..1) do caminho foco `a` → câmera `b` que a câmera pode percorrer
 * sem atravessar o cômodo.
 * @param {{hw:number, hd:number, y0:number, y1:number, doorW?:number, doorH?:number,
 *          partitions?: {ax:number, az:number, bx:number, bz:number}[]}} room
 *   hw/hd = meias medidas INTERNAS; y0/y1 = piso/teto do andar; doorH = altura do vão acima do piso
 * @param {{x:number, y:number, z:number}} a foco (cabeça do jogador), local
 * @param {{x:number, y:number, z:number}} b posição desejada da câmera, local
 * @param {number} margin folga até paredes/teto (m) — o plano near não corta a parede
 * @returns {number} 1 = livre
 */
export function cameraReach(room, a, b, margin) {
  const x0 = -room.hw + margin, x1 = room.hw - margin;
  const z0 = -room.hd + margin, z1 = room.hd - margin;
  // Foco fora da área útil (na soleira da porta, dentro da parede): não confina.
  if (a.x < x0 || a.x > x1 || a.z < z0 || a.z > z1) return 1;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  let t = 1;
  let face = null;
  const slab = (p, d, lo, hi, name) => {
    if (d > 0 && p + d > hi) { const s = (hi - p) / d; if (s < t) { t = s; face = name + '+'; } }
    else if (d < 0 && p + d < lo) { const s = (lo - p) / d; if (s < t) { t = s; face = name + '-'; } }
  };
  slab(a.x, dx, x0, x1, 'x');
  slab(a.z, dz, z0, z1, 'z');
  // Piso/teto: só se o foco está entre eles (cabana baixa: o foco pode passar do teto).
  const yLo = room.y0 + 0.3, yHi = room.y1 - 0.15;
  if (a.y >= yLo && a.y <= yHi) slab(a.y, dy, yLo, yHi, 'y');

  // Saindo pela frente bem no vão da porta: a câmera pode ir para fora.
  if (face === 'z+' && room.doorW) {
    const hx = a.x + dx * t, hy = a.y + dy * t;
    const doorTop = room.y0 + (room.doorH ?? 2.0) - 0.1;
    if (Math.abs(hx) < room.doorW / 2 - 0.12 && hy < doorTop) {
      // Refaz sem a parede da frente (as outras faces e o teto continuam valendo).
      t = 1;
      face = null;
      slab(a.x, dx, x0, x1, 'x');
      if (dz < 0) slab(a.z, dz, z0, z1, 'z');
      if (a.y >= yLo && a.y <= yHi) slab(a.y, dy, yLo, yHi, 'y');
    }
  }

  // Divisórias: interseção 2D do caminho com cada segmento.
  const len = Math.hypot(dx, dz);
  if (len > 1e-6) {
    for (const p of room.partitions ?? []) {
      const ex = p.bx - p.ax, ez = p.bz - p.az;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue; // paralelo
      const wx = p.ax - a.x, wz = p.az - a.z;
      const s = (wx * ez - wz * ex) / den; // ao longo do caminho
      const u = (wx * dz - wz * dx) / den; // ao longo da divisória
      if (u < 0 || u > 1 || s <= 0 || s >= t) continue;
      // Para antes da divisória, medido na perpendicular (não só ao longo do raio).
      const sin = Math.abs(den) / (len * Math.hypot(ex, ez));
      t = Math.max(0, s - margin / (len * Math.max(sin, 0.2)));
    }
  }
  return Math.max(0, Math.min(1, t));
}
