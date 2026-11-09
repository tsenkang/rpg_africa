import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';
import { poissonAnnulus } from './Layout.js';

/**
 * POVOADO DA COPA ALTA — Floresta Tropical.
 * Rede vertical densa: ~30 árvores gigantes espalhadas (Poisson Disk), cada
 * uma com uma casa na copa (alturas variadas), ligadas por uma teia de
 * pontes de corda — cada árvore com as 2 vizinhas mais próximas, a
 * árvore-mãe com 4. Escadas em caracol em várias árvores.
 * TUDO É ANDÁVEL: plataformas, pontes e degraus entram em `game.surfaces`
 * (chão com andares) e no mundo de física; a cabana em cima é parede só lá
 * em cima — dá para passar por baixo das plataformas no chão.
 */
export function buildCopaAlta(game) {
  const v = new Village(game, VILLAGES.copaAlta, 409);
  const { ctx } = v;
  const cx = v.x, cz = v.z, R = v.radius;

  const spots = poissonAnnulus({ cx, cz, inner: 18, outer: R - 12, spacing: 21, rng: v.rnd })
    .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)).slice(0, 30);
  const trees = [{ x: cx, z: cz, h: 32, r: 2.1, floor: 13.5, R: 6 }, ...spots.map((p) => ({
    x: p.x, z: p.z, h: 24 + v.rnd() * 7, r: 1.4 + v.rnd() * 0.45, floor: 9 + v.rnd() * 5, R: 4.4 + v.rnd() * 0.6,
  }))];

  const houses = trees.map((t) => {
    const info = X.giantTree(ctx, t);
    const y = info.y0 + t.floor;
    X.treeHouse(ctx, { x: t.x, z: t.z, y, R: t.R, trunkR: t.r });
    v.reserve(t.x, t.z, t.R + 2);
    // Lanterna presa no guarda-corpo (luz real quando perto).
    const lx = t.x + t.R - 0.4, lz = t.z;
    ctx.batch.add(B.G.box, ctx.M.runeGlow, { x: lx, y: y + 1.3, z: lz, sx: 0.16, sy: 0.26, sz: 0.16 });
    v.fires.push({ x: lx, y: y + 1.3, z: lz, color: 0xffc77a, intensity: 12, range: 13 });
    return { x: t.x, z: t.z, y, R: t.R, trunkR: t.r, y0: info.y0 };
  });

  // Teia de pontes: vizinhas mais próximas (sem repetir pares).
  const linked = new Set();
  const edge = (i, j) => {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (linked.has(key)) return;
    linked.add(key);
    const a = houses[i], b = houses[j];
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    const ux = dx / d, uz = dz / d;
    X.ropeBridge(ctx, {
      a: { x: a.x + ux * (a.R - 0.25), y: a.y + 0.12, z: a.z + uz * (a.R - 0.25) },
      b: { x: b.x - ux * (b.R - 0.25), y: b.y + 0.12, z: b.z - uz * (b.R - 0.25) },
      sag: 0.5 + d * 0.02,
    });
  };
  houses.forEach((h, i) => {
    const near = houses.map((o, j) => ({ j, d: Math.hypot(o.x - h.x, o.z - h.z) }))
      .filter((n) => n.j !== i && n.d < 36).sort((a, b) => a.d - b.d);
    near.slice(0, i === 0 ? 4 : 2).forEach((n) => edge(i, n.j));
  });

  // Escadas em caracol: árvore-mãe e uma a cada quatro.
  houses.forEach((h, i) => {
    if (i !== 0 && i % 4 !== 1) return;
    X.spiralStair(ctx, { x: h.x, z: h.z, trunkR: h.trunkR + 0.25, y0: h.y0 + 0.6, y1: h.y - 0.2, start: i });
  });

  // Chão: solo escuro de folhas, bananeiras, arbustos, cestos e galhos.
  v.paintDisc(cx, cz, R - 10, 0x3e3424, 0.5);
  const free = (pad) => {
    for (let t = 0; t < 20; t++) {
      const a = v.rnd() * Math.PI * 2, r = 4 + v.rnd() * (R - 8);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (v.isFree(x, z, pad)) return { x, z };
    }
    return null;
  };
  for (let i = 0; i < 140; i++) {
    const p = free(1.2); if (!p) continue;
    v.plants.push({ type: v.rnd() < 0.5 ? 'banana' : 'bush', x: p.x, z: p.z, s: 0.7 + v.rnd() * 0.5, ry: v.rnd() * 6 });
    v.reserve(p.x, p.z, 1);
  }
  for (let i = 0; i < 14; i++) { const p = free(0.6); if (p) v.props.push({ type: 'sack', ...p, rot: v.rnd() * 3 }); }
  for (let i = 0; i < 24; i++) { const p = free(0.8); if (p) v.props.push({ type: v.rnd() < 0.5 ? 'branch' : 'log', ...p, rot: v.rnd() * 3 }); }

  // A avó na base da escada principal; vigias embaixo; moradores lá em cima.
  v.addElder(cx + 7.4, cz + 1.5, -Math.PI / 2);
  for (const [dx, dz] of [[-6, 5], [5, -6.5]]) {
    v.addNPC({ id: `copa-vigia-${dx}`, name: 'Vigia da Copa', look: { shirt: 0x4a7a3a, hat: 'straw' }, x: cx + dx, z: cz + dz, facing: Math.atan2(dx, dz) });
  }
  houses.slice(1, 11).forEach((h, i) => {
    const a = v.rnd() * Math.PI * 2, r = h.R - 0.9;
    v.addNPC({ id: `copa-morador-${i}`, name: 'Morador da Copa', look: { shirt: 0x4a7a3a }, x: h.x + Math.cos(a) * r, z: h.z + Math.sin(a) * r, y: h.y + 0.13, facing: a });
  });

  v.finalize();
  return v;
}
