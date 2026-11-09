import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';
import { Mechanics } from '../systems/Mechanics.js';

/**
 * OÁSIS DE AL-ZAHIR — cidade-oásis no centro do Deserto.
 * Lago com palmeiras no meio e um bulevar de pedra em volta; seis ruas
 * saem do lago, cobertas por toldos de tecido colorido. Nas ruas perto do
 * lago ficam as feiras de especiarias (barracas, estantes, sacos); para
 * fora, quarteirões de adobe de teto reto com 1 ou 2 andares (Poisson Disk,
 * de frente para a rua). Tendas das caravanas perto da entrada.
 */
export function buildAlZahir(game) {
  const v = new Village(game, VILLAGES.alZahir, 307);
  const { ctx } = v;
  const { M } = ctx;
  const cx = v.x, cz = v.z, R = v.radius;
  const pondR = 16;

  // Lago no centro: areia molhada, pedras, juncos e palmeiras.
  v.paintDisc(cx, cz, pondR + 8, 0x8a6a44, 0.75);
  X.oasisPond(ctx, { x: cx, z: cz, r: pondR, plants: v.plants });
  v.reserve(cx, cz, pondR + 3);

  // Bulevar de pedra em volta do lago, com lanternas.
  const ringR = pondR + 9;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, b = ((k + 1) / 24) * Math.PI * 2;
    const ax = cx + Math.cos(a) * ringR, az = cz + Math.sin(a) * ringR, bx = cx + Math.cos(b) * ringR, bz = cz + Math.sin(b) * ringR;
    v.street(ax, az, bx, bz, 5, 0xa07a50);
    X.pavePath(ctx, { ax, az, bx, bz, width: 4, kind: 'stone', mat: M.sandstone });
    if (k % 3 === 0) {
      const x = cx + Math.cos(a) * (ringR + 3.2), z = cz + Math.sin(a) * (ringR + 3.2);
      v.addLamp(X.lampPost(ctx, { x, z, rot: -a }));
    }
  }

  // Seis ruas saindo do lago, cobertas por toldos de tecido.
  const cloths = [M.clothRed, M.clothBlue, M.clothYellow, M.clothGreen];
  const streets = [0.35, 1.4, 2.45, 3.5, 4.55, 5.6];
  streets.forEach((a, si) => {
    const ax = cx + Math.cos(a) * (ringR + 2), az = cz + Math.sin(a) * (ringR + 2);
    const bx = cx + Math.cos(a) * (R + 18), bz = cz + Math.sin(a) * (R + 18);
    v.street(ax, az, bx, bz, 5.5, 0xa07a50);
    const nx = -Math.sin(a), nz = Math.cos(a);
    for (let d = ringR + 6, k = 0; d < R - 30; d += 7, k++) {
      if (k % 4 === 3) continue; // um respiro entre os toldos
      const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
      X.awning(ctx, { ax: px + nx * 3.4, az: pz + nz * 3.4, bx: px - nx * 3.4, bz: pz - nz * 3.4, y: 4.6, width: 4.2, cloth: cloths[(k + si) % 4] });
    }
    for (let d = ringR + 14, side = 1; d < R - 6; d += 19, side = -side) {
      const x = cx + Math.cos(a) * d + nx * side * 3.6, z = cz + Math.sin(a) * d + nz * side * 3.6;
      v.addLamp(X.lampPost(ctx, { x, z, rot: Math.atan2(-nx * side, -nz * side) + Math.PI / 2 }));
    }
  });

  // Feiras de especiarias: barracas e estantes dos dois lados de 3 ruas.
  const marketStreets = [streets[0], streets[2], streets[4]];
  let seller = 0;
  for (const a of marketStreets) {
    const nx = -Math.sin(a), nz = Math.cos(a);
    for (let d = ringR + 7; d < ringR + 52; d += 5.5) {
      for (const side of [-1, 1]) {
        const x = cx + Math.cos(a) * d + nx * side * 5.2, z = cz + Math.sin(a) * d + nz * side * 5.2;
        if (!v.isFree(x, z, 1.6)) continue;
        const rot = Math.atan2(-nx * side, -nz * side);
        if (v.rnd() < 0.7) {
          B.marketStall(ctx, { x, z, rot });
          const f = B.local(x, z, rot, 0, 1.9);
          X.spiceSacks(ctx, { x: f.x, z: f.z, rot, n: 4 + Math.floor(v.rnd() * 3) });
        } else {
          X.shelf(ctx, { x, z, rot });
        }
        v.reserve(x, z, 2.6);
        if (v.rnd() < 0.4) v.props.push({ type: 'sack', ...B.local(x, z, rot, 1.6, 0.6), rot: v.rnd() * 3 });
        if (seller < 6 && v.rnd() < 0.25) {
          const p = B.local(x, z, rot, 0, -0.4);
          v.addNPC({ id: `alzahir-vendedor-${seller}`, name: 'Vendedor', title: 'Feira de especiarias', look: { robe: true, hat: 'wrap' }, x: p.x, z: p.z, facing: rot });
          seller++;
        }
      }
    }
  }
  const rp = B.local(cx + Math.cos(streets[0]) * (ringR + 4), cz + Math.sin(streets[0]) * (ringR + 4), 0, 0, 0);
  v.addNPC({
    id: 'alzahir-especiarias', name: 'Rashid', title: 'Mercado de Especiarias',
    look: { shirt: 0xd9a02a, robe: true, hat: 'wrap' }, x: rp.x, z: rp.z, facing: streets[0] + Math.PI,
    onInteract: (g) => Mechanics.shopkeeper(g, { name: 'Rashid, o especieiro', village: 'Oásis de Al-Zahir' }),
  });

  // Tendas das caravanas perto da entrada principal (rua 1).
  const ta = streets[1];
  for (let k = 0; k < 16; k++) {
    const d = R - 34 + (k % 4) * 7, side = k < 8 ? 1 : -1;
    const a = ta + side * (0.12 + Math.floor((k % 8) / 4) * 0.08);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (!v.isFree(x, z, 3)) continue;
    const info = X.clothTent(ctx, { x, z, rot: ta + Math.PI / 2 * side + (v.rnd() - 0.5) * 0.3, cloth: cloths[k % 4], w: 5 + v.rnd() * 1.5, d: 3.8 });
    v.reserve(x, z, info.r + 0.5);
  }

  // Quarteirões de adobe de teto reto: 1 ou 2 andares.
  const walls = [M.adobeOchre, M.adobePastel, M.adobeWhite, M.adobeRed];
  v.scatterHouses((x, z, rot) => {
    const w = 6.5 + v.rnd() * 3, d = 5.5 + v.rnd() * 2.5;
    const wall = walls[Math.floor(v.rnd() * walls.length)];
    const h = 3 + v.rnd() * 0.8;
    const info = B.house(ctx, { x, z, rot, w, d, h, wall, roof: 'flat' });
    if (v.rnd() < 0.42) adobeUpperFloor(ctx, { x, z, rot, w, d, wall, y0: info.y0, h });
    return { ...info, w, d, r: Math.hypot(w, d) / 2 };
  });

  // Poço das caravanas e bancos no bulevar.
  const wa = streets[1], wx = cx + Math.cos(wa) * (R - 12) + 6, wz = cz + Math.sin(wa) * (R - 12);
  if (v.isFree(wx, wz, 2)) B.well(ctx, { x: wx, z: wz });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2, x = cx + Math.cos(a) * (pondR + 3.6), z = cz + Math.sin(a) * (pondR + 3.6);
    B.bench(ctx, { x, z, rot: Math.atan2(cx - x, cz - z) + Math.PI });
  }

  v.addElder(cx + Math.cos(2.8) * (pondR + 2.6), cz + Math.sin(2.8) * (pondR + 2.6), 2.8 + Math.PI);
  v.addWanderers(26, { robe: true, hat: 'wrap' });

  v.finalize();
  return v;
}

/**
 * Segundo andar de uma casa de adobe de teto reto: bloco menor recuado,
 * janelas, parapeito com ameias (terraço) e escadinha externa.
 */
function adobeUpperFloor(ctx, { x, z, rot, w, d, wall, y0, h }) {
  const { M } = ctx;
  const top = y0 + 0.25 + B.wallHeight(h); // laje do térreo (o parapeito de 0,6 m fica em volta)
  const P = (geo, mat, o) => B.part(ctx, geo, mat, x, z, rot, top, o);
  const uw = w * 0.62, ud = d * 0.68, uh = 3.1;
  P(B.G.box, wall, { lx: -w * 0.12, lz: -d * 0.1, ly: uh / 2, w: uw, h: uh, d: ud });
  P(B.G.box, wall, { lx: -w * 0.12, lz: -d * 0.1, ly: uh + 0.3, w: uw + 0.2, h: 0.6, d: ud + 0.2 });
  for (let k = -1; k <= 1; k++) P(B.G.box, wall, { lx: -w * 0.12 + k * uw * 0.33, lz: -d * 0.1 + ud / 2 + 0.05, ly: uh + 0.85, w: 0.4, h: 0.5, d: 0.25 });
  P(B.G.box, M.darkOpening, { lx: -w * 0.12, lz: -d * 0.1 + ud / 2 + 0.03, ly: 1.5, w: 0.9, h: 1.1, d: 0.04 });
  // Escada de mão na lateral até o terraço (subível) + terraço andável.
  for (const sd of [-0.28, 0.28]) P(B.G.cyl6, M.woodDark, { lx: w / 2 + 0.12, lz: d * 0.15 + sd, ly: -(top - y0) / 2 + 0.3, w: 0.05, h: top - y0 + 0.6, d: 0.05 });
  for (let yy = y0 + 0.4; yy < top; yy += 0.4) P(B.G.cyl6, M.wood, { lx: w / 2 + 0.12, lz: d * 0.15, ly: yy - top, w: 0.03, h: 0.6, d: 0.03, rx: Math.PI / 2 });
  ctx.surfaces?.addBox({ x, z, hw: w / 2 - 0.25, hd: d / 2 - 0.25, rot, y: top + 0.02 });
  const up = B.local(x, z, rot, -w * 0.12, -d * 0.1);
  ctx.collisions.setHeightRange(ctx.collisions.addBox(up.x, up.z, uw / 2, ud / 2, rot, 'upper'), top, top + uh + 0.6);
  const foot = B.local(x, z, rot, w / 2 + 0.12, d * 0.15), exit = B.local(x, z, rot, w / 2 - 0.7, d * 0.15);
  ctx.ladders?.add({ x: foot.x, z: foot.z, rot: rot + Math.PI / 2, y0: y0 + 0.25, y1: top + 0.02, exit: { x: exit.x, y: top + 0.02, z: exit.z } });
}
