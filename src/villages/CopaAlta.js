import { Village } from './Village.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';

/**
 * POVOADO DA COPA ALTA — Floresta Tropical.
 * Árvores gigantes em anel, uma casa em cada copa, pontes de corda ligando
 * as vizinhas e escadas em caracol subindo pelos troncos. O chão fica só
 * com raízes, samambaias e o caminho da escada principal.
 *
 * (As plataformas são cenário: o jogador ainda não sobe nelas — o chão do
 * personagem só conhece terreno, pontes e píeres.)
 */
export function buildCopaAlta(game) {
  const v = new Village(game, VILLAGES.copaAlta, 409);
  const { ctx } = v;
  const cx = v.x, cz = v.z;

  // Árvore-mãe no centro + anel de 6 árvores.
  const trees = [{ x: cx, z: cz, h: 30, r: 2.0, floor: 12.5 }];
  const ring = 6, ringR = 27;
  for (let k = 0; k < ring; k++) {
    const a = (k / ring) * Math.PI * 2 + (v.rnd() - 0.5) * 0.25;
    const r = ringR + (v.rnd() - 0.5) * 5;
    trees.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, h: 24 + v.rnd() * 5, r: 1.4 + v.rnd() * 0.4, floor: 9 + v.rnd() * 3 });
  }

  const houses = trees.map((t, i) => {
    const info = X.giantTree(ctx, t);
    const y = info.y0 + t.floor;
    const R = i === 0 ? 5.6 : 4.4;
    X.treeHouse(ctx, { x: t.x, z: t.z, y, R, trunkR: t.r });
    v.reserve(t.x, t.z, R + 2);
    return { x: t.x, z: t.z, y, R, trunkR: t.r, y0: info.y0 };
  });

  // Pontes: cada árvore do anel liga com a vizinha; a árvore-mãe liga com
  // três do anel (alternadas).
  const edge = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    const ux = dx / d, uz = dz / d;
    X.ropeBridge(ctx, {
      a: { x: a.x + ux * (a.R - 0.2), y: a.y + 0.12, z: a.z + uz * (a.R - 0.2) },
      b: { x: b.x - ux * (b.R - 0.2), y: b.y + 0.12, z: b.z - uz * (b.R - 0.2) },
      sag: 0.6 + d * 0.025,
    });
  };
  for (let k = 1; k <= ring; k++) edge(houses[k], houses[(k % ring) + 1]);
  for (const k of [1, 3, 5]) edge(houses[0], houses[k]);

  // Escadas em caracol: árvore-mãe e duas do anel.
  for (const i of [0, 2, 5]) {
    const h = houses[i];
    X.spiralStair(ctx, { x: h.x, z: h.z, trunkR: h.trunkR + 0.25, y0: h.y0 + 0.6, y1: h.y - 0.2, start: i });
  }

  // Chão: solo escuro de folhas, bananeiras e arbustos.
  v.paintDisc(cx, cz, 34, 0x3e3424, 0.55);
  for (let i = 0; i < 40; i++) {
    const a = v.rnd() * Math.PI * 2, r = 4 + v.rnd() * (v.radius - 8);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!v.isFree(x, z, 1.2)) continue; // longe dos troncos e das plataformas
    v.plants.push({ type: v.rnd() < 0.5 ? 'banana' : 'bush', x, z, s: 0.7 + v.rnd() * 0.5, ry: v.rnd() * 6 });
    v.reserve(x, z, 1);
  }

  // A avó conta a história na base da escada principal; dois vigias embaixo.
  v.addElder(cx + 7.2, cz + 1.5, -Math.PI / 2); // fora das raízes da árvore-mãe
  for (const [dx, dz] of [[-6, 5], [5, -6.5]]) {
    v.addNPC({ id: `copa-vigia-${dx}`, name: 'Vigia da Copa', look: { shirt: 0x4a7a3a, hat: 'straw' }, x: cx + dx, z: cz + dz, facing: Math.atan2(dx, dz) });
  }

  v.finalize();
  return v;
}
