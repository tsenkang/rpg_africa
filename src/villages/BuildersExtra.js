import * as THREE from 'three';
import { G, part, local, groundUnder, wallHeight } from './Builders.js';
import { helixSteps, bridgeCurve } from './Layout.js';

/**
 * Peças dos assentamentos novos (taiga, oásis, copas, nômades, palafitas e
 * ruínas). Mesmas convenções de Builders.js: metros reais, `rot` = rotação
 * Y, frente = +Z local, `ctx` = { batch, dynamic, collisions, terrain, M, rnd }.
 * Tudo que é estático vai para o StaticBatcher; o que se mexe (chamas,
 * luzes errantes) vai para `ctx.dynamic` e é devolvido para ser animado.
 */

/**
 * Cilindro fino ligando dois pontos (corda, viga, galho).
 * @param {{x:number,y:number,z:number}} p
 * @param {{x:number,y:number,z:number}} q
 */
export function beam(ctx, mat, p, q, radius = 0.03, geo = G.cyl6) {
  const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
  const h = Math.hypot(dx, dz), len = Math.hypot(h, dy);
  ctx.batch.add(geo, mat, {
    x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2,
    ry: Math.atan2(dx, dz), rx: Math.atan2(h, dy), sx: radius, sy: len, sz: radius,
  });
}

// ============================ TAIGA ============================

/**
 * Cabana de toras: paredes de troncos empilhados (encaixe alternado nos
 * cantos), base de pedra, telhado de tábuas com neve, chaminé de pedra.
 * @returns {{y0:number, door:{x:number,z:number}, w:number, d:number, r:number}}
 */
export function logCabin(ctx, { x, z, rot = 0, w = 7, d = 5.5, h = 2.6 }) {
  const { M } = ctx;
  h = wallHeight(h);
  const y0 = groundUnder(ctx, x, z, rot, w / 2, d / 2) - 0.2;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  P(G.box, M.stoneDark, { ly: 0.25, w: w + 0.4, h: 0.5, d: d + 0.4 });
  const logR = 0.17, step = logR * 2 - 0.02;
  const n = Math.round(h / step);
  const doorW = 1.1, doorH = 2.1;
  for (let i = 0; i < n; i++) {
    const y = 0.5 + logR + i * step;
    const off = i % 2 ? 0.12 : -0.12; // encaixe alternado
    // Frente: interrompida na porta.
    if (y < doorH + 0.5) {
      const seg = (w + 0.5 - doorW) / 2;
      for (const s of [-1, 1]) P(G.cyl, M.log, { lx: s * (doorW / 2 + seg / 2), lz: d / 2, ly: y, w: logR, h: seg, d: logR, rz: Math.PI / 2 });
    } else {
      P(G.cyl, M.log, { lz: d / 2, ly: y, w: logR, h: w + 0.5, d: logR, rz: Math.PI / 2 });
    }
    P(G.cyl, M.log, { lz: -d / 2, ly: y, w: logR, h: w + 0.5, d: logR, rz: Math.PI / 2 });
    for (const s of [-1, 1]) P(G.cyl, M.log, { lx: s * w / 2, ly: y + off * 0.3, w: logR, h: d + 0.5, d: logR, rx: Math.PI / 2 });
  }
  const top = 0.5 + n * step;
  // Telhado de tábuas + camada de neve por cima.
  P(G.roofSlopes, M.woodDark, { ly: top, w: w + 1.4, h: 2.2, d: d + 1.4 });
  P(G.roofSlopes, M.snowCap, { ly: top + 0.12, w: w + 1.2, h: 2.15, d: d + 1.1 });
  P(G.gables, M.log, { ly: top, w, h: 2.2 * (d / (d + 1.4)), d });
  // Porta, batentes e janelinha com luz quente.
  P(G.box, M.woodDark, { lz: d / 2 + 0.1, ly: 0.5 + doorH / 2, w: doorW, h: doorH, d: 0.08 });
  for (const s of [-1, 1]) P(G.box, M.log, { lx: s * (doorW / 2 + 0.08), lz: d / 2 + 0.12, ly: 0.5 + doorH / 2, w: 0.16, h: doorH, d: 0.16 });
  P(G.box, M.runeGlow, { lx: w / 2 + 0.02, ly: 0.5 + 1.6, w: 0.05, h: 0.6, d: 0.8 });
  // Chaminé de pedra no canto dos fundos.
  P(G.box, M.stone, { lx: w / 2 - 0.7, lz: -d / 2 + 0.6, ly: (top + 3.2) / 2, w: 0.9, h: top + 3.2, d: 0.9 });
  ctx.collisions.addBox(x, z, w / 2 + 0.25, d / 2 + 0.25, rot, 'house');
  return { y0, door: local(x, z, rot, 0, d / 2 + 1.2), w, d, r: Math.hypot(w, d) / 2 };
}

/** Torre de vigia de troncos: 4 pernas, travessas, plataforma, guarda-corpo, teto de palha e escada. */
export function watchTower(ctx, { x, z, rot = 0, h = 9 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z) - 0.3;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  const s = 1.5;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    P(G.cyl, M.log, { lx: a * s, lz: b * s, ly: (h + 3.6) / 2, w: 0.18, h: h + 3.6, d: 0.18 });
  }
  for (const yy of [h * 0.35, h * 0.7]) {
    for (const sd of [-1, 1]) {
      P(G.cyl6, M.log, { lz: sd * s, ly: yy, w: 0.1, h: s * 2, d: 0.1, rz: Math.PI / 2 });
      P(G.cyl6, M.log, { lx: sd * s, ly: yy, w: 0.1, h: s * 2, d: 0.1, rx: Math.PI / 2 });
    }
  }
  P(G.box, M.wood, { ly: h, w: s * 2 + 0.8, h: 0.2, d: s * 2 + 0.8 });
  for (const sd of [-1, 1]) {
    P(G.box, M.woodDark, { lz: sd * (s + 0.35), ly: h + 0.55, w: s * 2 + 0.8, h: 0.9, d: 0.08 });
    P(G.box, M.woodDark, { lx: sd * (s + 0.35), ly: h + 0.55, w: 0.08, h: 0.9, d: s * 2 + 0.8 });
  }
  P(G.pyramid, M.thatch, { ly: h + 3.6 + 0.9, w: s * 2 + 1.6, h: 1.8, d: s * 2 + 1.6 });
  // Escada de mão na frente.
  for (const sd of [-0.3, 0.3]) P(G.cyl6, M.wood, { lx: sd, lz: s + 0.45, ly: h / 2, w: 0.05, h, d: 0.05 });
  for (let yy = 0.4; yy < h; yy += 0.4) P(G.cyl6, M.wood, { lz: s + 0.45, ly: yy, w: 0.035, h: 0.6, d: 0.035, rz: Math.PI / 2 });
  ctx.collisions.addCircle(x, z, s + 0.4, 'tower');
}

/** Varal de peles: dois postes, corda e peles de tamanhos e tons diferentes. */
export function hideRack(ctx, { x, z, rot = 0 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z);
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  for (const s of [-1, 1]) P(G.cyl6, M.log, { lx: s * 2, ly: 1.15, w: 0.07, h: 2.3, d: 0.07 });
  P(G.cyl6, M.rope, { ly: 2.15, w: 0.025, h: 4.1, d: 0.025, rz: Math.PI / 2 });
  for (let i = 0; i < 3; i++) {
    const lx = -1.3 + i * 1.3 + (ctx.rnd() - 0.5) * 0.3;
    const hh = 0.9 + ctx.rnd() * 0.5;
    P(G.box, i % 2 ? M.hideLight : M.hide, { lx, ly: 2.15 - hh / 2, w: 0.8 + ctx.rnd() * 0.4, h: hh, d: 0.03, ry: (ctx.rnd() - 0.5) * 0.3 });
  }
  ctx.collisions.addBox(x, z, 2.1, 0.3, rot, 'rack');
}

/**
 * Fogueira: anel de pedras, toras em tenda e chamas animadas.
 * @returns {{flames: THREE.Mesh[], light: {x:number,y:number,z:number}}}
 *   chamas (para tremular) e onde pôr a luz
 */
export function bonfire(ctx, { x, z, size = 1 }) {
  const { M } = ctx;
  const y = ctx.terrain.heightAt(x, z);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    ctx.batch.add(G.rock, M.stoneDark, { x: x + Math.cos(a) * 1.15 * size, y: y + 0.12, z: z + Math.sin(a) * 1.15 * size, sx: 0.3 * size, sy: 0.22 * size, sz: 0.26 * size });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    // Tora inclinada encostando no centro (tenda).
    beam(ctx, M.charred, { x: x + Math.cos(a) * 0.75 * size, y: y + 0.05, z: z + Math.sin(a) * 0.75 * size }, { x, y: y + 1.1 * size, z }, 0.09 * size);
  }
  ctx.batch.add(G.disc, M.runeGlow, { x, y: y + 0.04, z, sx: 0.8 * size, sy: 1, sz: 0.8 * size }); // brasas
  const flames = [];
  for (const [r, h, ox, oz] of [[0.5, 1.5, 0, 0], [0.32, 1.0, 0.3, 0.15], [0.3, 0.9, -0.25, -0.2]]) {
    const m = new THREE.Mesh(G.cone8, M.flame);
    m.scale.set(r * size, h * size, r * size);
    m.position.set(x + ox * size, y + 0.1 + (h * size) / 2, z + oz * size);
    m.userData.base = m.scale.clone();
    ctx.dynamic.add(m);
    flames.push(m);
  }
  ctx.collisions.addCircle(x, z, 1.3 * size, 'fire');
  return { flames, light: { x, y: y + 1.4 * size, z } };
}

// ============================ DESERTO ============================

/** Tenda de tecido colorido (duas águas), com mastros e estacas. */
export function clothTent(ctx, { x, z, rot = 0, w = 4.5, d = 3.4, h = 2.6, cloth }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z) - 0.05;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  // Cumeeira ao longo do Z local (a frente fica aberta).
  // roofSlopes: cumeeira no X local → girada 90° fica no Z (comprimento w).
  P(G.roofSlopes, cloth, { w, h, d, ry: Math.PI / 2 });
  P(G.gables, cloth, { w: w * 0.999, h, d, ry: Math.PI / 2 });
  P(G.box, M.darkOpening, { lz: w / 2 + 0.01, ly: h * 0.35, w: d * 0.35, h: h * 0.7, d: 0.02 });
  for (const s of [-1, 1]) P(G.cyl6, M.wood, { lz: s * (w / 2 + 0.05), ly: (h + 0.4) / 2, w: 0.05, h: h + 0.4, d: 0.05 });
  for (const s of [-1, 1]) {
    const a = local(x, z, rot, s * (d / 2 + 0.9), 0);
    beam(ctx, M.rope, { x: a.x, y: y0 + 0.05, z: a.z }, { ...local(x, z, rot, s * d * 0.3, 0), y: y0 + h * 0.65 }, 0.015);
  }
  ctx.collisions.addBox(x, z, d / 2, w / 2, rot, 'tent');
  return { door: local(x, z, rot, 0, w / 2 + 1), r: Math.hypot(w, d) / 2 };
}

/**
 * Lago do oásis: água animada (mesmo material dos poços), borda de pedras,
 * juncos. As palmeiras vão em `plants` (plantadas pela Vegetation).
 * @param {Array} plants recebe { type:'palm', x, z, s, ry }
 */
export function oasisPond(ctx, { x, z, r = 9, plants }) {
  const { M } = ctx;
  const y = ctx.terrain.heightAt(x, z);
  ctx.batch.add(G.disc, M.water, { x, y: y + 0.08, z, sx: r, sy: 1, sz: r });
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + ctx.rnd() * 0.1;
    const rr = r + 0.2 + ctx.rnd() * 0.4;
    ctx.batch.add(G.rock, i % 3 ? M.sandstone : M.stone, { x: x + Math.cos(a) * rr, y: y + 0.08, z: z + Math.sin(a) * rr, rx: ctx.rnd() * 3, ry: ctx.rnd() * 6, sx: 0.45, sy: 0.25, sz: 0.38 });
  }
  for (let i = 0; i < 40; i++) {
    const a = ctx.rnd() * Math.PI * 2, rr = r - 0.6 + ctx.rnd() * 1.6;
    const hh = 0.8 + ctx.rnd() * 0.9;
    ctx.batch.add(G.cyl6, M.cropGreen, { x: x + Math.cos(a) * rr, y: y + hh / 2, z: z + Math.sin(a) * rr, rx: (ctx.rnd() - 0.5) * 0.3, rz: (ctx.rnd() - 0.5) * 0.3, sx: 0.025, sy: hh, sz: 0.025 });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + ctx.rnd() * 0.3, rr = r + 2.5 + ctx.rnd() * 5;
    plants.push({ type: 'palm', x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, s: 0.85 + ctx.rnd() * 0.45, ry: ctx.rnd() * 6 });
  }
  ctx.collisions.addCircle(x, z, r, 'pond');
}

/** Sacos de especiarias abertos (montinhos coloridos) em frente a uma barraca. */
export function spiceSacks(ctx, { x, z, rot = 0, n = 5 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z);
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  const spices = [M.produceRed, M.produceOrange, M.produceYellow, M.produceGreen, M.clothRed];
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * 0.62;
    P(G.cyl, M.basket, { lx, ly: 0.28, w: 0.26, h: 0.56, d: 0.26 });
    P(G.cone, spices[i % spices.length], { lx, ly: 0.64, w: 0.24, h: 0.2, d: 0.24 });
  }
}

// ============================ FLORESTA TROPICAL ============================

/**
 * Árvore gigante (tronco afinando, raízes tabulares, copa larga e cipós).
 * @returns {{trunkR: number, height: number, y0: number}}
 */
export function giantTree(ctx, { x, z, h = 26, r = 1.5 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z) - 0.4;
  // Tronco em 3 gomos afinando.
  const segs = [[r, 0, h * 0.4], [r * 0.85, h * 0.4, h * 0.75], [r * 0.68, h * 0.75, h]];
  for (const [rr, a, b] of segs) ctx.batch.add(G.cyl, M.log, { x, y: y0 + (a + b) / 2, z, sx: rr, sy: b - a + 0.2, sz: rr });
  // Raízes tabulares.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + ctx.rnd() * 0.4;
    const len = 2.2 + ctx.rnd() * 1.2;
    const c = { x: x + Math.cos(a) * (r + len / 2 - 0.3), z: z + Math.sin(a) * (r + len / 2 - 0.3) };
    ctx.batch.add(G.box, M.log, { x: c.x, y: y0 + 1.1, z: c.z, ry: Math.atan2(Math.cos(a), Math.sin(a)), sx: 0.3, sy: 2.2, sz: len });
  }
  // Copa: bolos de folhas em camadas.
  for (let i = 0; i < 9; i++) {
    const a = ctx.rnd() * Math.PI * 2, rr = 2 + ctx.rnd() * 5;
    const s = 4.2 + ctx.rnd() * 2.8;
    ctx.batch.add(G.sphere, i % 3 ? M.vine : M.cropGreen, { x: x + Math.cos(a) * rr, y: y0 + h + 1 + ctx.rnd() * 3.5, z: z + Math.sin(a) * rr, sx: s, sy: s * 0.6, sz: s });
  }
  // Cipós pendurados.
  for (let i = 0; i < 10; i++) {
    const a = ctx.rnd() * Math.PI * 2, rr = 3 + ctx.rnd() * 5, len = 4 + ctx.rnd() * 7;
    ctx.batch.add(G.cyl6, M.vine, { x: x + Math.cos(a) * rr, y: y0 + h - len / 2 + 1, z: z + Math.sin(a) * rr, sx: 0.04, sy: len, sz: 0.04 });
  }
  ctx.collisions.addCircle(x, z, r + 0.3, 'tree');
  return { trunkR: r, height: h, y0 };
}

/**
 * Casa na árvore: plataforma redonda em volta do tronco, mãos-francesas,
 * guarda-corpo e uma cabana de madeira com teto de palha (o tronco passa
 * por dentro e sai pelo telhado).
 * @returns {{y:number, R:number}} altura do piso e raio da plataforma
 */
export function treeHouse(ctx, { x, z, y, R = 4.6, trunkR = 1.2 }) {
  const { M } = ctx;
  ctx.batch.add(G.cyl, M.wood, { x, y, z, sx: R, sy: 0.25, sz: R });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    beam(ctx, M.log, { x: x + Math.cos(a) * trunkR, y: y - 3, z: z + Math.sin(a) * trunkR }, { x: x + Math.cos(a) * R * 0.85, y: y - 0.1, z: z + Math.sin(a) * R * 0.85 }, 0.1);
  }
  const posts = 16;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2, b = ((i + 1) / posts) * Math.PI * 2;
    const p = { x: x + Math.cos(a) * (R - 0.1), z: z + Math.sin(a) * (R - 0.1) };
    const q = { x: x + Math.cos(b) * (R - 0.1), z: z + Math.sin(b) * (R - 0.1) };
    ctx.batch.add(G.cyl6, M.woodDark, { x: p.x, y: y + 0.55, z: p.z, sx: 0.05, sy: 1, sz: 0.05 });
    if (i % 4 !== 0) beam(ctx, M.rope, { ...p, y: y + 1 }, { ...q, y: y + 1 }, 0.03); // aberturas para as pontes
  }
  const hutR = Math.min(R - 1.4, trunkR + 1.8), wallH = 2.7;
  ctx.batch.add(G.cyl, M.woodLight, { x, y: y + wallH / 2 + 0.12, z, sx: hutR, sy: wallH, sz: hutR });
  ctx.batch.add(G.cone, M.thatch, { x, y: y + wallH + 1.0, z, sx: hutR + 1.0, sy: 2.2, sz: hutR + 1.0 });
  const door = { x: x + hutR + 0.02, z };
  ctx.batch.add(G.box, M.darkOpening, { x: door.x, y: y + 1.15, z: door.z, ry: Math.PI / 2, sx: 0.9, sy: 2.0, sz: 0.05 });
  ctx.batch.add(G.box, M.runeGlow, { x: x - hutR - 0.02, y: y + 1.6, z, ry: Math.PI / 2, sx: 0.6, sy: 0.5, sz: 0.04 });
  return { y, R };
}

/** Escada em caracol presa ao tronco (degraus + corrimão de corda). */
export function spiralStair(ctx, { x, z, trunkR, y0, y1, start = 0 }) {
  const { M } = ctx;
  const steps = helixSteps({ x, z, y0, y1, radius: trunkR + 0.6, start });
  steps.forEach((s, i) => {
    ctx.batch.add(G.box, M.wood, { x: s.x, y: s.y, z: s.z, ry: -s.angle, sx: 1.2, sy: 0.08, sz: 0.42 });
    if (i % 3 === 0) {
      const ox = x + Math.cos(s.angle) * (trunkR + 1.15), oz = z + Math.sin(s.angle) * (trunkR + 1.15);
      ctx.batch.add(G.cyl6, M.woodDark, { x: ox, y: s.y + 0.5, z: oz, sx: 0.03, sy: 1, sz: 0.03 });
      const n = steps[Math.min(steps.length - 1, i + 3)];
      const nx = x + Math.cos(n.angle) * (trunkR + 1.15), nz = z + Math.sin(n.angle) * (trunkR + 1.15);
      if (n !== s) beam(ctx, M.rope, { x: ox, y: s.y + 1, z: oz }, { x: nx, y: n.y + 1, z: nz }, 0.02);
    }
  });
}

/** Ponte de corda entre duas plataformas: tábuas na curva + cordas laterais. */
export function ropeBridge(ctx, { a, b, width = 1.2, sag = 0.9 }) {
  const { M } = ctx;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(4, Math.round(len / 0.42));
  const pts = bridgeCurve(a, b, sag, n);
  const ry = Math.atan2(b.x - a.x, b.z - a.z);
  const sx = Math.cos(ry), sz = -Math.sin(ry); // lado (perpendicular à ponte)
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1];
    const pitch = -Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
    if (i % 9 !== 4) { // uma tábua faltando de vez em quando
      ctx.batch.add(G.box, M.woodLight, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2, ry, rx: pitch, sx: width, sy: 0.05, sz: 0.34 });
    }
  }
  for (const s of [-1, 1]) {
    const off = (p, dy) => ({ x: p.x + sx * s * width * 0.55, y: p.y + dy, z: p.z + sz * s * width * 0.55 });
    for (let i = 0; i < n; i++) beam(ctx, M.rope, off(pts[i], 0.95), off(pts[i + 1], 0.95), 0.025);
    for (let i = 0; i <= n; i += 3) beam(ctx, M.rope, off(pts[i], 0), off(pts[i], 0.95), 0.015);
  }
}

// ============================ KALAHARI ============================

/** Tenda de couro em cúpula, com varetas saindo do topo e porta de pele. */
export function leatherTent(ctx, { x, z, r = 2.3, rot = 0 }) {
  const { M } = ctx;
  const y = ctx.terrain.heightAt(x, z) - 0.1;
  ctx.batch.add(G.sphere, M.leather, { x, y, z, sx: r, sy: r * 0.85, sz: r });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    ctx.batch.add(G.torus, M.woodDark, { x, y, z, ry: a, sx: r * 1.01, sy: r * 0.86, sz: r * 0.5 });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    beam(ctx, M.wood, { x: x + Math.cos(a) * 0.2, y: y + r * 0.7, z: z + Math.sin(a) * 0.2 }, { x: x + Math.cos(a) * 0.45, y: y + r * 0.85 + 0.9, z: z + Math.sin(a) * 0.45 }, 0.035);
  }
  const d = local(x, z, rot, 0, r * 0.95);
  ctx.batch.add(G.box, M.darkOpening, { x: d.x, y: y + 0.75, z: d.z, ry: rot, sx: 0.9, sy: 1.5, sz: 0.05 });
  const flap = local(x, z, rot, 0.55, r * 0.95); // aba de pele dobrada ao lado da porta
  ctx.batch.add(G.box, M.hide, { x: flap.x, y: y + 0.8, z: flap.z, ry: rot + 0.5, sx: 0.6, sy: 1.5, sz: 0.03 });
  ctx.collisions.addCircle(x, z, r, 'hut');
  return { door: local(x, z, rot, 0, r + 1), r: r + 0.3 };
}

/** Tótem de osso: mastro, crânio com chifres, ossos pendurados e fitas. */
export function boneTotem(ctx, { x, z, rot = 0 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z);
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  P(G.cyl6, M.woodDark, { ly: 1.7, w: 0.08, h: 3.4, d: 0.08 });
  P(G.cyl6, M.woodDark, { ly: 2.7, w: 0.05, h: 1.3, d: 0.05, rz: Math.PI / 2 });
  P(G.sphere, M.bone, { ly: 3.45, w: 0.24, h: 0.2, d: 0.3 });
  P(G.sphere, M.bone, { ly: 3.32, lz: 0.2, w: 0.14, h: 0.1, d: 0.18 });
  for (const s of [-1, 1]) {
    P(G.cone8, M.bone, { lx: s * 0.32, ly: 3.62, w: 0.06, h: 0.55, d: 0.06, rz: -s * 1.0 });
    P(G.sphere, M.darkOpening, { lx: s * 0.09, ly: 3.48, lz: 0.24, w: 0.05, h: 0.05, d: 0.03 });
  }
  for (let i = 0; i < 4; i++) {
    const lx = -0.5 + i * 0.33;
    P(G.cyl6, M.bone, { lx, ly: 2.35, w: 0.025, h: 0.45 + (i % 2) * 0.2, d: 0.025 });
    if (i % 2) P(G.box, M.clothRed, { lx: lx + 0.1, ly: 2.3, w: 0.06, h: 0.6, d: 0.01 });
  }
  ctx.collisions.addCircle(x, z, 0.25, 'totem');
}

// ============================ FLORESTA EQUATORIAL ============================

/**
 * Casa de palafita: assoalho sobre estacas na água, paredes de tábua,
 * telhado de palha, varanda e escadinha até a água.
 * @returns {{deck: {ax:number, az:number, bx:number, bz:number, width:number, y:number}, door: {x,z}}}
 *   `deck` entra em `game.pierDecks` (dá para andar na varanda)
 */
export function stiltHouse(ctx, { x, z, rot = 0, w = 5.5, d = 4.5, floorY = 1.6 }) {
  const { M } = ctx;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, 0, o);
  const W = w + 2.6, D = d + 2.6;
  P(G.box, M.wood, { ly: floorY, w: W, h: 0.16, d: D });
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    P(G.cyl, M.log, { lx: i * (W / 2 - 0.3), lz: j * (D / 2 - 0.3), ly: floorY - 2.6, w: 0.15, h: 5.2, d: 0.15 });
  }
  const wallH = wallHeight(2.4, 2.9);
  P(G.box, M.woodLight, { ly: floorY + wallH / 2 + 0.08, w, h: wallH, d });
  P(G.roofSlopes, M.thatch, { ly: floorY + wallH + 0.08, w: w + 1.6, h: 2.0, d: d + 1.8 });
  P(G.gables, M.woodLight, { ly: floorY + wallH + 0.08, w, h: 2.0 * (d / (d + 1.8)), d });
  P(G.box, M.darkOpening, { lz: d / 2 + 0.02, ly: floorY + 1.1, w: 0.95, h: 2.0, d: 0.04 });
  P(G.box, M.darkOpening, { lx: w / 2 + 0.02, ly: floorY + 1.5, w: 0.04, h: 0.7, d: 1.0 });
  for (const s of [-1, 1]) P(G.cyl6, M.woodDark, { lx: s * (W / 2 - 0.1), lz: D / 2 - 0.1, ly: floorY + 0.5, w: 0.04, h: 1, d: 0.04 });
  // Escadinha da varanda até a água (de frente).
  for (let k = 0; k < 6; k++) P(G.box, M.wood, { lz: D / 2 + 0.25 + k * 0.28, ly: floorY - 0.25 - k * 0.3, w: 1.0, h: 0.06, d: 0.26 });
  ctx.collisions.addBox(x, z, w / 2, d / 2, rot, 'house');
  const a = local(x, z, rot, 0, -D / 2), b = local(x, z, rot, 0, D / 2);
  return { deck: { ax: a.x, az: a.z, bx: b.x, bz: b.z, width: W, y: floorY + 0.09 }, door: local(x, z, rot, 0, D / 2) };
}

/** Canoa escavada, com banquinhos e remo, amarrada a um ponto (pilastra). */
export function canoe(ctx, { x, z, rot = 0, tie }) {
  const { M } = ctx;
  const y = 0.12;
  ctx.batch.add(G.hull, M.woodDark, { x, y: y + 0.3, z, ry: rot, sx: 0.5, sy: 0.38, sz: 2.4 });
  for (const lz of [-0.9, 0.8]) {
    const p = local(x, z, rot, 0, lz);
    ctx.batch.add(G.box, M.wood, { x: p.x, y: y + 0.24, z: p.z, ry: rot, sx: 0.8, sy: 0.05, sz: 0.2 });
  }
  const pd = local(x, z, rot, 0.15, 0);
  ctx.batch.add(G.box, M.wood, { x: pd.x, y: y + 0.32, z: pd.z, ry: rot + 0.15, sx: 0.12, sy: 0.03, sz: 1.6 });
  if (tie) {
    const bow = local(x, z, rot, 0, 2.2);
    beam(ctx, M.rope, { x: bow.x, y: y + 0.35, z: bow.z }, tie, 0.018);
  }
}

// ============================ RUÍNAS ============================

/** Árvore morta e queimada: tronco preto e galhos secos. */
export function deadTree(ctx, { x, z, h = 8 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z) - 0.2;
  const r = 0.28 + ctx.rnd() * 0.12;
  const lean = (ctx.rnd() - 0.5) * 0.15;
  ctx.batch.add(G.cyl6, M.charred, { x, y: y0 + h / 2, z, rz: lean, sx: r, sy: h, sz: r });
  for (let i = 0; i < 6; i++) {
    const yy = y0 + h * (0.45 + ctx.rnd() * 0.5);
    const a = ctx.rnd() * Math.PI * 2, len = 1.5 + ctx.rnd() * 2.5;
    beam(ctx, M.charred, { x, y: yy, z }, { x: x + Math.cos(a) * len, y: yy + len * (0.4 + ctx.rnd() * 0.5), z: z + Math.sin(a) * len }, 0.06 + ctx.rnd() * 0.05);
  }
  ctx.collisions.addCircle(x, z, r + 0.1, 'tree');
}

/** Torre partida: anel de pedra com alturas quebradas, entulho em volta. */
export function brokenTower(ctx, { x, z, r = 3.2, h = 11 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z) - 0.3;
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (i === 3 || i === 4) continue; // rombo na parede
    const hh = h * (0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + 0.4)) * (0.6 + ctx.rnd() * 0.4));
    ctx.batch.add(G.box, M.stoneDark, { x: x + Math.cos(a) * r, y: y0 + hh / 2, z: z + Math.sin(a) * r, ry: -a, sx: 0.8, sy: hh, sz: (Math.PI * 2 * r) / n + 0.1 });
  }
  for (let i = 0; i < 18; i++) {
    const a = ctx.rnd() * Math.PI * 2, rr = r + 0.5 + ctx.rnd() * 4.5;
    ctx.batch.add(G.rock, M.rubble, { x: x + Math.cos(a) * rr, y: y0 + 0.3, z: z + Math.sin(a) * rr, rx: ctx.rnd() * 3, ry: ctx.rnd() * 6, sx: 0.3 + ctx.rnd() * 0.6, sy: 0.25 + ctx.rnd() * 0.4, sz: 0.3 + ctx.rnd() * 0.6 });
  }
  ctx.collisions.addCircle(x, z, r + 0.5, 'ruin');
}

/** Vigas queimadas caídas e cinzas (dentro de casas destruídas). */
export function charredBeams(ctx, { x, z, n = 5 }) {
  const { M } = ctx;
  const y = ctx.terrain.heightAt(x, z);
  for (let i = 0; i < n; i++) {
    const a = ctx.rnd() * Math.PI * 2, len = 2 + ctx.rnd() * 3;
    const cx = x + (ctx.rnd() - 0.5) * 4, cz = z + (ctx.rnd() - 0.5) * 4;
    beam(ctx, M.charred, { x: cx - Math.cos(a) * len / 2, y: y + 0.1, z: cz - Math.sin(a) * len / 2 }, { x: cx + Math.cos(a) * len / 2, y: y + 0.1 + ctx.rnd() * 1.2, z: cz + Math.sin(a) * len / 2 }, 0.12, G.box);
  }
}

/**
 * Pedra de Kaelen: monólito rachado com runas que brilham em roxo.
 * @returns {{front: {x:number, z:number}}} onde o jogador fica para ler
 */
export function kaelenStone(ctx, { x, z, rot = 0 }) {
  const { M } = ctx;
  const y0 = ctx.terrain.heightAt(x, z) - 0.2;
  const P = (geo, mat, o) => part(ctx, geo, mat, x, z, rot, y0, o);
  P(G.box, M.basaltDark, { ly: 2.1, w: 1.4, h: 4.2, d: 0.9, rz: 0.04 });
  P(G.box, M.basaltDark, { ly: 4.45, lx: 0.25, w: 0.9, h: 0.6, d: 0.85, rz: -0.35 }); // topo partido
  for (let i = 0; i < 6; i++) P(G.box, M.eerie, { lz: 0.46, ly: 1.0 + i * 0.5, lx: (i % 2 ? 0.25 : -0.2), w: 0.5 - (i % 3) * 0.1, h: 0.07, d: 0.02 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ctx.batch.add(G.rock, M.basalt, { x: x + Math.cos(a) * 2.4, y: y0 + 0.35, z: z + Math.sin(a) * 2.4, ry: a, sx: 0.45, sy: 0.55, sz: 0.35 });
  }
  ctx.collisions.addBox(x, z, 0.8, 0.55, rot, 'ruin');
  return { front: local(x, z, rot, 0, 2) };
}

/**
 * Luz errante: bola roxa que flutua (animada pela vila).
 * @returns {THREE.Mesh} com userData { home, phase }
 */
export function wisp(ctx, { x, z, y }) {
  const m = new THREE.Mesh(G.sphere, ctx.M.eerie);
  m.scale.setScalar(0.16);
  m.position.set(x, y, z);
  m.userData = { home: { x, y, z }, phase: ctx.rnd() * 10, base: m.scale.clone() };
  ctx.dynamic.add(m);
  return m;
}
