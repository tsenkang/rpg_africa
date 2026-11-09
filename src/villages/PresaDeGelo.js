import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';

/**
 * ACAMPAMENTO PRESA DE GELO — Taiga, montanhas do norte.
 * Fortaleza rústica: paliçada de troncos com três portões e torres de vigia
 * altas; dentro, dezenas de cabanas de tora (madeira comum e congelada, uma
 * parte com dois andares) espalhadas organicamente, viradas para as ruas de
 * pedra com postes de lanterna. No meio, a praça com a grande fogueira e
 * quatro menores (luz laranja dinâmica). Varais de caça, lenha, carroças,
 * varais de roupa e a entrada da mina completam o cenário.
 */
export function buildPresaDeGelo(game) {
  const v = new Village(game, VILLAGES.presaDeGelo, 211);
  const { ctx } = v;
  const { M } = ctx;
  const cx = v.x, cz = v.z, R = v.radius;
  const gates = [-Math.PI / 2 + 0.4, 2.6, 0.5]; // norte (mina), sudoeste, leste

  // Praça de pedra com a grande fogueira e quatro menores em volta.
  B.plaza(ctx, { x: cx, z: cz, r: 15, mat: M.cobble });
  v.paintDisc(cx, cz, 18, 0x5e554c, 0.85);
  v.addFire(X.bonfire(ctx, { x: cx, z: cz, size: 2.0 }), { intensity: 70, range: 34 });
  v.reserve(cx, cz, 16);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = cx + Math.cos(a) * 10.5, z = cz + Math.sin(a) * 10.5;
    v.addFire(X.bonfire(ctx, { x, z, size: 0.9 }), { intensity: 28, range: 18 });
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const x = cx + Math.cos(a) * 5.2, z = cz + Math.sin(a) * 5.2;
    ctx.batch.add(B.G.cyl, M.frozenLog, { x, y: ctx.terrain.heightAt(x, z) + 0.28, z, ry: -a, rz: Math.PI / 2, sx: 0.28, sy: 2.4, sz: 0.28 });
  }

  // Ruas de pedra da praça até cada portão, com postes de lanterna.
  for (const g of gates) {
    const ax = cx + Math.cos(g) * 16, az = cz + Math.sin(g) * 16;
    const bx = cx + Math.cos(g) * (R + 18), bz = cz + Math.sin(g) * (R + 18);
    v.street(ax, az, bx, bz, 4.5, 0x5a5650);
    X.pavePath(ctx, { ax, az, bx: cx + Math.cos(g) * (R - 4), bz: cz + Math.sin(g) * (R - 4), width: 3.6, kind: 'stone' });
    const nx = -Math.sin(g), nz = Math.cos(g);
    for (let d = 24, side = 1; d < R - 8; d += 15, side = -side) {
      const x = cx + Math.cos(g) * d + nx * side * 3, z = cz + Math.sin(g) * d + nz * side * 3;
      v.addLamp(X.lampPost(ctx, { x, z, rot: Math.atan2(-nx * side, -nz * side) + Math.PI / 2 }));
      v.reserve(x, z, 0.6);
    }
  }
  // Anel interno de terra batida ligando as ruas.
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2, b = ((k + 1) / 20) * Math.PI * 2, r = 52;
    v.street(cx + Math.cos(a) * r, cz + Math.sin(a) * r, cx + Math.cos(b) * r, cz + Math.sin(b) * r, 3.2, 0x5a5048);
  }

  // Paliçada de troncos com os três portões e torres de vigia altas.
  B.palisade(ctx, { x: cx, z: cz, r: R - 6, height: 5.2, gates, gateWidth: 9 });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.17;
    if (gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.18)) continue;
    const x = cx + Math.cos(a) * (R - 10), z = cz + Math.sin(a) * (R - 10);
    X.watchTower(ctx, { x, z, rot: Math.atan2(cx - x, cz - z), h: 13 });
    v.reserve(x, z, 3.5);
  }
  for (const g of gates) { // torres de guarda dos dois lados de cada portão
    for (const s of [-1, 1]) {
      const a = g + s * 0.09, x = cx + Math.cos(a) * (R - 10), z = cz + Math.sin(a) * (R - 10);
      X.watchTower(ctx, { x, z, rot: Math.atan2(cx - x, cz - z), h: 11 });
      v.reserve(x, z, 3.5);
    }
  }

  // Entrada da mina (dentro da paliçada, perto do portão norte).
  const mineA = gates[0] + 0.32;
  const mx = cx + Math.cos(mineA) * (R - 24), mz = cz + Math.sin(mineA) * (R - 24);
  const my = ctx.terrain.heightAt(mx, mz);
  const mrot = Math.atan2(cx - mx, cz - mz);
  const back = B.local(mx, mz, mrot, 0, -4);
  ctx.batch.add(B.G.rock, M.stoneDark, { x: back.x, y: my + 1.5, z: back.z, ry: mrot, sx: 8, sy: 5.5, sz: 6 });
  B.part(ctx, B.G.box, M.darkOpening, mx, mz, mrot, my, { lz: 1.1, ly: 1.4, w: 2.6, h: 2.8, d: 0.1 });
  for (const s of [-1, 1]) B.part(ctx, B.G.cyl, M.log, mx, mz, mrot, my, { lx: s * 1.5, lz: 1.3, ly: 1.6, w: 0.17, h: 3.2, d: 0.17 });
  B.part(ctx, B.G.cyl, M.log, mx, mz, mrot, my, { lz: 1.3, ly: 3.15, w: 0.17, h: 3.6, d: 0.17, rz: Math.PI / 2 });
  ctx.collisions.addCircle(back.x, back.z, 6, 'mine');
  v.reserve(mx, mz, 9);
  X.cart(ctx, { ...B.local(mx, mz, mrot, 4, 4), rot: mrot + 0.4 });
  for (let i = 0; i < 4; i++) B.crate(ctx, { ...B.local(mx, mz, mrot, -3.5 + i * 0.9, 3.4), s: 0.7, rot: mrot });

  // Dezenas de cabanas de tora (Poisson Disk), 1/3 com dois andares.
  v.scatterHouses((x, z, rot) => {
    const w = 6 + v.rnd() * 3, d = 5 + v.rnd() * 2;
    const info = X.logCabin(ctx, { x, z, rot, w, d, stories: v.rnd() < 0.33 ? 2 : 1, logMat: v.rnd() < 0.5 ? M.frozenLog : M.log });
    // Lenha do lado da cabana.
    const wp = B.local(x, z, rot, w / 2 + 1.3, 0);
    if (v.rnd() < 0.55 && v.isFree(wp.x, wp.z, 1)) { X.woodpile(ctx, { x: wp.x, z: wp.z, rot, logMat: M.frozenLog }); v.reserve(wp.x, wp.z, 1.1); }
    return info;
  });

  // Varais de caça, de roupa, carroças, toras soltas e lanternas no chão.
  const spot = (pad, rMin = 18, rMax = R - 14) => {
    for (let t = 0; t < 30; t++) {
      const a = v.rnd() * Math.PI * 2, r = rMin + v.rnd() * (rMax - rMin);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (v.isFree(x, z, pad)) return { x, z, a };
    }
    return null;
  };
  for (let i = 0; i < 12; i++) { const p = spot(2.6); if (!p) break; X.hideRack(ctx, { x: p.x, z: p.z, rot: p.a }); v.reserve(p.x, p.z, 2.6); }
  for (let i = 0; i < 6; i++) {
    const p = spot(3.5); if (!p) break;
    const b = { x: p.x + Math.cos(p.a + 1.6) * 6, z: p.z + Math.sin(p.a + 1.6) * 6 };
    if (!v.isFree(b.x, b.z, 1)) continue;
    X.clothesLine(ctx, { ax: p.x, az: p.z, bx: b.x, bz: b.z });
    v.reserve((p.x + b.x) / 2, (p.z + b.z) / 2, 3.2);
  }
  for (let i = 0; i < 4; i++) { const p = spot(2); if (!p) break; X.cart(ctx, { x: p.x, z: p.z, rot: p.a }); v.reserve(p.x, p.z, 2); }
  for (let i = 0; i < 22; i++) { const p = spot(0.9, 14); if (!p) break; v.props.push({ type: 'log', x: p.x, z: p.z, rot: p.a }); v.reserve(p.x, p.z, 0.9); }
  for (let i = 0; i < 8; i++) { const p = spot(0.4, 14, 60); if (!p) break; v.props.push({ type: 'lantern', x: p.x, z: p.z }); }

  // Moradores: o chefe perto do fogo, caçadores nas fogueiras e nas ruas.
  v.addElder(cx + 3.6, cz + 2.8, Math.atan2(-3.6, -2.8));
  const fur = { shirt: 0x5a4632, pants: 0x2e2a26, hat: 'wrap' };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    v.addNPC({ id: `presa-cacador-${i}`, name: i % 3 ? 'Caçador' : 'Mineiro', look: fur, x: cx + Math.cos(a) * 7.4, z: cz + Math.sin(a) * 7.4, facing: a + Math.PI });
  }
  v.addWanderers(14, fur);

  v.finalize();
  return v;
}
