import { Village } from './Village.js';
import * as B from './Builders.js';
import { VILLAGES } from '../config/villages.js';
import { Mechanics } from '../systems/Mechanics.js';

/**
 * VILA PERSEGUIÇÃO — leste. Casas apertadas, cerca de mini estacas,
 * feira grande, poucas plantações e a Praça da Saudade (alçapão para a
 * masmorra "Holocausto"). O mendigo fica na praça.
 */
export function buildPerseguicao(game) {
  const v = new Village(game, VILLAGES.perseguicao, 202);
  const { ctx } = v;
  const { M } = ctx;
  const cx = v.x, cz = v.z;
  const R = v.radius;
  const gates = [0, Math.PI, Math.PI / 2, -Math.PI / 2];

  B.stakeFence(ctx, { x: cx, z: cz, r: R, gates });
  for (const g of gates) {
    v.street(cx, cz, cx + Math.cos(g) * (R + 25), cz + Math.sin(g) * (R + 25), 5);
  }

  // Praça da Saudade (centro)
  const sq = { x: cx, z: cz };
  B.plaza(ctx, { x: sq.x, z: sq.z, r: 16, mat: M.cobble });
  v.paintDisc(sq.x, sq.z, 18, 0x7a7266);
  v.reserve(sq.x, sq.z, 19);
  B.memorial(ctx, { x: sq.x, z: sq.z });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const x = sq.x + Math.cos(a) * 10, z = sq.z + Math.sin(a) * 10;
    B.bench(ctx, { x, z, rot: Math.atan2(sq.x - x, sq.z - z) });
  }
  const hx = sq.x + 6, hz = sq.z - 6;
  B.hatch(ctx, { x: hx, z: hz, rot: 0.4 });
  game.interactions.register({
    id: 'holocausto-hatch', label: 'Abrir o alçapão', radius: 2.8,
    position: { x: hx, y: game.terrain.heightAt(hx, hz) + 0.5, z: hz },
    onInteract: (g) => Mechanics.holocaustoHatch(g),
  });

  // Mendigo
  v.addNPC({
    id: 'mendigo', name: 'Mendigo', title: 'Praça da Saudade',
    look: { shirt: 0x6a5f50, pants: 0x4a4038, robe: true, hunch: 0.3, hat: 'wrap', build: 0.8 },
    x: sq.x - 7, z: sq.z + 4, facing: 1.2,
    onInteract: (g) => Mechanics.beggar(g),
  });

  // Feira grande (sul da praça)
  const fx = cx, fz = cz + 50;
  v.paintDisc(fx, fz, 26, 0x7b6448);
  v.reserve(fx, fz, 26);
  for (let row = -2; row <= 2; row++) {
    for (let col = -4; col <= 4; col++) {
      if (v.rnd() < 0.12) continue;
      B.marketStall(ctx, { x: fx + col * 5, z: fz + row * 8, rot: row % 2 ? Math.PI : 0 });
    }
  }
  const fairNames = ['Feirante Adwoa', 'Feirante Musa', 'Feirante Zawadi'];
  fairNames.forEach((name, i) => {
    v.addNPC({
      id: `perseguicao-feira-${i}`, name, title: 'Feira',
      x: fx - 10 + i * 10, z: fz + 2.5,
      onInteract: (g) => Mechanics.shopkeeper(g, { name, village: 'Vila Perseguição' }),
    });
  });

  // Poucas plantações (nordeste, dentro da cerca)
  for (const [lx, lz, rot] of [[70, -60, 0.6], [-75, -55, -0.5]]) {
    const shape = B.field(ctx, { x: cx + lx, z: cz + lz, rot, w: 28, d: 20, crop: lx > 0 ? 'maize' : 'other' });
    v.shapes.push(shape);
    v.reserve(cx + lx, cz + lz, 20);
  }

  // Muitas casas apertadas
  const walls = [M.mudBrick, M.mudBrickDark, M.adobeOchre, M.adobeRed];
  for (let i = 0; i < 900; i++) {
    const a = v.rnd() * Math.PI * 2, r = 22 + Math.sqrt(v.rnd()) * (R - 30);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const round = v.rnd() < 0.3;
    const size = round ? 3 : 4.2;
    if (!v.isFree(x, z, size)) continue;
    if (round) {
      B.rondavel(ctx, { x, z, r: 2.4 + v.rnd() * 0.6, wall: walls[Math.floor(v.rnd() * walls.length)] });
    } else {
      B.house(ctx, {
        x, z, rot: Math.atan2(cx - x, cz - z) + (v.rnd() - 0.5) * 0.5, w: 5.5 + v.rnd() * 2, d: 4.5 + v.rnd() * 1.5, h: 2.6,
        wall: walls[Math.floor(v.rnd() * walls.length)], roof: v.rnd() < 0.6 ? 'tin' : 'thatch',
      });
    }
    v.reserve(x, z, size);
    if (v.rnd() < 0.1) B.dryingRack(ctx, { x: x + 4, z: z + 2, rot: v.rnd() * 3 });
  }

  v.addWanderers(12);
  for (let i = 0; i < 5; i++) {
    v.addNPC({ id: `perseguicao-crianca-${i}`, name: 'Criança', look: { height: 1.1 + v.rnd() * 0.2, build: 0.8 }, x: fx + (v.rnd() - 0.5) * 30, z: fz - 18 + v.rnd() * 4, facing: v.rnd() * 6 });
  }
  for (let i = 0; i < 6; i++) {
    const a = v.rnd() * Math.PI * 2;
    v.addNPC({ id: `perseguicao-idoso-${i}`, name: 'Idoso', look: { hunch: 0.25, hair: 0xcccccc }, x: sq.x + Math.cos(a) * 12, z: sq.z + Math.sin(a) * 12, facing: a + Math.PI });
  }

  v.finalize();
  return v;
}
