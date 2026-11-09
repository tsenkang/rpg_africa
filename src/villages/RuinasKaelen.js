import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';
import { Mechanics } from '../systems/Mechanics.js';
import { poissonAnnulus } from './Layout.js';

/**
 * RUÍNAS DE KAELEN (Vila das Sombras) — coração da Floresta Preta.
 * Um reino destruído: muralha de pedra com musgo negro (cheia de rombos),
 * ruas de pedra partida, dezenas de casas desmoronadas e queimadas, muros
 * internos caídos, torres partidas, a catedral arruinada ao norte, árvores
 * mortas e entulho por toda parte (tábuas e galhos soltos têm física).
 * No centro, a Pedra de Kaelen (inscrição: +exposição). Luzes errantes e uma
 * "presença" que engrossa a névoa paranormal até o centro.
 * Sem moradores, sem abrigo do clima, não é ponto de renascer.
 */
export function buildRuinasKaelen(game) {
  const v = new Village(game, VILLAGES.ruinasKaelen, 666);
  const { ctx } = v;
  const { M } = ctx;
  const cx = v.x, cz = v.z, R = v.radius;

  v.paintDisc(cx, cz, R - 6, 0x2c2724, 0.65);

  // Pedra de Kaelen no centro + poço seco.
  const stone = X.kaelenStone(ctx, { x: cx, z: cz, rot: 0.3 });
  v.reserve(cx, cz, 6);
  const sy = ctx.terrain.heightAt(stone.front.x, stone.front.z);
  game.interactions.register({
    id: 'kaelen-pedra', label: 'Ler a inscrição', radius: 3.4,
    position: { x: stone.front.x, y: sy + 1, z: stone.front.z },
    onInteract: (g) => Mechanics.lore(g, VILLAGES.ruinasKaelen.lore),
  });
  for (let i = 0; i < 10; i++) {
    if (i === 6) continue;
    const a = (i / 10) * Math.PI * 2;
    const x = cx + 10 + Math.cos(a) * 1.2, z = cz - 7 + Math.sin(a) * 1.2;
    ctx.batch.add(B.G.rock, M.stoneDark, { x, y: ctx.terrain.heightAt(x, z) + 0.3 + (i % 3) * 0.1, z, ry: a, sx: 0.35, sy: 0.45 + (i % 2) * 0.25, sz: 0.3 });
  }
  v.reserve(cx + 10, cz - 7, 2.5);

  // Ruas de pedra partida (lajes faltando) da praça às brechas da muralha.
  const roads = [0.3, 1.55, 2.8, 4.05, 5.3];
  for (const a of roads) {
    const ax = cx + Math.cos(a) * 7, az = cz + Math.sin(a) * 7;
    const bx = cx + Math.cos(a) * (R + 12), bz = cz + Math.sin(a) * (R + 12);
    v.street(ax, az, bx, bz, 4.5, 0x3a3430);
    for (let d = 7; d < R - 8; d += 9) {
      if (v.rnd() < 0.35) continue; // trecho arrancado
      const p0 = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d }, p1 = { x: cx + Math.cos(a) * (d + 7), z: cz + Math.sin(a) * (d + 7) };
      X.pavePath(ctx, { ax: p0.x, az: p0.z, bx: p1.x, bz: p1.z, width: 3.4, kind: 'stone', mat: M.stoneDark });
    }
  }

  // Catedral arruinada ao norte da praça, de frente para ela.
  const ca = -Math.PI / 2, cdist = 62;
  const kx = cx + Math.cos(ca) * cdist, kz = cz + Math.sin(ca) * cdist;
  X.ruinedCathedral(ctx, { x: kx, z: kz, rot: Math.atan2(cx - kx, cz - kz) });
  v.reserve(kx, kz, 30);

  // Muralha externa com musgo negro, cheia de rombos (e brechas nas ruas).
  const wallR = R - 6, segs = 48;
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * Math.PI * 2, b = ((k + 1) / segs) * Math.PI * 2;
    if (roads.some((r) => Math.abs(Math.atan2(Math.sin((a + b) / 2 - r), Math.cos((a + b) / 2 - r))) < 0.06)) continue;
    if (v.rnd() < 0.22) continue; // rombo
    X.mossyWall(ctx, { ax: cx + Math.cos(a) * wallR, az: cz + Math.sin(a) * wallR, bx: cx + Math.cos(b) * wallR, bz: cz + Math.sin(b) * wallR, h: 4 + v.rnd() * 2.5, t: 1.1 });
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.45, x = cx + Math.cos(a) * wallR, z = cz + Math.sin(a) * wallR;
    X.brokenTower(ctx, { x, z, r: 3.4, h: 10 + v.rnd() * 8 });
    v.reserve(x, z, 6);
  }

  // Dezenas de casas desmoronadas (cada uma caiu de um jeito) + vigas e mato.
  const spots = poissonAnnulus({ cx, cz, inner: 18, outer: R - 14, spacing: 12.5, rng: v.rnd, accept: (x, z) => v.isFree(x, z, 5.5) });
  spots.forEach((p, i) => {
    const rot = Math.atan2(cx - p.x, cz - p.z) + (v.rnd() - 0.5) * 1.2;
    const w = 7 + v.rnd() * 4, d = 6 + v.rnd() * 2.5;
    if (i % 9 === 4) {
      // Uma das poucas casas ainda de pé: escura, por dentro tudo revirado.
      B.house(ctx, { x: p.x, z: p.z, rot, w: Math.min(w, 8), d: Math.min(d, 6.5), h: 3, wall: M.stoneDark, roof: 'tile', roofMat: M.charred });
      v.interiors.at(-1).style = 'ruin';
      v.reserve(p.x, p.z, Math.hypot(w, d) / 2 + 1);
      return;
    }
    B.ruinedHouse(ctx, { x: p.x, z: p.z, rot, w, d, h: 3.2 + v.rnd() * 2.4, seed: 1000 + i * 37 });
    X.charredBeams(ctx, { x: p.x, z: p.z, n: 3 + Math.floor(v.rnd() * 3) });
    for (let k = 0; k < 2; k++) {
      const q = B.local(p.x, p.z, rot, (v.rnd() - 0.5) * (w + 2), (v.rnd() < 0.5 ? -1 : 1) * (d / 2 + 0.7));
      B.bush(ctx, { x: q.x, z: q.z, s: 0.6 + v.rnd() * 0.6 });
    }
    v.reserve(p.x, p.z, Math.hypot(w, d) / 2 + 1);
  });

  const free = (pad, r0 = 8, r1 = R - 10) => {
    for (let t = 0; t < 25; t++) {
      const a = v.rnd() * Math.PI * 2, r = r0 + v.rnd() * (r1 - r0);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (v.isFree(x, z, pad)) return { x, z, a };
    }
    return null;
  };
  // Muros internos caídos, cercas quebradas e árvores mortas.
  for (let k = 0; k < 18; k++) {
    const p = free(2, 15); if (!p) break;
    const t = p.a + Math.PI / 2 + (v.rnd() - 0.5) * 0.8, len = 6 + v.rnd() * 9;
    const bx = p.x + Math.cos(t) * len, bz = p.z + Math.sin(t) * len;
    if (!v.isFree(bx, bz, 1.5)) continue;
    X.mossyWall(ctx, { ax: p.x, az: p.z, bx, bz, h: 2 + v.rnd() * 2, t: 0.8 });
  }
  for (let k = 0; k < 12; k++) {
    const p = free(1); if (!p) break;
    const t = p.a + Math.PI / 2 + (v.rnd() - 0.5) * 0.6, len = 3 + v.rnd() * 4;
    const bx = p.x + Math.cos(t) * len, bz = p.z + Math.sin(t) * len;
    if (v.isFree(bx, bz, 1)) B.fenceRun(ctx, { ax: p.x, az: p.z, bx, bz });
  }
  for (let k = 0; k < 50; k++) {
    const p = free(1.5); if (!p) break;
    X.deadTree(ctx, { x: p.x, z: p.z, h: 6 + v.rnd() * 7 });
    v.reserve(p.x, p.z, 1.5);
  }
  // Entulho solto (com física): tábuas, galhos e alguns barris largados.
  for (let k = 0; k < 45; k++) { const p = free(0.7); if (p) v.props.push({ type: v.rnd() < 0.5 ? 'plank' : 'branch', x: p.x, z: p.z, rot: p.a }); }
  for (let k = 0; k < 8; k++) { const p = free(0.6); if (p) v.props.push({ type: 'barrel', x: p.x, z: p.z }); }

  // Luzes errantes e a presença que engrossa a névoa.
  for (let k = 0, n = 0; k < 80 && n < 14; k++) {
    const p = free(0.5, 6, R - 12); if (!p) continue;
    v.addWisp(X.wisp(ctx, { x: p.x, z: p.z, y: ctx.terrain.heightAt(p.x, p.z) + 1.4 + v.rnd() * 1.6 }));
    n++;
  }
  // reach 45: a névoa começa a ~95 m do centro e fecha de vez a ~50 m.
  v.presences.push({ x: cx, z: cz, reach: 45, name: 'Presença de Kaelen' });

  v.finalize();
  return v;
}
