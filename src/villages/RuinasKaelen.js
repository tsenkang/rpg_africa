import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';
import { Mechanics } from '../systems/Mechanics.js';
import { poissonAnnulus } from './Layout.js';

/**
 * RUÍNAS DE KAELEN (Vila das Sombras) — coração da Floresta Preta.
 * 100% destruída e abandonada: casas desabadas e queimadas, vigas caídas,
 * torres partidas, cercas quebradas, árvores mortas e o mato tomando conta.
 * No centro, a Pedra de Kaelen (inscrição que dá para ler — e que cobra
 * exposição paranormal). Luzes errantes roxas flutuam entre as ruínas e uma
 * "presença" faz a névoa paranormal engrossar à medida que se chega perto.
 * Sem moradores, sem abrigo do clima, não é ponto de renascer.
 */
export function buildRuinasKaelen(game) {
  const v = new Village(game, VILLAGES.ruinasKaelen, 666);
  const { ctx } = v;
  const { M } = ctx;
  const cx = v.x, cz = v.z;

  // Chão de cinza e as velhas ruas, quase apagadas.
  v.paintDisc(cx, cz, v.radius - 6, 0x2c2724, 0.65);
  for (const a of [0.3, 2.2, 4.1]) {
    v.street(cx + Math.cos(a) * 6, cz + Math.sin(a) * 6, cx + Math.cos(a) * (v.radius + 15), cz + Math.sin(a) * (v.radius + 15), 4, 0x3a3430);
  }

  // Pedra de Kaelen no centro — a única coisa que ainda "fala".
  const stone = X.kaelenStone(ctx, { x: cx, z: cz, rot: 0.3 });
  v.reserve(cx, cz, 5);
  const sy = ctx.terrain.heightAt(stone.front.x, stone.front.z);
  game.interactions.register({
    id: 'kaelen-pedra', label: 'Ler a inscrição', radius: 3.4,
    position: { x: stone.front.x, y: sy + 1, z: stone.front.z },
    onInteract: (g) => Mechanics.lore(g, VILLAGES.ruinasKaelen.lore),
  });
  // Poço seco: só o anel de pedras sobrou.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    if (i === 6) continue;
    const x = cx + 10 + Math.cos(a) * 1.2, z = cz - 7 + Math.sin(a) * 1.2;
    ctx.batch.add(B.G.rock, M.stoneDark, { x, y: ctx.terrain.heightAt(x, z) + 0.3 + (i % 3) * 0.1, z, ry: a, sx: 0.35, sy: 0.45 + (i % 2) * 0.25, sz: 0.3 });
  }
  v.reserve(cx + 10, cz - 7, 2.5);

  // Casas desabadas (cada uma caiu de um jeito: seed diferente) + vigas
  // queimadas por dentro + mato crescendo nas paredes.
  const spots = poissonAnnulus({ cx, cz, inner: 16, outer: v.radius - 8, spacing: 15, rng: v.rnd, accept: (x, z) => v.isFree(x, z, 5) });
  spots.forEach((p, i) => {
    const rot = Math.atan2(cx - p.x, cz - p.z) + (v.rnd() - 0.5) * 1.2;
    const w = 6.5 + v.rnd() * 3, d = 5.5 + v.rnd() * 2;
    B.ruinedHouse(ctx, { x: p.x, z: p.z, rot, w, d, seed: 1000 + i * 37 });
    X.charredBeams(ctx, { x: p.x, z: p.z, n: 3 + Math.floor(v.rnd() * 3) });
    for (let k = 0; k < 2; k++) {
      const q = B.local(p.x, p.z, rot, (v.rnd() - 0.5) * (w + 2), (v.rnd() < 0.5 ? -1 : 1) * (d / 2 + 0.6));
      B.bush(ctx, { x: q.x, z: q.z, s: 0.6 + v.rnd() * 0.6 });
    }
    v.reserve(p.x, p.z, Math.hypot(w, d) / 2 + 1);
  });

  // Torres de vigia partidas.
  for (const a of [1.2, 3.5]) {
    const x = cx + Math.cos(a) * 46, z = cz + Math.sin(a) * 46;
    if (!v.isFree(x, z, 5)) continue;
    X.brokenTower(ctx, { x, z });
    v.reserve(x, z, 6);
  }

  // Cercas caídas em pedaços.
  for (let k = 0; k < 7; k++) {
    const a = v.rnd() * Math.PI * 2, r = 20 + v.rnd() * 45, len = 3 + v.rnd() * 4;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, t = a + Math.PI / 2 + (v.rnd() - 0.5) * 0.6;
    const bx = x + Math.cos(t) * len, bz = z + Math.sin(t) * len;
    if (!v.isFree(x, z, 1) || !v.isFree(bx, bz, 1)) continue;
    B.fenceRun(ctx, { ax: x, az: z, bx, bz });
  }

  // Árvores mortas tomando a vila.
  for (let k = 0, placed = 0; k < 80 && placed < 24; k++) {
    const a = v.rnd() * Math.PI * 2, r = 8 + v.rnd() * (v.radius - 4);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!v.isFree(x, z, 1.5)) continue;
    X.deadTree(ctx, { x, z, h: 6 + v.rnd() * 6 });
    v.reserve(x, z, 1.5);
    placed++;
  }

  // Luzes errantes e a presença que engrossa a névoa.
  for (let k = 0, n = 0; k < 40 && n < 7; k++) {
    const a = v.rnd() * Math.PI * 2, r = 6 + v.rnd() * 55;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!v.isFree(x, z, 0.5)) continue;
    v.addWisp(X.wisp(ctx, { x, z, y: ctx.terrain.heightAt(x, z) + 1.4 + v.rnd() * 1.4 }));
    n++;
  }
  // reach 30: a névoa começa a ~80 m do centro e só fecha de vez perto da Pedra.
  v.presences.push({ x: cx, z: cz, reach: 30, name: 'Presença de Kaelen' });

  v.finalize();
  return v;
}
