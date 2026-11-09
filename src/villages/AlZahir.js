import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';
import { Mechanics } from '../systems/Mechanics.js';

/**
 * OÁSIS DE AL-ZAHIR — centro do Deserto.
 * Lago com palmeiras no meio; em volta, o mercado de especiarias e as
 * tendas coloridas das caravanas; mais para fora, casas de adobe de teto
 * reto espalhadas organicamente (Poisson Disk), viradas para as ruas.
 */
export function buildAlZahir(game) {
  const v = new Village(game, VILLAGES.alZahir, 307);
  const { ctx } = v;
  const { M } = ctx;
  const cx = v.x, cz = v.z;
  const pondR = 11;

  // Lago no centro: areia molhada, pedras, juncos e palmeiras.
  v.paintDisc(cx, cz, pondR + 7, 0x8a6a44, 0.75);
  X.oasisPond(ctx, { x: cx, z: cz, r: pondR, plants: v.plants });
  v.reserve(cx, cz, pondR + 9);

  // Quatro ruas de areia batida saindo do lago.
  const streetA = [0.4, 2.0, 3.6, 5.2];
  for (const a of streetA) {
    v.street(cx + Math.cos(a) * (pondR + 9), cz + Math.sin(a) * (pondR + 9), cx + Math.cos(a) * (v.radius + 20), cz + Math.sin(a) * (v.radius + 20), 4.5, 0xa07a50);
  }

  // Mercado de especiarias (arco a leste do lago) com sacos coloridos.
  for (let k = 0; k < 6; k++) {
    const a = -0.75 + k * 0.3, r = pondR + 14;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!v.isFree(x, z, 2)) continue;
    const rot = Math.atan2(cx - x, cz - z);
    B.marketStall(ctx, { x, z, rot });
    const f = B.local(x, z, rot, 0, 1.9);
    X.spiceSacks(ctx, { x: f.x, z: f.z, rot, n: 4 + (k % 2) });
    v.reserve(x, z, 3);
  }
  v.addNPC({
    id: 'alzahir-especiarias', name: 'Rashid', title: 'Mercado de Especiarias',
    look: { shirt: 0xd9a02a, robe: true, hat: 'wrap' },
    x: cx + Math.cos(-0.15) * (pondR + 11), z: cz + Math.sin(-0.15) * (pondR + 11), facing: -0.15 + Math.PI,
    onInteract: (g) => Mechanics.shopkeeper(g, { name: 'Rashid, o especieiro', village: 'Oásis de Al-Zahir' }),
  });

  // Tendas coloridas das caravanas (lado oeste).
  const cloths = [M.clothRed, M.clothBlue, M.clothYellow, M.clothGreen];
  for (let k = 0; k < 7; k++) {
    const a = Math.PI - 0.9 + k * 0.3 + (v.rnd() - 0.5) * 0.1, r = pondR + 15 + v.rnd() * 5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!v.isFree(x, z, 3)) continue;
    const info = X.clothTent(ctx, { x, z, rot: Math.atan2(cx - x, cz - z) + (v.rnd() - 0.5) * 0.4, cloth: cloths[k % cloths.length] });
    v.reserve(x, z, info.r + 0.6);
  }

  // Casas de adobe de teto reto (Poisson Disk + de frente para a rua).
  const walls = [M.adobeOchre, M.adobePastel, M.adobeWhite, M.adobeRed];
  v.scatterHouses((x, z, rot) => {
    const w = 6 + v.rnd() * 2.5, d = 5 + v.rnd() * 2;
    const info = B.house(ctx, { x, z, rot, w, d, h: 3 + v.rnd() * 0.8, wall: walls[Math.floor(v.rnd() * walls.length)], roof: 'flat' });
    return { ...info, w, d, r: Math.hypot(w, d) / 2 };
  });

  // Poço das caravanas na entrada principal.
  const wa = streetA[0], wx = cx + Math.cos(wa) * (v.radius - 6) + 5, wz = cz + Math.sin(wa) * (v.radius - 6);
  if (v.isFree(wx, wz, 2)) B.well(ctx, { x: wx, z: wz });

  v.addElder(cx + Math.cos(2.8) * (pondR + 2.5), cz + Math.sin(2.8) * (pondR + 2.5), 2.8 + Math.PI);
  v.addWanderers(10, { robe: true, hat: 'wrap' });

  v.finalize();
  return v;
}
