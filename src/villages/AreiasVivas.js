import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';
import { poissonAnnulus } from './Layout.js';

/**
 * ACAMPAMENTO DAS AREIAS VIVAS — Kalahari (transição com a savana).
 * Grande acampamento nômade: três fogueiras comunais, dezenas de tendas de
 * couro (algumas grandes, do conselho), quatro áreas de suprimentos
 * (sacos, caixotes, barris, carroças, estantes), três cercados com burros
 * de carga, varais e tótens de osso — quatro gigantes nos pontos cardeais
 * e um anel de tótens menores marcando o território.
 */
export function buildAreiasVivas(game) {
  const v = new Village(game, VILLAGES.areiasVivas, 503);
  const { ctx } = v;
  const cx = v.x, cz = v.z, R = v.radius;

  // Fogueiras comunais (centro + duas) e trilhas de terra entre elas.
  const fires = [[0, 0, 1.3], [-24, 14, 0.9], [22, 18, 0.9]];
  for (const [dx, dz, s] of fires) {
    v.paintDisc(cx + dx, cz + dz, 9 * s, 0x7a5434, 0.7);
    v.addFire(X.bonfire(ctx, { x: cx + dx, z: cz + dz, size: s }), { intensity: 40 * s, range: 22 });
    v.reserve(cx + dx, cz + dz, 4.5 * s);
  }
  for (const a of [0.3, 1.9, 3.4, 4.9]) {
    v.street(cx + Math.cos(a) * 6, cz + Math.sin(a) * 6, cx + Math.cos(a) * (R + 10), cz + Math.sin(a) * (R + 10), 3.2, 0x8a6040);
  }

  // Cercados com os animais de carga.
  for (const pa of [0.9, 2.7, 5.4]) {
    const px = cx + Math.cos(pa) * (R - 26), pz = cz + Math.sin(pa) * (R - 26);
    if (!v.isFree(px, pz, 9)) continue;
    B.corral(ctx, { x: px, z: pz, rot: pa, w: 18, d: 12 });
    v.reserve(px, pz, 11);
    for (let i = 0; i < 4; i++) {
      const p = B.local(px, pz, pa, (v.rnd() - 0.5) * 12, (v.rnd() - 0.5) * 7);
      v.animals.push(B.animal(ctx, { x: p.x, z: p.z, kind: 'donkey' }));
    }
  }

  // Áreas de suprimentos: pilhas de sacos/caixotes/barris, estantes e carroças.
  for (const sa of [0.0, 1.55, 3.15, 4.7]) {
    const sx = cx + Math.cos(sa) * 34, sz = cz + Math.sin(sa) * 34;
    if (!v.isFree(sx, sz, 5)) continue;
    v.paintDisc(sx, sz, 6, 0x7a5434, 0.55);
    X.cart(ctx, { ...B.local(sx, sz, sa, -2.8, 0), rot: sa + 0.5 });
    X.shelf(ctx, { ...B.local(sx, sz, sa, 2.4, -1.6), rot: sa + Math.PI / 2 });
    for (let i = 0; i < 9; i++) {
      const p = B.local(sx, sz, sa, 0.8 + (i % 3) * 0.75, -0.5 + Math.floor(i / 3) * 0.75);
      v.props.push({ type: i % 3 === 2 ? 'barrel' : i % 2 ? 'crate' : 'sack', ...p, rot: v.rnd() * 3 });
    }
    v.reserve(sx, sz, 6);
  }

  // Dezenas de tendas de couro (Poisson Disk), porta virada para a fogueira mais perto.
  const tents = poissonAnnulus({ cx, cz, inner: 10, outer: R - 14, spacing: 8.5, rng: v.rnd, accept: (x, z) => v.isFree(x, z, 3) });
  tents.forEach((p) => {
    const f = fires.reduce((best, [dx, dz]) => (Math.hypot(p.x - cx - dx, p.z - cz - dz) < Math.hypot(p.x - best.x, p.z - best.z) ? { x: cx + dx, z: cz + dz } : best), { x: cx, z: cz });
    const big = v.rnd() < 0.15;
    const info = X.leatherTent(ctx, { x: p.x, z: p.z, r: big ? 4 + v.rnd() * 0.8 : 2 + v.rnd() * 1.1, rot: Math.atan2(f.x - p.x, f.z - p.z) });
    v.reserve(p.x, p.z, info.r + 0.6);
  });

  // Varais de carne e de peles.
  const free = (pad, r0, r1) => {
    for (let t = 0; t < 25; t++) {
      const a = v.rnd() * Math.PI * 2, r = r0 + v.rnd() * (r1 - r0);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (v.isFree(x, z, pad)) return { x, z, a };
    }
    return null;
  };
  for (let k = 0; k < 14; k++) {
    const p = free(2.6, 12, R - 16); if (!p) break;
    if (k % 2) B.dryingRack(ctx, { x: p.x, z: p.z, rot: p.a }); else X.hideRack(ctx, { x: p.x, z: p.z, rot: p.a + Math.PI / 2 });
    v.reserve(p.x, p.z, 2.6);
  }
  for (let k = 0; k < 16; k++) { const p = free(0.6, 8, R - 10); if (p) v.props.push({ type: 'sack', x: p.x, z: p.z, rot: p.a }); }

  // Tótens: quatro gigantes nos pontos cardeais + anel de tótens menores.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    const x = cx + Math.cos(a) * (R - 3), z = cz + Math.sin(a) * (R - 3);
    X.boneTotem(ctx, { x, z, rot: Math.atan2(x - cx, z - cz), scale: 2.8 });
  }
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const x = cx + Math.cos(a) * (R - 4), z = cz + Math.sin(a) * (R - 4);
    if (!v.isFree(x, z, 0.6)) continue;
    X.boneTotem(ctx, { x, z, rot: Math.atan2(x - cx, z - cz), scale: 0.9 + v.rnd() * 0.4 });
  }

  v.addElder(cx - 3.4, cz + 2.8, Math.atan2(3.4, -2.8));
  fires.forEach(([dx, dz], fi) => {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + fi;
      v.addNPC({ id: `areias-${fi}-${i}`, name: i % 2 ? 'Coletora' : 'Caçador', look: { shirt: 0x8a5a2a, pants: 0x5a4a3a }, x: cx + dx + Math.cos(a) * 5.2, z: cz + dz + Math.sin(a) * 5.2, facing: a + Math.PI });
    }
  });
  v.addWanderers(8, { shirt: 0x8a5a2a });

  v.finalize();
  return v;
}
