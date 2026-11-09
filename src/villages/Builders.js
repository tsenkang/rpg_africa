import * as THREE from 'three';
import { mulberry32 } from '../world/Noise.js';
import { BUILDING_SCALE } from '../config/settlements.js';

/**
 * Peças de construção reutilizáveis, todas em metros reais.
 * Porta: 1,0 x 2,1 m (fixa) · pé-direito: ≥ 3,4 m (BUILDING_SCALE) · casas: 5-10 m.
 *
 * Cada função recebe `ctx`:
 *   ctx.batch      StaticBatcher (geometria estática)
 *   ctx.dynamic    THREE.Group (objetos animados / instanciados)
 *   ctx.collisions CollisionWorld
 *   ctx.terrain    Terrain (heightAt)
 *   ctx.M          materiais
 *   ctx.rnd        aleatório determinístico
 *
 * Convenção: rot = rotação em Y; a "frente" de cada prédio é o +Z local.
 */

// ---------- geometrias base (compartilhadas) ----------
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 16),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  pyramid: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  sphere: new THREE.SphereGeometry(1, 12, 8),
  disc: new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
  face: new THREE.CircleGeometry(1, 32),
  roofSlopes: makeRoofSlopes(),
  gables: makeGables(),
  rock: new THREE.IcosahedronGeometry(1, 0),
  halfCyl: new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI),
  hull: new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  torus: new THREE.TorusGeometry(1, 0.12, 6, 16),
};

/** Duas águas do telhado: cumeeira ao longo do X, base 1x1, altura 1. */
function makeRoofSlopes() {
  const p = [
    // água sul (+Z)
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0,
    -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    // água norte (-Z)
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

function makeGables() {
  const p = [
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- utilidades ----------
/** Converte coordenada local (lx, lz) de um prédio em mundo. */
export function local(x, z, rot, lx, lz) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}

/** Menor altura do terreno sob um retângulo (para a fundação não flutuar). */
export function groundUnder(ctx, x, z, rot, hw, hd) {
  let min = Infinity;
  for (const [a, b] of [[0, 0], [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
    const p = local(x, z, rot, a, b);
    min = Math.min(min, ctx.terrain.heightAt(p.x, p.z));
  }
  return min;
}

/** Atalho: peça em coordenadas locais do prédio. */
export function part(ctx, geo, mat, x, z, rot, y0, { lx = 0, ly = 0, lz = 0, w = 1, h = 1, d = 1, rx = 0, ry = 0, rz = 0 }) {
  const p = local(x, z, rot, lx, lz);
  ctx.batch.add(geo, mat, { x: p.x, y: y0 + ly, z: p.z, rx, ry: rot + ry, rz, sx: w, sy: h, sz: d });
}

// ---------- casas ----------
/** Semente estável a partir da posição (varia cada casa sem mexer no aleatório da vila). */
export function siteSeed(x, z) {
  return (Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663)) >>> 0;
}

/**
 * Geometria de uma água de telhado de duas águas (pura, testável).
 * A cumeeira fica `rh` acima do topo da parede; o beiral passa `over` da parede.
 * @param {number} d profundidade da casa (m)
 * @param {number} rh altura da cumeeira acima da parede (m)
 * @param {number} over beiral (m)
 * @returns {{ angle: number, length: number, eaveDrop: number, run: number }}
 *   angle = inclinação (rad); length = comprimento da água; eaveDrop = quanto o
 *   beiral fica abaixo do topo da parede; run = distância horizontal cumeeira→beiral.
 * @example roofSlope(6, 3, 0) // { angle: π/4, length: 4.24, eaveDrop: 0, run: 3 }
 */
export function roofSlope(d, rh, over) {
  const run = d / 2 + over;
  const k = rh / (d / 2);
  return { angle: Math.atan(k), length: Math.hypot(run, run * k), eaveDrop: k * over, run };
}

/**
 * Casa retangular de adobe/tijolo: rodapé de pedra, cunhais e cinta de
 * madeira, porta com batente e degrau, janelas com moldura, peitoril e
 * venezianas, telhado com espessura e beiral; conforme a posição, ganha
 * varanda, chaminé, potes e lenha.
 * roof: 'tile' | 'tin' | 'thatch' | 'flat' (laje sudanesa com vigas aparentes)
 * @example house(ctx, { x: 10, z: 4, rot: 0, w: 8, d: 6, roof: 'tile' })
 */
/**
 * Altura de parede final (m): a pedida pela vila × `wallHeightMul`, com
 * mínimo `minWallHeight`. Portas/janelas não mudam — só o pé-direito.
 * @param {number} h altura pedida
 * @param {number} [min] mínimo
 * @example wallHeight(2.6) // 3.4
 */
export function wallHeight(h, min = BUILDING_SCALE.minWallHeight) {
  return Math.max(min, h * BUILDING_SCALE.wallHeightMul);
}

export function house(ctx, { x, z, rot = 0, w = 7, d = 5.5, h = 3, wall, roof = 'tile', roofMat, collide = true }) {
  const { M } = ctx;
  h = wallHeight(h);
  wall ??= M.adobeOchre;
  const r = mulberry32(siteSeed(x, z));
  const y0 = groundUnder(ctx, x, z, rot, w / 2, d / 2) - 0.25;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  const base = 0.25; // piso acima de y0
  const paints = [M.paintBlue, M.paintGreen, M.paintRed, M.paintOchre, M.woodDark];
  const paint = paints[Math.floor(r() * paints.length)];
  const trim = r() < 0.5 ? M.woodDark : M.wood;
  const sahel = roof === 'flat';

  // Corpo, rodapé saliente com capa de pedra.
  P(G.box, wall, { ly: (h + base) / 2, w, h: h + base, d });
  P(G.box, M.stoneDark, { ly: 0.32, w: w + 0.16, h: 0.64, d: d + 0.16 });
  P(G.box, M.stone, { ly: 0.66, w: w + 0.2, h: 0.06, d: d + 0.2 });
  if (!sahel) {
    // Cunhais e cinta de madeira no alto das paredes.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P(G.box, trim, { lx: sx * (w / 2 - 0.06), lz: sz * (d / 2 - 0.06), ly: 0.7 + (base + h - 0.7) / 2, w: 0.24, h: base + h - 0.7, d: 0.24 });
    }
    P(G.box, trim, { ly: base + h - 0.12, w: w + 0.1, h: 0.24, d: d + 0.1 });
  } else {
    // Sahel: contrafortes arredondados nos cantos, com pináculos.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P(G.cyl, wall, { lx: sx * w / 2, lz: sz * d / 2, ly: (h + base + 0.9) / 2, w: 0.38, h: h + base + 0.9, d: 0.38 });
      P(G.cone8, wall, { lx: sx * w / 2, lz: sz * d / 2, ly: h + base + 1.1, w: 0.3, h: 0.5, d: 0.3 });
    }
  }

  // Porta pintada com batentes, verga, maçaneta e degrau.
  const doorW = 1.0, doorH = 2.1;
  P(G.box, paint, { lz: d / 2 + 0.03, ly: base + doorH / 2, w: doorW, h: doorH, d: 0.06 });
  for (let i = -1; i <= 1; i += 2) P(G.box, paint, { lx: i * 0.22, lz: d / 2 + 0.065, ly: base + doorH / 2, w: 0.08, h: doorH - 0.2, d: 0.02 });
  P(G.sphere, M.iron, { lx: 0.36, lz: d / 2 + 0.1, ly: base + 1.0, w: 0.04, h: 0.04, d: 0.04 });
  for (const s of [-1, 1]) P(G.box, trim, { lx: s * (doorW / 2 + 0.07), lz: d / 2 + 0.05, ly: base + doorH / 2, w: 0.14, h: doorH, d: 0.12 });
  P(G.box, trim, { lz: d / 2 + 0.06, ly: base + doorH + 0.09, w: doorW + 0.5, h: 0.18, d: 0.16 });
  P(G.box, M.stone, { lz: d / 2 + 0.35, ly: 0.12, w: doorW + 0.6, h: 0.24, d: 0.6 });

  // Janela: vidro, moldura em cruz, verga, peitoril e venezianas abertas.
  const wy = base + 1.55;
  const win = (lx, lz, face) => {
    const c = Math.cos(face), s = Math.sin(face);
    const o = (ox, oz, rest) => ({ lx: lx + ox * c + oz * s, lz: lz - ox * s + oz * c, ry: face, ...rest });
    P(G.box, M.glass, o(0, 0.01, { ly: wy, w: 0.8, h: 0.95, d: 0.02 }));
    P(G.box, trim, o(0, 0.03, { ly: wy, w: 0.05, h: 0.9, d: 0.04 }));
    P(G.box, trim, o(0, 0.03, { ly: wy, w: 0.78, h: 0.05, d: 0.04 }));
    for (const k of [-1, 1]) P(G.box, trim, o(k * 0.46, 0.04, { ly: wy, w: 0.1, h: 1.1, d: 0.1 }));
    P(G.box, trim, o(0, 0.05, { ly: wy + 0.56, w: 1.06, h: 0.12, d: 0.12 }));
    P(G.box, M.stoneLight, o(0, 0.09, { ly: wy - 0.53, w: 1.1, h: 0.08, d: 0.22 }));
    if (!sahel) {
      for (const k of [-1, 1]) P(G.box, paint, o(k * 0.78, 0.16, { ly: wy, w: 0.42, h: 0.98, d: 0.04, ry: face - k * 0.5 }));
    }
  };
  if (w > 5.5) for (const s of [-1, 1]) win(s * w * 0.3, d / 2 + 0.02, 0);
  if (d > 4.5) for (const s of [-1, 1]) win(s * (w / 2 + 0.02), 0, s * Math.PI / 2);
  if (w > 9) win(0, -d / 2 - 0.02, Math.PI);

  const top = y0 + base + h;
  if (roof === 'tile' || roof === 'thatch') {
    const isTile = roof === 'tile';
    const mat = roofMat ?? (isTile ? M.tilesRed : M.thatch);
    const rh = isTile ? d * 0.36 : d * 0.55;
    const over = isTile ? 0.55 : 0.8;
    const thick = isTile ? 0.16 : 0.42;
    const sl = roofSlope(d, rh, over);
    const len = w + over * 2;
    const midY = base + h + (rh - sl.eaveDrop) / 2;
    ctx.batch.add(G.gables, wall, { x, y: top, z, ry: rot, sx: w, sy: rh, sz: d });
    for (const s of [-1, 1]) {
      // Cada água é uma laje grossa inclinada, da cumeeira ao beiral.
      P(G.box, mat, { lz: s * sl.run / 2, ly: midY + thick / 2, w: len, h: thick, d: sl.length + 0.12, rx: s * sl.angle });
      if (isTile) {
        // Testeira de madeira no beiral.
        P(G.box, trim, { lz: s * (sl.run - 0.03), ly: base + h - sl.eaveDrop - 0.02, w: len, h: 0.22, d: 0.06 });
      } else {
        // Franja de palha mais grossa no beiral.
        P(G.box, mat, { lz: s * (sl.run - 0.3), ly: base + h - sl.eaveDrop + 0.18, w: len + 0.12, h: 0.6, d: 0.75, rx: s * sl.angle });
      }
    }
    if (isTile) {
      // Tábuas de empena acompanhando a inclinação + cumeeira de meia-cana.
      for (const sx of [-1, 1]) for (const s of [-1, 1]) {
        P(G.box, trim, { lx: sx * (len / 2 - 0.04), lz: s * sl.run / 2, ly: midY + 0.08, w: 0.08, h: 0.26, d: sl.length, rx: s * sl.angle });
      }
      P(G.halfCyl, mat, { ly: base + h + rh + thick, w: 0.2, h: len + 0.1, d: 0.2, rz: Math.PI / 2 });
      if (r() < 0.5) {
        const cx = (r() - 0.5) * w * 0.6;
        P(G.box, M.stone, { lx: cx, lz: -d * 0.22, ly: base + h + rh * 0.75, w: 0.6, h: rh + 0.9, d: 0.6 });
        P(G.box, M.stoneDark, { lx: cx, lz: -d * 0.22, ly: base + h + rh * 1.25 + 0.5, w: 0.75, h: 0.12, d: 0.75 });
      }
    } else {
      // Rolo de palha na cumeeira, amarrado nas pontas.
      P(G.cyl, mat, { ly: base + h + rh + thick * 0.6, w: 0.36, h: len - 0.2, d: 0.3, rz: Math.PI / 2 });
      for (const sx of [-1, 1]) P(G.cyl6, M.woodDark, { lx: sx * (len / 2 - 0.35), ly: base + h + rh + 0.65, w: 0.06, h: 0.8, d: 0.06, rz: sx * 0.5 });
    }
  } else if (roof === 'tin') {
    ctx.batch.add(G.box, roofMat ?? M.metalRoof, { x, y: top + 0.35, z, ry: rot, rx: 0.1, sx: w + 0.7, sy: 0.06, sz: d + 0.9 });
    // Caibros aparentes sob a chapa e pedras segurando o zinco.
    for (let i = -w / 2; i <= w / 2 + 0.01; i += w / 4) {
      P(G.box, M.wood, { lx: i, ly: base + h + 0.22, w: 0.1, h: 0.12, d: d + 0.8, rx: 0.1 });
    }
    for (let i = 0; i < 3; i++) {
      const lz = (r() - 0.5) * d * 0.6;
      P(G.rock, M.rubble, { lx: (r() - 0.5) * w * 0.8, lz, ly: base + h + 0.43 - lz * 0.1, w: 0.22, h: 0.15, d: 0.2 });
    }
  } else if (sahel) {
    P(G.box, wall, { ly: base + h + 0.3, w: w + 0.1, h: 0.6, d: d + 0.1 });
    for (let i = -w / 2 + 0.5; i < w / 2; i += 1.0) {
      P(G.cone8, wall, { lx: i, lz: d / 2, ly: base + h + 0.8, w: 0.2, h: 0.4, d: 0.2 });
    }
    // Vigas de madeira aparentes (torons), típicas da arquitetura do Sahel.
    for (let i = -w / 2 + 0.6; i < w / 2; i += 1.2) {
      P(G.cyl6, M.woodDark, { lx: i, lz: d / 2 + 0.25, ly: base + h - 0.15, w: 0.07, h: 0.6, d: 0.07, rx: Math.PI / 2 });
      P(G.cyl6, M.woodDark, { lx: i + 0.6, lz: d / 2 + 0.25, ly: base + h * 0.45, w: 0.07, h: 0.6, d: 0.07, rx: Math.PI / 2 });
    }
  }

  // Varanda com dois esteios e telhadinho (só em casas de telha).
  if (roof === 'tile' && w > 5.5 && r() < 0.5) {
    const pd = 1.8;
    for (const s of [-1, 1]) {
      P(G.cyl6, M.wood, { lx: s * 1.5, lz: d / 2 + pd, ly: base + 1.15, w: 0.1, h: 2.3, d: 0.1 });
      P(G.box, M.stone, { lx: s * 1.5, lz: d / 2 + pd, ly: 0.15, w: 0.3, h: 0.3, d: 0.3 });
    }
    P(G.box, M.wood, { lz: d / 2 + pd, ly: base + 2.3, w: 3.4, h: 0.14, d: 0.14 });
    P(G.box, roofMat ?? M.tilesBrown, { lz: d / 2 + pd / 2 + 0.1, ly: base + 2.55, w: 3.8, h: 0.08, d: pd + 0.7, rx: 0.22 });
    P(G.box, M.stone, { lz: d / 2 + pd / 2, ly: 0.12, w: 3.4, h: 0.24, d: pd + 0.2 });
  }

  // Potes de barro junto à porta e pilha de lenha na lateral.
  if (r() < 0.7) {
    const side = r() < 0.5 ? -1 : 1;
    P(G.sphere, M.pottery, { lx: side * 1.1, lz: d / 2 + 0.45, ly: 0.33, w: 0.28, h: 0.33, d: 0.28 });
    P(G.cyl, M.pottery, { lx: side * 1.1, lz: d / 2 + 0.45, ly: 0.68, w: 0.1, h: 0.12, d: 0.1 });
    if (r() < 0.6) P(G.sphere, M.pottery, { lx: side * 1.55, lz: d / 2 + 0.4, ly: 0.26, w: 0.2, h: 0.24, d: 0.2 });
  }
  if (r() < 0.4) {
    const side = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < 6; i++) {
      P(G.cyl6, M.log, { lx: side * (w / 2 + 0.3 + (i % 3) * 0.23), lz: -d / 2 + 1.1, ly: 0.36 + Math.floor(i / 3) * 0.2, w: 0.11, h: 1.4, d: 0.11, rx: Math.PI / 2 });
    }
  }

  if (collide) ctx.collisions.addBox(x, z, w / 2, d / 2, rot, 'house');
  return { y0, door: local(x, z, rot, 0, d / 2 + 1.2) };
}

/** Cabana redonda (rondavel) de barro: base de pedra, faixa pintada e teto de palha em camadas. */
export function rondavel(ctx, { x, z, r = 2.6, h = 2.4, wall, rot }) {
  const { M } = ctx;
  h = wallHeight(h, BUILDING_SCALE.minHutWall);
  wall ??= M.mudBrick;
  const y0 = ctx.terrain.heightAt(x, z) - 0.2;
  ctx.batch.add(G.cyl, wall, { x, y: y0 + h / 2, z, sx: r, sy: h, sz: r });
  ctx.batch.add(G.cyl, M.stoneDark, { x, y: y0 + 0.3, z, sx: r + 0.08, sy: 0.6, sz: r + 0.08 });
  ctx.batch.add(G.cyl, M.adobeWhite, { x, y: y0 + h * 0.66, z, sx: r + 0.012, sy: 0.24, sz: r + 0.012 });
  ctx.batch.add(G.cyl, M.adobeRed, { x, y: y0 + h * 0.66 - 0.2, z, sx: r + 0.01, sy: 0.12, sz: r + 0.01 });
  // Palha em três camadas sobrepostas + pináculo de madeira.
  ctx.batch.add(G.cone, M.thatch, { x, y: y0 + h + 0.5, z, sx: r + 0.85, sy: 1.6, sz: r + 0.85 });
  ctx.batch.add(G.cone, M.thatch, { x, y: y0 + h + 1.2, z, sx: r * 0.82, sy: 1.8, sz: r * 0.82 });
  ctx.batch.add(G.cone, M.thatch, { x, y: y0 + h + 1.95, z, sx: r * 0.44, sy: 1.3, sz: r * 0.44 });
  ctx.batch.add(G.cyl6, M.woodDark, { x, y: y0 + h + 2.75, z, sx: 0.05, sy: 0.7, sz: 0.05 });
  rot ??= ctx.rnd() * Math.PI * 2; // porta: de frente para a rua quando a vila passa `rot`
  const at = (lz) => local(x, z, rot, 0, lz);
  let p = at(r + 0.02);
  ctx.batch.add(G.box, M.woodDark, { x: p.x, y: y0 + 1.1, z: p.z, ry: rot, sx: 1.15, sy: 2.15, sz: 0.12 });
  p = at(r + 0.1);
  ctx.batch.add(G.box, M.darkOpening, { x: p.x, y: y0 + 1.05, z: p.z, ry: rot, sx: 0.85, sy: 1.95, sz: 0.04 });
  p = at(r + 0.3);
  ctx.batch.add(G.box, M.stone, { x: p.x, y: y0 + 0.2, z: p.z, ry: rot, sx: 1.2, sy: 0.2, sz: 0.5 });
  ctx.collisions.addCircle(x, z, r + 0.1, 'hut');
  return { y0, door: local(x, z, rot, 0, r + 1.2) };
}

/** Casa muito destruída: paredes quebradas, sem telhado, entulho. */
export function ruinedHouse(ctx, { x, z, rot = 0, w = 8, d = 6.5, h = 3.2, seed = 99 }) {
  const { M } = ctx;
  h = wallHeight(h);
  const rnd = mulberry32(seed); // seed muda o jeito que a casa desabou
  const y0 = groundUnder(ctx, x, z, rot, w / 2, d / 2) - 0.2;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  const wallT = 0.35;
  // Parede dos fundos quase inteira, laterais em pedaços, frente desabada.
  P(G.box, M.adobeRed, { lz: -d / 2, ly: h * 0.45, w, h: h * 0.9, d: wallT });
  P(G.box, M.adobeRed, { lx: -w / 2, lz: -d * 0.15, ly: h * 0.35, w: wallT, h: h * 0.7, d: d * 0.7 });
  P(G.box, M.adobeRed, { lx: w / 2, lz: -d * 0.3, ly: h * 0.25, w: wallT, h: h * 0.5, d: d * 0.4 });
  P(G.box, M.adobeRed, { lx: -w * 0.3, lz: d / 2, ly: h * 0.25, w: w * 0.4, h: h * 0.5, d: wallT });
  P(G.box, M.adobeRed, { lx: w * 0.35, lz: d / 2, ly: 0.5, w: w * 0.3, h: 1.0, d: wallT });
  // Vigas caídas e chapa de zinco tombada
  P(G.box, M.woodDark, { lx: 0.5, ly: 1.2, w: 0.2, h: 0.2, d: d * 1.1, rx: 0.35, rz: 0.2 });
  P(G.box, M.woodDark, { lx: -1.2, ly: 0.6, w: w * 0.8, h: 0.18, d: 0.18, rz: 0.25 });
  P(G.box, M.metalRoof, { lx: w * 0.2, lz: -0.8, ly: 1.1, w: 3, h: 0.05, d: 2.2, rx: 0.9, rz: 0.2 });
  // Entulho
  for (let i = 0; i < 26; i++) {
    const s = 0.15 + rnd() * 0.45;
    P(G.rock, M.rubble, { lx: (rnd() - 0.5) * w * 1.2, lz: (rnd() - 0.2) * d, ly: s * 0.4, w: s * 1.3, h: s * 0.7, d: s });
  }
  // Colisão só nas paredes que ficaram de pé.
  const wall = (lx, lz, hw, hd) => {
    const p = local(x, z, rot, lx, lz);
    ctx.collisions.addBox(p.x, p.z, hw, hd, rot, 'ruin');
  };
  wall(0, -d / 2, w / 2, wallT / 2);
  wall(-w / 2, -d * 0.15, wallT / 2, d * 0.35);
  wall(w / 2, -d * 0.3, wallT / 2, d * 0.2);
  wall(-w * 0.3, d / 2, w * 0.2, wallT / 2);
  // Pequeno abrigo de lona onde o senhor atende.
  P(G.box, M.clothBlue, { lx: -w * 0.15, lz: -d * 0.05, ly: 2.3, w: 3.4, h: 0.04, d: 2.6, rz: 0.12 });
  for (const [a, b] of [[-1.6, -1.2], [1.4, -1.2], [-1.6, 1.2], [1.4, 1.2]]) {
    P(G.cyl6, M.wood, { lx: -w * 0.15 + a, lz: -d * 0.05 + b, ly: 1.15, w: 0.05, h: 2.3, d: 0.05 });
  }
  return { y0, inside: local(x, z, rot, -w * 0.15, 0.5) };
}

/** Loja/mercadinho: casa + toldo + mercadorias na frente. */
export function shop(ctx, { x, z, rot = 0, w = 7, d = 6, cloth, roof = 'tin' }) {
  const { M } = ctx;
  const info = house(ctx, { x, z, rot, w, d, h: 3.2, wall: M.adobePastel, roof });
  const y0 = info.y0;
  cloth ??= [M.clothRed, M.clothBlue, M.clothGreen, M.clothYellow][Math.floor(ctx.rnd() * 4)];
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  P(G.box, cloth, { lz: d / 2 + 1.0, ly: 2.75, w: w * 0.9, h: 0.04, d: 2.1, rx: 0.28 });
  for (const s of [-1, 1]) P(G.cyl6, M.wood, { lx: s * w * 0.42, lz: d / 2 + 1.9, ly: 1.25, w: 0.05, h: 2.5, d: 0.05 });
  // Placa pendurada na borda do toldo.
  P(G.box, M.woodLight, { lz: d / 2 + 1.95, ly: 2.1, w: 1.6, h: 0.42, d: 0.05 });
  for (const s of [-1, 1]) P(G.cyl6, M.iron, { lx: s * 0.6, lz: d / 2 + 1.95, ly: 2.38, w: 0.012, h: 0.16, d: 0.012 });
  goods(ctx, local(x, z, rot, -w * 0.25, d / 2 + 1.2), y0 + 0.25, rot);
  goods(ctx, local(x, z, rot, w * 0.25, d / 2 + 1.2), y0 + 0.25, rot);
  return info;
}

/** Caixotes, cestos e produtos (frutas, grãos). */
export function goods(ctx, p, y, rot) {
  const { M } = ctx;
  const prods = [M.produceRed, M.produceGreen, M.produceYellow, M.produceOrange];
  ctx.batch.add(G.box, M.woodLight, { x: p.x, y: y + 0.3, z: p.z, ry: rot, sx: 1.4, sy: 0.6, sz: 0.7 });
  for (let i = 0; i < 3; i++) {
    const q = local(p.x, p.z, rot, -0.45 + i * 0.45, 0);
    ctx.batch.add(G.cyl, M.basket, { x: q.x, y: y + 0.72, z: q.z, sx: 0.2, sy: 0.22, sz: 0.2 });
    ctx.batch.add(G.sphere, prods[(i + Math.floor(ctx.rnd() * 4)) % 4], { x: q.x, y: y + 0.85, z: q.z, sx: 0.18, sy: 0.1, sz: 0.18 });
  }
}

/** Barraca de feira: 4 estacas, mesa e cobertura de tecido. */
export function marketStall(ctx, { x, z, rot = 0, w = 3, d = 2.2, poor = false }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z);
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  const cloth = poor ? M.thatch : [M.clothRed, M.clothBlue, M.clothGreen, M.clothYellow][Math.floor(ctx.rnd() * 4)];
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    P(G.cyl6, M.wood, { lx: a * w / 2, lz: b * d / 2, ly: 1.15 + (b < 0 ? 0.2 : 0), w: 0.05, h: 2.3 + (b < 0 ? 0.4 : 0), d: 0.05 });
  }
  P(G.box, cloth, { ly: 2.45, w: w + 0.4, h: 0.04, d: d + 0.5, rx: -0.12 });
  P(G.box, M.woodLight, { lz: d * 0.15, ly: 0.82, w: w * 0.92, h: 0.08, d: d * 0.55 });
  P(G.box, M.woodDark, { lz: d * 0.15, ly: 0.4, w: w * 0.85, h: 0.78, d: d * 0.45 });
  const prods = [M.produceRed, M.produceGreen, M.produceYellow, M.produceOrange];
  const n = poor ? 2 : 5;
  for (let i = 0; i < n; i++) {
    P(G.sphere, prods[Math.floor(ctx.rnd() * 4)], {
      lx: -w * 0.35 + (i / Math.max(1, n - 1)) * w * 0.7, lz: d * 0.15, ly: 0.95, w: 0.28, h: 0.13, d: 0.24,
    });
  }
  ctx.collisions.addBox(x, z, w / 2 + 0.1, d * 0.35, rot, 'stall');
}

// ---------- edifícios grandes ----------
/** Igreja de bairro (branca, torre com sino e cruz). scale 1 ≈ 10 x 20 m. */
export function church(ctx, { x, z, rot = 0, scale = 1, wall, sahel = false }) {
  const { M } = ctx;
  wall ??= M.adobeWhite;
  const w = 10 * scale, d = 20 * scale, h = 7 * scale;
  const y0 = groundUnder(ctx, x, z, rot, w / 2, d / 2) - 0.3;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  P(G.box, wall, { ly: h / 2, w, h, d });
  P(G.box, M.stone, { ly: 0.4, w: w + 0.2, h: 0.8, d: d + 0.2 });
  if (sahel) {
    // Igreja de barro estilo sudano-saheliano: contrafortes e vigas aparentes.
    P(G.box, wall, { ly: h + 0.5, w: w + 0.1, h: 1, d: d + 0.1 });
    for (let i = -d / 2 + 2; i < d / 2; i += 3) {
      for (const s of [-1, 1]) {
        P(G.box, wall, { lx: s * (w / 2 + 0.4), lz: i, ly: (h + 1.6) / 2, w: 0.9, h: h + 1.6, d: 1.0 });
        P(G.cyl6, M.woodDark, { lx: s * (w / 2 + 0.6), lz: i + 1.5, ly: h * 0.7, w: 0.07, h: 1.2, d: 0.07, rz: Math.PI / 2 });
      }
    }
  } else {
    const rh = w * 0.42;
    ctx.batch.add(G.roofSlopes, M.tilesRed, { x, y: y0 + h, z, ry: rot + Math.PI / 2, sx: d + 0.8, sy: rh, sz: w + 1.0 });
    ctx.batch.add(G.gables, wall, { x, y: y0 + h, z, ry: rot + Math.PI / 2, sx: d, sy: rh * (w / (w + 1)), sz: w });
  }
  // Torre frontal
  const tw = 4 * scale, th = sahel ? 17 * scale : 15 * scale;
  P(G.box, wall, { lz: d / 2 + tw / 2 - 0.5, ly: th / 2, w: tw, h: th, d: tw });
  P(G.box, M.darkOpening, { lz: d / 2 + tw - 0.47, ly: th - 2.2 * scale, w: 1.2 * scale, h: 2 * scale, d: 0.06 });
  if (sahel) {
    for (let k = 0; k < 4; k++) P(G.cone8, wall, { lz: d / 2 + tw / 2 - 0.5, ly: th + 0.8 + k * 0.01, w: tw * 0.35, h: 1.6, d: tw * 0.35 });
  } else {
    P(G.pyramid, M.tilesBrown, { lz: d / 2 + tw / 2 - 0.5, ly: th + 1.8 * scale, w: tw + 0.6, h: 3.6 * scale, d: tw + 0.6 });
  }
  const cy = th + (sahel ? 2.4 : 3.6 * scale) + 0.9;
  P(G.box, M.iron, { lz: d / 2 + tw / 2 - 0.5, ly: cy, w: 0.14, h: 1.8, d: 0.14 });
  P(G.box, M.iron, { lz: d / 2 + tw / 2 - 0.5, ly: cy + 0.3, w: 0.9, h: 0.14, d: 0.14 });
  // Porta grande e janelas altas
  P(G.box, M.woodDark, { lz: d / 2 + tw - 0.47, ly: 1.5 * scale, w: 1.8 * scale, h: 3 * scale, d: 0.08 });
  for (let i = -d / 2 + 3; i < d / 2 - 1; i += 4) {
    for (const s of [-1, 1]) P(G.box, M.glass, { lx: s * (w / 2 + 0.03), lz: i, ly: h * 0.55, w: 0.06, h: h * 0.4, d: 1.1 });
  }
  ctx.collisions.addBox(x, z, w / 2 + (sahel ? 0.9 : 0), d / 2, rot, 'church');
  const t = local(x, z, rot, 0, d / 2 + tw / 2 - 0.5);
  ctx.collisions.addBox(t.x, t.z, tw / 2, tw / 2, rot, 'church');
  return { y0, door: local(x, z, rot, 0, d / 2 + tw + 1.6), interior: local(x, z, rot, 0, 0) };
}

/** A maior catedral do jogo (pedra, duas torres com agulhas, transepto e abside). */
export function cathedral(ctx, { x, z, rot = 0 }) {
  const { M } = ctx;
  const w = 20, d = 50, h = 17;
  const y0 = groundUnder(ctx, x, z, rot, w / 2, d / 2) - 0.4;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  P(G.box, M.stoneLight, { ly: h / 2, w, h, d });
  P(G.box, M.stone, { ly: 0.6, w: w + 0.6, h: 1.2, d: d + 0.6 });
  ctx.batch.add(G.roofSlopes, M.tilesBrown, { x, y: y0 + h, z, ry: rot + Math.PI / 2, sx: d + 1, sy: 9, sz: w + 1.4 });
  ctx.batch.add(G.gables, M.stoneLight, { x, y: y0 + h, z, ry: rot + Math.PI / 2, sx: d, sy: 9 * (w / (w + 1.4)), sz: w });
  // Transepto
  P(G.box, M.stoneLight, { lz: -6, ly: h * 0.45, w: w + 20, h: h * 0.9, d: 12 });
  ctx.batch.add(G.roofSlopes, M.tilesBrown, { ...worldOf(x, z, rot, 0, -6), y: y0 + h * 0.9, ry: rot, sx: w + 21, sy: 7, sz: 13 });
  // Abside semicircular nos fundos
  P(G.halfCyl, M.stoneLight, { lz: -d / 2, ly: h * 0.4, w: w / 2, h: h * 0.8, d: w / 2, ry: Math.PI / 2 });
  P(G.cone, M.tilesBrown, { lz: -d / 2, ly: h * 0.8 + 2.5, w: w / 2 + 0.5, h: 5, d: w / 2 + 0.5 });
  // Contrafortes
  for (let i = -d / 2 + 4; i < d / 2 - 2; i += 6) {
    for (const s of [-1, 1]) {
      P(G.box, M.stone, { lx: s * (w / 2 + 0.8), lz: i, ly: h * 0.4, w: 1.6, h: h * 0.8, d: 1.4 });
      P(G.box, M.glass, { lx: s * (w / 2 + 0.03), lz: i + 3, ly: h * 0.55, w: 0.08, h: h * 0.5, d: 2.2 });
    }
  }
  // Torres gêmeas com agulhas
  for (const s of [-1, 1]) {
    const lx = s * (w / 2 - 1), lz = d / 2 + 2;
    P(G.box, M.stoneLight, { lx, lz, ly: 17, w: 8, h: 34, d: 8 });
    P(G.box, M.stone, { lx, lz, ly: 34.5, w: 9, h: 1, d: 9 });
    P(G.box, M.darkOpening, { lx, lz: lz + 4.03, ly: 27, w: 2, h: 5, d: 0.06 });
    P(G.cone8, M.stoneDark, { lx, lz, ly: 35 + 7, w: 4.6, h: 14, d: 4.6 });
    P(G.box, M.gold, { lx, lz, ly: 50, w: 0.2, h: 2.2, d: 0.2 });
    P(G.box, M.gold, { lx, lz, ly: 50.4, w: 1.2, h: 0.2, d: 0.2 });
  }
  // Fachada: rosácea e portal
  P(G.box, M.stoneLight, { lz: d / 2 + 2, ly: h * 0.6, w: w - 4, h: h * 1.2, d: 4 });
  P(G.face, M.glass, { lz: d / 2 + 4.05, ly: h * 0.8, w: 3.2, h: 3.2, d: 1 });
  P(G.box, M.woodDark, { lz: d / 2 + 4.05, ly: 3, w: 4, h: 6, d: 0.1 });
  P(G.box, M.stone, { lz: d / 2 + 4.1, ly: 6.4, w: 5, h: 0.8, d: 0.3 });
  ctx.collisions.addBox(x, z, w / 2 + 1.6, d / 2 + 4, rot, 'cathedral');
  const tp = local(x, z, rot, 0, -6);
  ctx.collisions.addBox(tp.x, tp.z, (w + 20) / 2, 6, rot, 'cathedral');
  return { y0, door: local(x, z, rot, 0, d / 2 + 6.5) };
}

function worldOf(x, z, rot, lx, lz) {
  const p = local(x, z, rot, lx, lz);
  return { x: p.x, z: p.z };
}

/** Mansão do prefeito: dois andares, varanda com colunas e telhado de quatro águas. */
export function mansion(ctx, { x, z, rot = 0 }) {
  const { M } = ctx;
  const w = 20, d = 13, h = 8;
  const y0 = groundUnder(ctx, x, z, rot, w / 2, d / 2) - 0.3;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  P(G.box, M.stone, { ly: 0.5, w: w + 0.4, h: 1, d: d + 0.4 });
  P(G.box, M.adobeWhite, { ly: 1 + h / 2, w, h, d });
  P(G.box, M.stoneLight, { ly: 1 + h / 2, w: w + 0.15, h: 0.3, d: d + 0.15 }); // cornija entre andares
  P(G.pyramid, M.tilesRed, { ly: 1 + h + 2.5, w: w + 1.6, h: 5, d: d + 1.6 });
  // Varanda frontal com colunas e sacada
  P(G.box, M.stoneLight, { lz: d / 2 + 2, ly: 0.6, w: w * 0.7, h: 1.2, d: 4 });
  for (let i = 0; i < 6; i++) {
    P(G.cyl, M.whitePaint, { lx: -w * 0.32 + i * (w * 0.64 / 5), lz: d / 2 + 3.6, ly: 1.2 + 2.2, w: 0.28, h: 4.4, d: 0.28 });
  }
  P(G.box, M.stoneLight, { lz: d / 2 + 2, ly: 1.2 + 4.55, w: w * 0.72, h: 0.3, d: 4.2 });
  for (let i = 0; i < 14; i++) P(G.cyl6, M.whitePaint, { lx: -w * 0.34 + i * (w * 0.68 / 13), lz: d / 2 + 3.95, ly: 6.3, w: 0.06, h: 0.9, d: 0.06 });
  P(G.box, M.whitePaint, { lz: d / 2 + 3.95, ly: 6.8, w: w * 0.7, h: 0.1, d: 0.12 });
  P(G.box, M.woodDark, { lz: d / 2 + 0.05, ly: 1 + 1.3, w: 2, h: 2.6, d: 0.1 });
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 6; i++) {
      if (row === 0 && (i === 2 || i === 3)) continue;
      P(G.box, M.glass, { lx: -w * 0.4 + i * (w * 0.8 / 5), lz: d / 2 + 0.04, ly: 1 + 1.7 + row * 4, w: 1.1, h: 1.7, d: 0.06 });
      P(G.box, M.woodDark, { lx: -w * 0.4 + i * (w * 0.8 / 5), lz: d / 2 + 0.08, ly: 1 + 1.7 + row * 4, w: 1.5, h: 1.9, d: 0.04 });
    }
  }
  ctx.collisions.addBox(x, z, w / 2, d / 2, rot, 'mansion');
  const v = local(x, z, rot, 0, d / 2 + 2);
  ctx.collisions.addBox(v.x, v.z, w * 0.35, 0.5, rot, 'mansion-steps');
  return { y0, door: local(x, z, rot, 0, d / 2 + 5.5) };
}

/** Torre do grande relógio (o cofre da vila fica embaixo). */
export function clockTower(ctx, { x, z, rot = 0 }) {
  const { M } = ctx;
  const s = 6, h = 22;
  const y0 = groundUnder(ctx, x, z, rot, s / 2, s / 2) - 0.2;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  P(G.box, M.stone, { ly: 1, w: s + 1.6, h: 2, d: s + 1.6 });
  P(G.box, M.stoneLight, { ly: h / 2, w: s, h, d: s });
  P(G.box, M.stone, { ly: h - 4, w: s + 0.5, h: 0.5, d: s + 0.5 });
  P(G.pyramid, M.tilesBrown, { ly: h + 2.5, w: s + 1.2, h: 5, d: s + 1.2 });
  P(G.sphere, M.brass, { ly: h + 5.3, w: 0.35, h: 0.35, d: 0.35 });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const p = local(x, z, rot + a, 0, s / 2 + 0.05);
    ctx.batch.add(G.face, M.clockFace, { x: p.x, y: y0 + h - 7, z: p.z, ry: rot + a, sx: 2.1, sy: 2.1, sz: 1 });
    const q = local(x, z, rot + a, 0, s / 2 + 0.02);
    ctx.batch.add(G.torus, M.brass, { x: q.x, y: y0 + h - 7, z: q.z, ry: rot + a, sx: 2.2, sy: 2.2, sz: 1.2 });
  }
  // Porta de ferro do cofre (na base).
  P(G.box, M.iron, { lz: s / 2 + 0.85, ly: 1.2, w: 1.6, h: 2.2, d: 0.12 });
  P(G.cyl, M.brass, { lz: s / 2 + 0.95, ly: 1.2, w: 0.35, h: 0.06, d: 0.35, rx: Math.PI / 2 });
  ctx.collisions.addBox(x, z, s / 2 + 0.8, s / 2 + 0.8, rot, 'clock');
  return { y0, vaultDoor: local(x, z, rot, 0, s / 2 + 2) };
}

/** Poço d'água de pedra com telhadinho e balde. */
export function well(ctx, { x, z }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z) - 0.1;
  ctx.batch.add(G.cyl, M.stone, { x, y: y0 + 0.45, z, sx: 1.2, sy: 0.9, sz: 1.2 });
  ctx.batch.add(G.disc, M.water, { x, y: y0 + 0.75, z, sx: 0.95, sy: 1, sz: 0.95 });
  for (const s of [-1, 1]) ctx.batch.add(G.box, M.woodDark, { x: x + s * 1.05, y: y0 + 1.5, z, sx: 0.16, sy: 2.2, sz: 0.16 });
  ctx.batch.add(G.cyl6, M.wood, { x, y: y0 + 2.2, z, rz: Math.PI / 2, sx: 0.08, sy: 2.4, sz: 0.08 });
  ctx.batch.add(G.roofSlopes, M.tilesRed, { x, y: y0 + 2.5, z, sx: 2.8, sy: 0.8, sz: 2.2 });
  ctx.batch.add(G.cyl, M.woodDark, { x: x + 0.3, y: y0 + 1.6, z, sx: 0.16, sy: 0.25, sz: 0.16 });
  ctx.collisions.addCircle(x, z, 1.3, 'well');
  return { y0 };
}

/** Praça calçada (disco de paralelepípedos). */
export function plaza(ctx, { x, z, r, mat }) {
  const y = ctx.terrain.heightAt(x, z);
  ctx.batch.add(G.cyl, mat ?? ctx.M.cobble, { x, y: y - 0.05, z, sx: r, sy: 0.22, sz: r });
  return y + 0.06;
}

export function bench(ctx, { x, z, rot = 0 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z);
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  P(G.box, M.wood, { ly: 0.45, w: 1.8, h: 0.06, d: 0.45 });
  P(G.box, M.wood, { ly: 0.8, lz: -0.2, w: 1.8, h: 0.35, d: 0.05 });
  for (const s of [-1, 1]) P(G.box, M.stoneDark, { lx: s * 0.75, ly: 0.22, w: 0.1, h: 0.44, d: 0.4 });
}

/** Obelisco/memorial (Praça da Saudade). */
export function memorial(ctx, { x, z }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z);
  ctx.batch.add(G.box, M.stone, { x, y: y0 + 0.4, z, sx: 3, sy: 0.8, sz: 3 });
  ctx.batch.add(G.box, M.stoneDark, { x, y: y0 + 1.2, z, sx: 1.6, sy: 0.8, sz: 1.6 });
  ctx.batch.add(G.pyramid, M.stoneDark, { x, y: y0 + 4.6, z, sx: 1.1, sy: 6, sz: 1.1 });
  ctx.collisions.addBox(x, z, 1.5, 1.5, 0, 'memorial');
}

/** Alçapão de ferro no chão (entrada de masmorra). */
export function hatch(ctx, { x, z, rot = 0 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z);
  ctx.batch.add(G.box, M.stone, { x, y: y0 + 0.1, z, ry: rot, sx: 2.6, sy: 0.2, sz: 2.6 });
  ctx.batch.add(G.box, M.iron, { x, y: y0 + 0.22, z, ry: rot, sx: 1.8, sy: 0.06, sz: 1.8 });
  ctx.batch.add(G.torus, M.iron, { x, y: y0 + 0.27, z, ry: rot, rx: Math.PI / 2, sx: 0.2, sy: 0.2, sz: 0.2 });
}

// ---------- muros e cercas ----------
/** Muro de troncos pontiagudos em círculo, com aberturas (gates em radianos). */
export function palisade(ctx, { x, z, r, height = 3.4, gates = [], gateWidth = 6 }) {
  const { M } = ctx;
  const gap = gateWidth / r;
  const isGate = (a) => gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gap / 2);
  const step = 0.36 / r;
  for (let a = 0; a < Math.PI * 2; a += step) {
    if (isGate(a)) continue;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const y0 = ctx.terrain.heightAt(px, pz);
    const hh = height * (0.9 + ctx.rnd() * 0.2);
    ctx.batch.add(G.cyl6, M.log, { x: px, y: y0 + hh / 2 - 0.3, z: pz, sx: 0.17, sy: hh, sz: 0.17, rz: (ctx.rnd() - 0.5) * 0.05 });
    ctx.batch.add(G.cone8, M.log, { x: px, y: y0 + hh - 0.3 + 0.25, z: pz, sx: 0.17, sy: 0.5, sz: 0.17 });
  }
  // Travessas internas e colisão em segmentos de ~6 m.
  const seg = 6 / r;
  for (let a = 0; a < Math.PI * 2; a += seg) {
    const b = a + seg;
    if (isGate(a) || isGate(b) || isGate((a + b) / 2)) continue;
    const ax = x + Math.cos(a) * r, az = z + Math.sin(a) * r;
    const bx = x + Math.cos(b) * r, bz = z + Math.sin(b) * r;
    ctx.collisions.addWall(ax, az, bx, bz, 0.6, 'palisade');
    const mx = x + Math.cos((a + b) / 2) * (r - 0.3), mz = z + Math.sin((a + b) / 2) * (r - 0.3);
    const y0 = ctx.terrain.heightAt(mx, mz);
    ctx.batch.add(G.box, M.woodDark, { x: mx, y: y0 + 2.1, z: mz, ry: -((a + b) / 2), sx: 0.12, sy: 0.16, sz: 6.1 });
  }
}

/** Cerca de mini estacas (~1 m), com aberturas. */
export function stakeFence(ctx, { x, z, r, gates = [], gateWidth = 5 }) {
  const { M } = ctx;
  const gap = gateWidth / r;
  const isGate = (a) => gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gap / 2);
  const step = 0.55 / r;
  for (let a = 0; a < Math.PI * 2; a += step) {
    if (isGate(a)) continue;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const y0 = ctx.terrain.heightAt(px, pz);
    const hh = 0.8 + ctx.rnd() * 0.35;
    ctx.batch.add(G.cyl6, M.woodLight, { x: px, y: y0 + hh / 2, z: pz, sx: 0.045, sy: hh, sz: 0.045, rx: (ctx.rnd() - 0.5) * 0.15, rz: (ctx.rnd() - 0.5) * 0.15 });
  }
  const seg = 5 / r;
  for (let a = 0; a < Math.PI * 2; a += seg) {
    const b = a + seg;
    if (isGate(a) || isGate(b)) continue;
    const ax = x + Math.cos(a) * r, az = z + Math.sin(a) * r;
    const bx = x + Math.cos(b) * r, bz = z + Math.sin(b) * r;
    ctx.collisions.addWall(ax, az, bx, bz, 0.3, 'stakes');
    const y0 = ctx.terrain.heightAt((ax + bx) / 2, (az + bz) / 2);
    ctx.batch.add(G.box, M.wood, { x: (ax + bx) / 2, y: y0 + 0.55, z: (az + bz) / 2, ry: Math.atan2(bx - ax, bz - az), sx: 0.04, sy: 0.04, sz: 5.05 });
  }
}

/**
 * Muralha de pedra em círculo com torres, ameias, canhões e um portão.
 * Retorna as posições das torres (para os guardas) e o objeto do portão.
 */
export function fortressWall(ctx, { x, z, r, gateAngle = 0, height = 9, thickness = 3, towers = 12 }) {
  const { M } = ctx;
  const gateW = 7;
  const gap = (gateW + 6) / r;
  const near = (a) => Math.abs(Math.atan2(Math.sin(a - gateAngle), Math.cos(a - gateAngle))) < gap / 2;
  const segs = 72;
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * Math.PI * 2, b = ((k + 1) / segs) * Math.PI * 2;
    const m = (a + b) / 2;
    if (near(m)) continue;
    const ax = x + Math.cos(a) * r, az = z + Math.sin(a) * r;
    const bx = x + Math.cos(b) * r, bz = z + Math.sin(b) * r;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const len = Math.hypot(bx - ax, bz - az) + 0.3;
    const y0 = Math.min(ctx.terrain.heightAt(ax, az), ctx.terrain.heightAt(bx, bz)) - 0.5;
    const ry = Math.atan2(bx - ax, bz - az);
    ctx.batch.add(G.box, M.stone, { x: mx, y: y0 + height / 2, z: mz, ry, sx: thickness, sy: height, sz: len });
    // Ameias (merlões) na borda externa.
    const ox = Math.cos(m), oz = Math.sin(m);
    for (let i = 0; i < 2; i++) {
      const t = (i + 0.25) / 2;
      const px = ax + (bx - ax) * t + ox * (thickness / 2 - 0.3);
      const pz = az + (bz - az) * t + oz * (thickness / 2 - 0.3);
      ctx.batch.add(G.box, M.stone, { x: px, y: y0 + height + 0.55, z: pz, ry, sx: 0.6, sy: 1.1, sz: len * 0.3 });
    }
    ctx.collisions.addWall(ax, az, bx, bz, thickness, 'fortress');
  }

  const towerList = [];
  for (let k = 0; k < towers; k++) {
    const a = gateAngle + ((k + 0.5) / towers) * Math.PI * 2;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const y0 = ctx.terrain.heightAt(px, pz) - 0.5;
    const th = height + 4;
    ctx.batch.add(G.cyl, M.stone, { x: px, y: y0 + th / 2, z: pz, sx: 4.4, sy: th, sz: 4.4 });
    ctx.batch.add(G.cyl, M.stoneDark, { x: px, y: y0 + th + 0.1, z: pz, sx: 4.7, sy: 0.3, sz: 4.7 });
    for (let i = 0; i < 10; i++) {
      const b = (i / 10) * Math.PI * 2;
      ctx.batch.add(G.box, M.stone, { x: px + Math.cos(b) * 4.3, y: y0 + th + 0.8, z: pz + Math.sin(b) * 4.3, ry: -b, sx: 0.5, sy: 1.2, sz: 1.3 });
    }
    // Canhão apontado para fora.
    const ox = Math.cos(a), oz = Math.sin(a);
    const cx = px + ox * 1.6, cz = pz + oz * 1.6;
    const ry = Math.atan2(ox, oz);
    ctx.batch.add(G.box, M.woodDark, { x: cx, y: y0 + th + 0.55, z: cz, ry, sx: 1.2, sy: 0.6, sz: 1.8 });
    ctx.batch.add(G.cyl, M.iron, { x: cx + ox * 0.9, y: y0 + th + 1.05, z: cz + oz * 0.9, ry, rx: Math.PI / 2 - 0.08, sx: 0.26, sy: 2.8, sz: 0.26 });
    for (const s of [-1, 1]) {
      const wx = cx + Math.cos(a + Math.PI / 2) * 0.65 * s, wz = cz + Math.sin(a + Math.PI / 2) * 0.65 * s;
      ctx.batch.add(G.torus, M.woodDark, { x: wx, y: y0 + th + 0.4, z: wz, ry: ry + Math.PI / 2, sx: 0.38, sy: 0.38, sz: 0.6 });
    }
    ctx.collisions.addCircle(px, pz, 4.5, 'tower');
    towerList.push({ x: px - ox * 1.5, z: pz - oz * 1.5, y: y0 + th + 0.2, angle: a });
  }

  // Portão: duas torres, arco e folhas de madeira (animadas).
  const gx = x + Math.cos(gateAngle) * r, gz = z + Math.sin(gateAngle) * r;
  const gy = ctx.terrain.heightAt(gx, gz) - 0.4;
  const tang = { x: -Math.sin(gateAngle), z: Math.cos(gateAngle) };
  for (const s of [-1, 1]) {
    const px = gx + tang.x * s * (gateW / 2 + 2.6), pz = gz + tang.z * s * (gateW / 2 + 2.6);
    ctx.batch.add(G.box, M.stone, { x: px, y: gy + (height + 6) / 2, z: pz, ry: -gateAngle, sx: 5.5, sy: height + 6, sz: 5.2 });
    ctx.batch.add(G.pyramid, M.tilesBrown, { x: px, y: gy + height + 6 + 1.8, z: pz, ry: -gateAngle, sx: 6.2, sy: 3.6, sz: 6.2 });
    ctx.collisions.addBox(px, pz, 2.75, 2.6, -gateAngle, 'gate-tower');
  }
  ctx.batch.add(G.box, M.stone, { x: gx, y: gy + height - 1.2, z: gz, ry: -gateAngle, sx: thickness + 1, sy: 3.4, sz: gateW + 0.4 });
  ctx.batch.add(G.box, M.gold, { x: gx + Math.cos(gateAngle) * 2.1, y: gy + height - 1.2, z: gz + Math.sin(gateAngle) * 2.1, ry: -gateAngle, sx: 0.1, sy: 1.2, sz: 2.4 });

  const leaves = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(gx + tang.x * s * (gateW / 2), gy, gz + tang.z * s * (gateW / 2));
    pivot.rotation.y = -gateAngle;
    const leaf = new THREE.Mesh(G.box, M.woodDark);
    leaf.scale.set(0.35, 6.5, gateW / 2);
    leaf.position.set(0, 3.25, -s * gateW / 4);
    leaf.castShadow = true;
    pivot.add(leaf);
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(G.box, M.iron);
      band.scale.set(0.42, 0.18, gateW / 2);
      band.position.set(0, 1.2 + i * 2, -s * gateW / 4);
      pivot.add(band);
    }
    ctx.dynamic.add(pivot);
    leaves.push({ pivot, side: s, base: -gateAngle });
  }
  const collider = ctx.collisions.addWall(
    gx - tang.x * (gateW / 2 + 0.2), gz - tang.z * (gateW / 2 + 0.2),
    gx + tang.x * (gateW / 2 + 0.2), gz + tang.z * (gateW / 2 + 0.2), 1.2, 'gate',
  );
  const gate = {
    x: gx, z: gz, y: gy, open: false, t: 0, collider, leaves,
    outside: { x: gx + Math.cos(gateAngle) * 6, z: gz + Math.sin(gateAngle) * 6 },
    setOpen(v) { this.open = v; this.collider.enabled = !v; },
    update(dt) {
      this.t += ((this.open ? 1 : 0) - this.t) * Math.min(1, dt * 1.5);
      for (const l of this.leaves) l.pivot.rotation.y = l.base + l.side * this.t * 1.45;
    },
  };
  return { towers: towerList, gate };
}

// ---------- campo, fazenda, porto ----------
const cropGeoCache = {};
function cropGeometry(kind) {
  if (cropGeoCache[kind]) return cropGeoCache[kind];
  const parts = [];
  if (kind === 'maize') {
    parts.push(new THREE.CylinderGeometry(0.018, 0.025, 2.0, 4).translate(0, 1.0, 0));
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.PlaneGeometry(0.09, 0.8);
      leaf.translate(0, 0.4, 0);
      leaf.rotateX(-0.9);
      leaf.rotateY(i * 1.7);
      leaf.translate(0, 0.5 + i * 0.32, 0);
      parts.push(leaf);
    }
    parts.push(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 5).translate(0.05, 1.3, 0));
  } else {
    // Mandioca/feijão: arbusto baixo.
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.PlaneGeometry(0.35, 0.35);
      leaf.rotateX(-1.2);
      leaf.rotateY(i * 1.25);
      leaf.translate(Math.cos(i * 1.25) * 0.15, 0.55 + (i % 2) * 0.12, Math.sin(i * 1.25) * 0.15);
      parts.push(leaf);
    }
    parts.push(new THREE.CylinderGeometry(0.015, 0.02, 0.6, 4).translate(0, 0.3, 0));
  }
  const geos = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return n;
  });
  const merged = mergeSimple(geos);
  cropGeoCache[kind] = merged;
  return merged;
}

function mergeSimple(geos) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geo;
}

/** Plantação em fileiras (instanciada). Retorna a forma para pintar o solo. */
export function field(ctx, { x, z, rot = 0, w = 40, d = 30, crop = 'maize', spacing = 0.9, rowGap = 1.1 }) {
  const geo = cropGeometry(crop);
  const mat = crop === 'maize' ? ctx.M.cropGreen : ctx.M.cropGreen;
  const cols = Math.floor(w / spacing), rows = Math.floor(d / rowGap);
  const mesh = new THREE.InstancedMesh(geo, mat, cols * rows);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lx = -w / 2 + (i + 0.5) * spacing + (ctx.rnd() - 0.5) * 0.15;
      const lz = -d / 2 + (j + 0.5) * rowGap;
      const wp = local(x, z, rot, lx, lz);
      const sc = 0.75 + ctx.rnd() * 0.4;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ctx.rnd() * Math.PI * 2);
      m.compose(p.set(wp.x, ctx.terrain.heightAt(wp.x, wp.z) - 0.05, wp.z), q, s.set(sc, sc, sc));
      mesh.setMatrixAt(n, m);
      const dry = ctx.rnd() * 0.3;
      mesh.setColorAt(n, col.setRGB(1 + dry * 0.8, 1 + dry * 0.3, 1 - dry * 0.4));
      n++;
    }
  }
  mesh.count = n;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  ctx.dynamic.add(mesh);
  return { type: 'rect', x, z, rot, hw: w / 2 + 1, hd: d / 2 + 1, color: 0x5a4030, strength: 0.85 };
}

/** Cerca de curral retangular com colisão. */
export function corral(ctx, { x, z, rot = 0, w = 30, d = 20, gateSide = 1 }) {
  const { M } = ctx;
  const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(len / 2.5);
    for (let i = 0; i <= n; i++) {
      const p = local(x, z, rot, ax + (bx - ax) * (i / n), az + (bz - az) * (i / n));
      ctx.batch.add(G.box, M.woodDark, { x: p.x, y: ctx.terrain.heightAt(p.x, p.z) + 0.65, z: p.z, ry: rot, sx: 0.14, sy: 1.3, sz: 0.14 });
    }
    const gate = k === 2 && gateSide;
    const segs = gate ? [[0, 0.4], [0.6, 1]] : [[0, 1]];
    for (const [t0, t1] of segs) {
      const a = local(x, z, rot, ax + (bx - ax) * t0, az + (bz - az) * t0);
      const b = local(x, z, rot, ax + (bx - ax) * t1, az + (bz - az) * t1);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const my = ctx.terrain.heightAt(mx, mz);
      for (const hy of [0.55, 1.05]) {
        ctx.batch.add(G.box, M.wood, { x: mx, y: my + hy, z: mz, ry: Math.atan2(b.x - a.x, b.z - a.z), sx: 0.07, sy: 0.12, sz: Math.hypot(b.x - a.x, b.z - a.z) });
      }
      ctx.collisions.addWall(a.x, a.z, b.x, b.z, 0.3, 'corral');
    }
  }
}

/** Animal simples (vaca ou cabra) — Group animável. */
export function animal(ctx, { x, z, kind = 'cow' }) {
  const g = new THREE.Group();
  const big = kind === 'cow';
  const donkey = kind === 'donkey'; // animal de carga dos nômades
  const coat = big ? [0x5a3a26, 0xe8e0d0, 0x2a2420, 0x8a5a36][Math.floor(ctx.rnd() * 4)]
    : donkey ? [0x7a7068, 0x9a8a78, 0x5a5048][Math.floor(ctx.rnd() * 3)]
      : [0xd8cfc0, 0x4a3a2e, 0x8a7a66][Math.floor(ctx.rnd() * 3)];
  const mat = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e1814, roughness: 0.9 });
  const L = big ? 1 : donkey ? 0.75 : 0.45;
  const body = new THREE.Mesh(G.box, mat);
  body.scale.set(0.7 * L, 0.7 * L, 1.7 * L);
  body.position.y = 1.0 * L;
  const head = new THREE.Mesh(G.box, mat);
  head.scale.set(0.38 * L, 0.42 * L, 0.55 * L);
  head.position.set(0, 1.25 * L, 1.0 * L);
  g.add(body, head);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(G.box, dark);
    leg.scale.set(0.13 * L, 0.7 * L, 0.13 * L);
    leg.position.set(a * 0.25 * L, 0.35 * L, b * 0.65 * L);
    g.add(leg);
  }
  if (big) {
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(G.cone8, M_horn());
      horn.scale.set(0.05, 0.35, 0.05);
      horn.position.set(s * 0.22, 1.55, 1.05);
      horn.rotation.z = -s * 0.9;
      g.add(horn);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(x, ctx.terrain.heightAt(x, z), z);
  g.rotation.y = ctx.rnd() * Math.PI * 2;
  g.userData = { head, body, bodyScale: body.scale.clone(), breathRate: big ? 1.4 : 2.2, phase: ctx.rnd() * 10, home: { x, z } };
  ctx.dynamic.add(g);
  return g;
}

let hornMat;
function M_horn() {
  hornMat ??= new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.6 });
  return hornMat;
}

/** Píer de madeira avançando sobre a água + barcos de pesca. */
export function pier(ctx, { ax, az, bx, bz, width = 3.5, boats = 3 }) {
  const { M } = ctx;
  const len = Math.hypot(bx - ax, bz - az);
  const ry = Math.atan2(bx - ax, bz - az);
  const deckY = Math.max(1.0, ctx.terrain.heightAt(ax, az) + 0.2);
  const n = Math.ceil(len / 0.3);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.batch.add(G.box, i % 6 ? M.wood : M.woodDark, { x: ax + (bx - ax) * t, y: deckY, z: az + (bz - az) * t, ry, sx: width, sy: 0.1, sz: 0.27 });
  }
  for (let i = 0; i <= Math.ceil(len / 3); i++) {
    const t = i / Math.ceil(len / 3);
    for (const s of [-1, 1]) {
      const px = ax + (bx - ax) * t + Math.cos(ry) * s * width / 2;
      const pz = az + (bz - az) * t - Math.sin(ry) * s * width / 2;
      ctx.batch.add(G.cyl, M.log, { x: px, y: deckY - 2, z: pz, sx: 0.15, sy: 4.4, sz: 0.15 });
    }
  }
  for (let k = 0; k < boats; k++) {
    const t = 0.35 + k * 0.25;
    const side = k % 2 ? 1 : -1;
    const px = ax + (bx - ax) * t + Math.cos(ry) * side * (width / 2 + 1.6);
    const pz = az + (bz - az) * t - Math.sin(ry) * side * (width / 2 + 1.6);
    ctx.batch.add(G.hull, M.wood, { x: px, y: 0.35, z: pz, ry: ry + 0.1 * side, sx: 0.85, sy: 0.55, sz: 2.8 });
    ctx.batch.add(G.box, M.woodDark, { x: px, y: 0.3, z: pz, ry: ry + 0.1 * side, sx: 1.2, sy: 0.06, sz: 0.25 });
  }
  return { deckY, ry, len };
}

// ---------- adereços ----------
export function barrel(ctx, { x, z }) {
  const y = ctx.terrain.heightAt(x, z);
  ctx.batch.add(G.cyl, ctx.M.wood, { x, y: y + 0.45, z, sx: 0.33, sy: 0.9, sz: 0.33 });
  ctx.batch.add(G.torus, ctx.M.iron, { x, y: y + 0.25, z, rx: Math.PI / 2, sx: 0.34, sy: 0.34, sz: 0.3 });
  ctx.batch.add(G.torus, ctx.M.iron, { x, y: y + 0.65, z, rx: Math.PI / 2, sx: 0.34, sy: 0.34, sz: 0.3 });
}

export function crate(ctx, { x, z, s = 0.8, rot = 0, y: lift = 0 }) {
  const y = ctx.terrain.heightAt(x, z) + lift; // lift: empilhado sobre outro
  ctx.batch.add(G.box, ctx.M.woodLight, { x, y: y + s / 2, z, ry: rot, sx: s, sy: s, sz: s });
}

export function firePit(ctx, { x, z }) {
  const y = ctx.terrain.heightAt(x, z);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ctx.batch.add(G.rock, ctx.M.stoneDark, { x: x + Math.cos(a) * 0.7, y: y + 0.12, z: z + Math.sin(a) * 0.7, sx: 0.22, sy: 0.18, sz: 0.2 });
  }
  for (let i = 0; i < 4; i++) {
    ctx.batch.add(G.cyl6, ctx.M.log, { x, y: y + 0.15, z, ry: i * 0.8, rz: Math.PI / 2, sx: 0.06, sy: 0.9, sz: 0.06 });
  }
}

export function banner(ctx, { x, z, cloth }) {
  const y = ctx.terrain.heightAt(x, z);
  ctx.batch.add(G.cyl6, ctx.M.woodDark, { x, y: y + 2.5, z, sx: 0.06, sy: 5, sz: 0.06 });
  ctx.batch.add(G.box, cloth, { x: x + 0.6, y: y + 4.2, z, sx: 1.2, sy: 1.5, sz: 0.03 });
}

export function dryingRack(ctx, { x, z, rot = 0 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z);
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  for (const s of [-1, 1]) P(G.cyl6, M.wood, { lx: s * 1.2, ly: 0.9, w: 0.05, h: 1.8, d: 0.05 });
  P(G.cyl6, M.wood, { ly: 1.7, w: 0.04, h: 2.5, d: 0.04, rz: Math.PI / 2 });
  for (let i = 0; i < 6; i++) P(G.box, M.cropGreen, { lx: -1 + i * 0.4, ly: 1.4, w: 0.25, h: 0.55, d: 0.05 });
}

// ---------- decoração entre as casas ----------

/**
 * Cerca de madeira irregular: postes tortos (inclinação e altura variam) e
 * duas travessas que acompanham o terreno.
 * @param {object} ctx
 * @param {{ax:number, az:number, bx:number, bz:number}} seg de onde até onde
 * @example fenceRun(ctx, { ax: 0, az: 0, bx: 8, bz: 1 })
 */
export function fenceRun(ctx, { ax, az, bx, bz }) {
  const { M } = ctx;
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round(len / 1.6));
  const ry = Math.atan2(bx - ax, bz - az);
  const posts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t + (ctx.rnd() - 0.5) * 0.15;
    const z = az + (bz - az) * t + (ctx.rnd() - 0.5) * 0.15;
    const h = 1.0 + ctx.rnd() * 0.35;
    const y = ctx.terrain.heightAt(x, z);
    ctx.batch.add(G.cyl6, M.woodDark, { x, y: y + h / 2 - 0.05, z, rx: (ctx.rnd() - 0.5) * 0.18, rz: (ctx.rnd() - 0.5) * 0.18, sx: 0.06, sy: h, sz: 0.06 });
    posts.push({ x, y, z });
  }
  for (let i = 0; i < n; i++) {
    const p = posts[i], q = posts[i + 1];
    if (ctx.rnd() < 0.12) continue; // travessa caída/faltando
    const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, my = (p.y + q.y) / 2;
    const seg = Math.hypot(q.x - p.x, q.z - p.z);
    const tilt = Math.atan2(q.y - p.y, seg);
    for (const hy of [0.45, 0.85]) {
      ctx.batch.add(G.box, M.wood, { x: mx, y: my + hy + (ctx.rnd() - 0.5) * 0.08, z: mz, ry, rx: -tilt, sx: 0.05, sy: 0.08, sz: seg + 0.1 });
    }
  }
}

/** Arbusto: 3-4 esferas verdes achatadas, tamanho e tom variados. */
export function bush(ctx, { x, z, s = 1 }) {
  const y = ctx.terrain.heightAt(x, z);
  const n = 3 + Math.floor(ctx.rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = ctx.rnd() * Math.PI * 2, r = ctx.rnd() * 0.45 * s;
    const k = (0.45 + ctx.rnd() * 0.35) * s;
    ctx.batch.add(G.sphere, i % 2 ? ctx.M.vine : ctx.M.cropGreen, {
      x: x + Math.cos(a) * r, y: y + k * 0.55, z: z + Math.sin(a) * r, sx: k, sy: k * 0.75, sz: k,
    });
  }
}

/** Pedra solta meio enterrada. */
export function rock(ctx, { x, z, s = 0.5 }) {
  const y = ctx.terrain.heightAt(x, z);
  ctx.batch.add(G.rock, ctx.M.stone, {
    x, y: y + s * 0.25, z, rx: ctx.rnd() * 3, ry: ctx.rnd() * 6, sx: s * (0.8 + ctx.rnd() * 0.5), sy: s * (0.5 + ctx.rnd() * 0.4), sz: s,
  });
}
