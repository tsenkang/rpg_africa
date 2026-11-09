import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';
import { poissonAnnulus } from './Layout.js';

/**
 * ZAMBA DOS RIOS — Floresta Equatorial, vila fluvial extensa.
 * Centro em terra firme (defumadouros, varais de peixe, fogueira). Em volta,
 * dezenas de palafitas sobre a água rasa (Poisson Disk só onde há água),
 * ligadas por uma REDE de trapiches: cada casa (da mais perto do centro para
 * a mais longe) liga no ponto mais próximo entre a margem e as casas já
 * ligadas — sem ilhas soltas. Ancoradouro principal com a feira flutuante
 * (jangadas com barracas) dos dois lados. Canoas amarradas nas pilastras.
 * Varandas, trapiches e jangadas são andáveis (`game.surfaces`).
 */
export function buildZambaRios(game) {
  const v = new Village(game, VILLAGES.zambaRios, 601);
  const { ctx } = v;
  const { M } = ctx;
  const T = ctx.terrain;
  const cx = v.x, cz = v.z, R = v.radius;
  const deckFloor = 0.95; // assoalho logo acima da água (a cheia chega até ele)
  const walkY = deckFloor + 0.04;

  // Centro em terra firme.
  v.paintDisc(cx, cz, 22, 0x5a4a34, 0.7);
  v.addFire(X.bonfire(ctx, { x: cx, z: cz, size: 1 }), { intensity: 32, range: 18 });
  v.reserve(cx, cz, 4);
  const smoke = [];
  for (const [dx, dz, rot] of [[-11, -6, 0.6], [10, 9, -2.4]]) {
    smoke.push(B.house(ctx, { x: cx + dx, z: cz + dz, rot, w: 5, d: 4.2, h: 2.4, wall: M.woodLight, roof: 'thatch' }));
    v.reserve(cx + dx, cz + dz, 4.2);
  }
  for (let k = 0; k < 6; k++) {
    const a = 0.4 + k * 0.5, x = cx + Math.cos(a) * 15, z = cz + Math.sin(a) * 15;
    if (!v.isFree(x, z, 1.6)) continue;
    B.dryingRack(ctx, { x, z, rot: a + Math.PI / 2 }); // peixe secando
    v.reserve(x, z, 1.6);
  }

  // Palafitas sobre a água rasa.
  const water = (x, z) => { const h = T.heightAt(x, z); return h < -0.3 && h > -7; };
  const spots = poissonAnnulus({ cx, cz, inner: 30, outer: R, spacing: 11.5, rng: v.rnd, accept: water })
    .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)).slice(0, 38);
  const shoreFrom = (x, z, tx = cx, tz = cz) => {
    // Anda em direção ao alvo até sair da água (margem ≥ 0,25 m).
    const d = Math.hypot(tx - x, tz - z), ux = (tx - x) / d, uz = (tz - z) / d;
    for (let t = 0; t < d; t += 1) if (T.heightAt(x + ux * t, z + uz * t) >= 0.25) return { x: x + ux * t, z: z + uz * t, d: t };
    return { x: tx, z: tz, d };
  };
  const nodes = []; // portas já ligadas à rede
  const walk = (a, b) => {
    X.boardwalk(ctx, { ax: a.x, az: a.z, bx: b.x, bz: b.z, width: 1.9, y: walkY });
  };
  spots.forEach((p, i) => {
    const rot = Math.atan2(cx - p.x, cz - p.z) + (v.rnd() - 0.5) * 0.4;
    const w = 5 + v.rnd() * 2, d = 4.2 + v.rnd() * 1.6;
    const info = X.stiltHouse(ctx, { x: p.x, z: p.z, rot, w, d, floorY: deckFloor });
    const dk = info.deck;
    ctx.surfaces.addSegment({ ax: dk.ax, az: dk.az, bx: dk.bx, bz: dk.bz, width: dk.width, y0: dk.y });
    // Liga na margem ou na casa já ligada mais próxima (o que for mais perto).
    const shore = shoreFrom(info.door.x, info.door.z);
    let best = { x: shore.x, z: shore.z, d: shore.d };
    for (const n of nodes) {
      const dd = Math.hypot(n.x - info.door.x, n.z - info.door.z);
      if (dd < best.d) best = { x: n.x, z: n.z, d: dd };
    }
    if (best.d > 1.2) walk(info.door, best);
    nodes.push(info.door);
    // Canoa amarrada na pilastra do lado e carga na varanda.
    const Wd = w + 2.6;
    const c = B.local(p.x, p.z, rot, Wd / 2 + 1.1, 0.3);
    const tie = B.local(p.x, p.z, rot, Wd / 2 - 0.3, d / 2);
    if (water(c.x, c.z)) X.canoe(ctx, { x: c.x, z: c.z, rot: rot + 0.15, tie: { x: tie.x, y: deckFloor - 0.3, z: tie.z } });
    if (v.rnd() < 0.5) v.props.push({ type: v.rnd() < 0.5 ? 'crate' : 'barrel', ...B.local(p.x, p.z, rot, -w / 2 - 0.6, d / 2 + 0.6), y: walkY, rot: v.rnd() * 3 });
    if (i % 4 === 0) v.addLamp(X.lampPost(ctx, { ...B.local(p.x, p.z, rot, w / 2 + 0.9, d / 2 + 0.9), rot, y0: walkY }));
  });

  // Ancoradouro principal (para onde há mais casas) + feira flutuante dos dois lados.
  let dirX = 0, dirZ = 0;
  spots.slice(0, 6).forEach((p) => { dirX += p.x - cx; dirZ += p.z - cz; });
  const ma = dirX || dirZ ? Math.atan2(dirZ, dirX) : 0;
  const start = shoreFrom(cx + Math.cos(ma) * 80, cz + Math.sin(ma) * 80);
  const end = { x: start.x + Math.cos(ma) * 34, z: start.z + Math.sin(ma) * 34 };
  const main = B.pier(ctx, { ax: end.x, az: end.z, bx: start.x, bz: start.z, width: 3.2, boats: 3 });
  ctx.surfaces.addSegment({ ax: end.x, az: end.z, bx: start.x, bz: start.z, width: 3.2, y0: main.deckY + 0.05 });
  v.street(cx, cz, start.x, start.z, 3.5, 0x5a4a34);
  const nx = -Math.sin(ma), nz = Math.cos(ma);
  let raft = 0;
  for (let t = 6; t < 34; t += 5.5) {
    for (const s of [-1, 1]) {
      const x = start.x + Math.cos(ma) * t + nx * s * 4.1, z = start.z + Math.sin(ma) * t + nz * s * 4.1;
      if (!water(x, z)) continue;
      X.raftStall(ctx, { x, z, rot: ma + (s > 0 ? Math.PI / 2 : -Math.PI / 2) });
      if (raft < 4) {
        v.addNPC({ id: `zamba-feirante-${raft}`, name: 'Feirante', title: 'Feira flutuante', look: { shirt: 0xb5382a, robe: true }, x: x - nx * s * 0.6, z: z - nz * s * 0.6, y: 0.59, facing: Math.atan2(-nx * s, -nz * s) });
      }
      raft++;
    }
  }
  for (let t = 4; t < 34; t += 10) v.addLamp(X.lampPost(ctx, { x: start.x + Math.cos(ma) * t + nx * 1.4, z: start.z + Math.sin(ma) * t + nz * 1.4, rot: ma, y0: main.deckY }));

  v.addElder(start.x - Math.cos(ma) * 3 + 1.5, start.z - Math.sin(ma) * 3, ma);
  v.addNPC({ id: 'zamba-pescador', name: 'Pescador', look: { shirt: 0x1f6a6a, hat: 'straw' }, x: end.x - Math.cos(ma) * 2, z: end.z - Math.sin(ma) * 2, y: main.deckY + 0.05, facing: ma });
  v.addNPC({ id: 'zamba-defumador', name: 'Defumadora', look: { shirt: 0xb5382a, robe: true }, x: smoke[0].door.x, z: smoke[0].door.z, facing: 0.6 });
  v.addWanderers(4, { hat: 'straw' });

  v.finalize();
  return v;
}
