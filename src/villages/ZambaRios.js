import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';
import { poissonAnnulus } from './Layout.js';

/**
 * ZAMBA DOS RIOS — Floresta Equatorial, na beira d'água.
 * Um centro de terra firme (defumadouro, varais de peixe, fogueira) e as
 * casas de palafita espalhadas sobre a água rasa em volta, cada uma ligada
 * à margem por um trapiche. Canoas amarradas nas pilastras.
 * Varandas e trapiches entram em `game.pierDecks`: dá para andar neles.
 */
export function buildZambaRios(game) {
  const v = new Village(game, VILLAGES.zambaRios, 601);
  const { ctx } = v;
  const { M } = ctx;
  const T = ctx.terrain;
  const cx = v.x, cz = v.z;
  game.pierDecks ??= [];
  const deckFloor = 0.95; // assoalho logo acima da água (a cheia chega até ele)

  // Centro em terra firme.
  v.paintDisc(cx, cz, 18, 0x5a4a34, 0.7);
  v.addFire(X.bonfire(ctx, { x: cx, z: cz, size: 0.9 }), { intensity: 30, range: 18 });
  v.reserve(cx, cz, 4);
  const smoke = B.house(ctx, { x: cx - 10, z: cz - 6, rot: 0.6, w: 4.6, d: 4, h: 2.4, wall: M.woodLight, roof: 'thatch' });
  v.reserve(cx - 10, cz - 6, 4);
  for (let k = 0; k < 3; k++) {
    const x = cx + 8 + k * 3.2, z = cz - 9 + k * 1.5;
    B.dryingRack(ctx, { x, z, rot: 0.3 }); // peixe secando
    v.reserve(x, z, 1.6);
  }

  // Palafitas sobre a água rasa (Poisson Disk só onde há água).
  const water = (x, z) => { const h = T.heightAt(x, z); return h < -0.3 && h > -7; };
  let spots = poissonAnnulus({ cx, cz, inner: 34, outer: 105, spacing: 14, rng: v.rnd, accept: water });
  spots = spots.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)).slice(0, 10);
  const shoreFrom = (x, z) => {
    // Anda da casa em direção ao centro até achar terra (≥ 0,8 m).
    const d = Math.hypot(cx - x, cz - z), ux = (cx - x) / d, uz = (cz - z) / d;
    for (let t = 0; t < d; t += 1) if (T.heightAt(x + ux * t, z + uz * t) >= 0.8) return { x: x + ux * t, z: z + uz * t };
    return { x: cx, z: cz };
  };
  let dirX = 0, dirZ = 0; // direção média das casas mais próximas (soma de vetores)
  spots.forEach((p, i) => {
    const rot = Math.atan2(cx - p.x, cz - p.z) + (v.rnd() - 0.5) * 0.3;
    const w = 5 + v.rnd() * 1.5, d = 4.2 + v.rnd() * 1.2;
    const info = X.stiltHouse(ctx, { x: p.x, z: p.z, rot, w, d, floorY: deckFloor });
    game.pierDecks.push(info.deck);
    // Trapiche da varanda até a margem.
    const shore = shoreFrom(info.door.x, info.door.z);
    if (Math.hypot(shore.x - info.door.x, shore.z - info.door.z) > 1.5) {
      const pier = B.pier(ctx, { ax: info.door.x, az: info.door.z, bx: shore.x, bz: shore.z, width: 1.8, boats: 0 });
      game.pierDecks.push({ ax: info.door.x, az: info.door.z, bx: shore.x, bz: shore.z, width: 1.8, y: pier.deckY + 0.05 });
    }
    // Canoa amarrada na pilastra do lado da casa.
    const W = w + 2.6;
    const c = B.local(p.x, p.z, rot, W / 2 + 1.1, 0.3);
    const tie = B.local(p.x, p.z, rot, W / 2 - 0.3, d / 2);
    X.canoe(ctx, { x: c.x, z: c.z, rot: rot + 0.15, tie: { x: tie.x, y: deckFloor - 0.3, z: tie.z } });
    if (i < 3) { dirX += p.x - cx; dirZ += p.z - cz; }
  });

  // Ancoradouro principal com barcos, apontando para onde há mais água.
  const ma = dirX || dirZ ? Math.atan2(dirZ, dirX) : 0;
  const start = shoreFrom(cx + Math.cos(ma) * 70, cz + Math.sin(ma) * 70);
  const end = { x: start.x + Math.cos(ma) * 26, z: start.z + Math.sin(ma) * 26 };
  const main = B.pier(ctx, { ax: end.x, az: end.z, bx: start.x, bz: start.z, width: 3, boats: 3 });
  game.pierDecks.push({ ax: end.x, az: end.z, bx: start.x, bz: start.z, width: 3, y: main.deckY + 0.05 });
  v.street(cx, cz, start.x, start.z, 3.5, 0x5a4a34);

  v.addElder(start.x - Math.cos(ma) * 3 + 1.5, start.z - Math.sin(ma) * 3, ma);
  v.addNPC({ id: 'zamba-pescador', name: 'Pescador', look: { shirt: 0x1f6a6a, hat: 'straw' }, x: end.x - Math.cos(ma) * 2, z: end.z - Math.sin(ma) * 2, y: main.deckY + 0.05, facing: ma });
  v.addNPC({ id: 'zamba-defumador', name: 'Defumadora', look: { shirt: 0xb5382a, robe: true }, x: smoke.door.x, z: smoke.door.z, facing: 0.6 });
  v.addWanderers(3, { hat: 'straw' });

  v.finalize();
  return v;
}
