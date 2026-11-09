import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';

/**
 * ACAMPAMENTO PRESA DE GELO — Taiga, montanhas do norte.
 * Caçadores e mineiros: poucas cabanas de tora viradas para a grande
 * fogueira central (luz laranja dinâmica), duas fogueiras menores, torres de
 * vigia na borda, varais de peles e a entrada da mina.
 */
export function buildPresaDeGelo(game) {
  const v = new Village(game, VILLAGES.presaDeGelo, 211);
  const { ctx } = v;
  const { M } = ctx;
  const cx = v.x, cz = v.z;

  // Chão de terra pisada com neve em volta do fogo.
  v.paintDisc(cx, cz, 16, 0x5e554c, 0.85);
  v.addFire(X.bonfire(ctx, { x: cx, z: cz, size: 1.6 }), { intensity: 60, range: 30 });
  v.reserve(cx, cz, 6);
  for (const [dx, dz] of [[-11, 7], [12, -6]]) {
    v.addFire(X.bonfire(ctx, { x: cx + dx, z: cz + dz, size: 0.85 }), { intensity: 28, range: 18 });
    v.reserve(cx + dx, cz + dz, 3);
  }
  // Toras para sentar em volta do fogo.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const x = cx + Math.cos(a) * 4.2, z = cz + Math.sin(a) * 4.2;
    ctx.batch.add(B.G.cyl, M.log, { x, y: ctx.terrain.heightAt(x, z) + 0.25, z, ry: -a, rz: Math.PI / 2, sx: 0.28, sy: 2.2, sz: 0.28 });
  }

  // Trilhas até a mina e às torres (moradores andam por elas).
  const mineA = -Math.PI / 2 + 0.4; // norte, montanha acima
  const mx = cx + Math.cos(mineA) * 55, mz = cz + Math.sin(mineA) * 55;
  v.street(cx + Math.cos(mineA) * 7, cz + Math.sin(mineA) * 7, mx, mz, 3, 0x5a5048);
  for (const a of [0.5, 2.6, 4.2]) {
    v.street(cx + Math.cos(a) * 7, cz + Math.sin(a) * 7, cx + Math.cos(a) * 54, cz + Math.sin(a) * 54, 2.6, 0x5a5048);
  }

  // Cabanas de tora em anel irregular, de frente para o fogo.
  const cabins = 8;
  for (let k = 0; k < cabins; k++) {
    const a = (k / cabins) * Math.PI * 2 + (v.rnd() - 0.5) * 0.35;
    const r = 24 + v.rnd() * 9;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const w = 6 + v.rnd() * 2.5, d = 5 + v.rnd() * 1.5;
    if (!v.isFree(x, z, Math.hypot(w, d) / 2)) continue;
    const rot = Math.atan2(cx - x, cz - z) + (v.rnd() - 0.5) * 0.4;
    const info = X.logCabin(ctx, { x, z, rot, w, d });
    v.reserve(x, z, info.r + 0.5);
    v.shapes.push({ type: 'segment', ax: info.door.x, az: info.door.z, bx: cx + Math.cos(a) * 8, bz: cz + Math.sin(a) * 8, width: 1.8, color: 0x5a5048, strength: 0.6 });
    // Lenha empilhada do lado da cabana.
    const wp = B.local(x, z, rot, w / 2 + 1.2, 0);
    if (v.isFree(wp.x, wp.z, 0.8)) {
      for (let i = 0; i < 6; i++) {
        ctx.batch.add(B.G.cyl, M.log, { x: wp.x, y: ctx.terrain.heightAt(wp.x, wp.z) + 0.15 + Math.floor(i / 3) * 0.28, z: wp.z, ry: rot, rx: Math.PI / 2, sx: 0.14, sy: 1.6, sz: 0.14 });
      }
      v.reserve(wp.x, wp.z, 1);
    }
  }

  // Varais de peles entre as cabanas.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.6, r = 15 + v.rnd() * 4;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!v.isFree(x, z, 2.4)) continue;
    X.hideRack(ctx, { x, z, rot: a + Math.PI / 2 });
    v.reserve(x, z, 2.4);
  }

  // Torres de vigia na borda.
  for (const a of [0.5, 2.6, 4.2]) {
    const x = cx + Math.cos(a) * 58, z = cz + Math.sin(a) * 58;
    X.watchTower(ctx, { x, z, rot: Math.atan2(cx - x, cz - z) });
    v.reserve(x, z, 3);
  }

  // Entrada da mina: monte de pedra, armação de madeira e boca escura.
  const my = ctx.terrain.heightAt(mx, mz);
  const mrot = Math.atan2(cx - mx, cz - mz);
  const back = B.local(mx, mz, mrot, 0, -4);
  ctx.batch.add(B.G.rock, M.stoneDark, { x: back.x, y: my + 1.5, z: back.z, ry: mrot, sx: 8, sy: 5.5, sz: 6 });
  B.part(ctx, B.G.box, M.darkOpening, mx, mz, mrot, my, { lz: 1.1, ly: 1.4, w: 2.6, h: 2.8, d: 0.1 });
  for (const s of [-1, 1]) B.part(ctx, B.G.cyl, M.log, mx, mz, mrot, my, { lx: s * 1.5, lz: 1.3, ly: 1.6, w: 0.17, h: 3.2, d: 0.17 });
  B.part(ctx, B.G.cyl, M.log, mx, mz, mrot, my, { lz: 1.3, ly: 3.15, w: 0.17, h: 3.6, d: 0.17, rz: Math.PI / 2 });
  for (let i = 0; i < 3; i++) B.crate(ctx, { ...B.local(mx, mz, mrot, -3 + i * 0.9, 3), s: 0.7, rot: mrot });
  ctx.collisions.addCircle(back.x, back.z, 6, 'mine');
  v.reserve(mx, mz, 8);

  // Moradores: o chefe perto do fogo, caçadores e mineiros.
  v.addElder(cx + 3.2, cz + 2.4, Math.atan2(-3.2, -2.4));
  const fur = { shirt: 0x5a4632, pants: 0x2e2a26, hat: 'wrap' };
  for (let i = 0; i < 4; i++) {
    const a = v.rnd() * Math.PI * 2;
    v.addNPC({ id: `presa-cacador-${i}`, name: 'Caçador', look: fur, x: cx + Math.cos(a) * 6.5, z: cz + Math.sin(a) * 6.5, facing: a + Math.PI });
  }
  v.addWanderers(5, fur);

  v.finalize();
  return v;
}
