import { Village } from './Village.js';
import * as B from './Builders.js';
import { VILLAGES } from '../config/villages.js';
import { Mechanics } from '../systems/Mechanics.js';

/**
 * VILA ABSTRAÇÃO — noroeste, controlada pela tribo Hoogmoed.
 * Muro de troncos, igreja grande (estilo saheliano), duas lojas, feira
 * humilde, casas simples, casa medicinal e a casa grande do líder.
 */
export function buildAbstracao(game) {
  const v = new Village(game, VILLAGES.abstracao, 303);
  const { ctx } = v;
  const { M } = ctx;
  const cx = v.x, cz = v.z;
  const R = v.radius;
  const gateA = Math.PI * 0.25; // portão sudeste, voltado para o centro do continente

  B.palisade(ctx, { x: cx, z: cz, r: R, gates: [gateA], gateWidth: 7 });
  v.street(cx, cz, cx + Math.cos(gateA) * (R + 30), cz + Math.sin(gateA) * (R + 30), 5);
  for (const s of [-1, 1]) {
    const a = gateA + s * (5 / R);
    const x = cx + Math.cos(a) * (R + 2.5), z = cz + Math.sin(a) * (R + 2.5);
    v.addNPC({
      id: `hoogmoed-portao-${s}`, name: 'Guerreiro Hoogmoed', title: 'Portão',
      look: { shirt: 0x7a2a1a, hat: 'wrap', accessory: 'spear', build: 1.15 },
      x, z, facing: gateA - Math.PI / 2,
      onInteract: (g) => Mechanics.hoogmoedGuard(g),
    });
  }

  // Terreiro central de terra batida
  v.paintDisc(cx, cz, 22, 0x7a6248);
  v.reserve(cx, cz, 18);
  B.firePit(ctx, { x: cx, z: cz });

  // Igreja grande (norte)
  const ch = B.church(ctx, { x: cx, z: cz - 45, rot: 0, scale: 1.35, wall: M.mudBrick, sahel: true });
  v.reserve(cx, cz - 45, 24);
  v.street(cx, cz - 18, ch.door.x, ch.door.z, 4);

  // Casa grande do líder (oeste)
  const lx = cx - 48, lz = cz + 8;
  const lead = B.house(ctx, { x: lx, z: lz, rot: Math.PI / 2, w: 18, d: 10, h: 4.2, wall: M.mudBrickDark, roof: 'thatch' });
  v.reserve(lx, lz, 12);
  B.banner(ctx, { x: lead.door.x + 2, z: lead.door.z - 3, cloth: M.clothRed });
  B.banner(ctx, { x: lead.door.x + 2, z: lead.door.z + 3, cloth: M.clothRed });
  v.addNPC({
    id: 'lider-hoogmoed', name: 'Líder Hoogmoed', title: 'Casa grande',
    look: { shirt: 0x8a1a12, robe: true, hat: 'wrap', accessory: 'staff', build: 1.2, height: 1.88 },
    x: lead.door.x + 1, z: lead.door.z, facing: Math.PI / 2,
    onInteract: (g) => Mechanics.talk(g, {
      speaker: 'Líder Hoogmoed', title: 'Vila Abstração',
      text: 'Esta vila agora pertence aos Hoogmoed. Os populistas trabalham, nós protegemos. Não cause problemas, estrangeiro.',
    }),
  });

  // Casa medicinal (leste)
  const mx = cx + 42, mz = cz - 10;
  const med = B.house(ctx, { x: mx, z: mz, rot: -Math.PI / 2, w: 9, d: 7, h: 3, wall: M.adobeWhite, roof: 'thatch' });
  v.reserve(mx, mz, 8);
  B.dryingRack(ctx, { x: med.door.x - 2, z: med.door.z + 3, rot: 0.3 });
  v.addNPC({
    id: 'curandeira-abstracao', name: 'Curandeira', title: 'Casa medicinal',
    look: { robe: true, shirt: 0x2f6a4a, hat: 'wrap' },
    x: med.door.x - 0.8, z: med.door.z, facing: -Math.PI / 2,
    onInteract: (g) => Mechanics.medicHouse(g),
  });

  // Duas lojas (sul)
  for (let i = 0; i < 2; i++) {
    const x = cx - 14 + i * 28, z = cz + 38;
    const s = B.shop(ctx, { x, z, rot: Math.PI, w: 7, d: 6, roof: 'thatch' });
    v.reserve(x, z, 7);
    const name = i ? 'Loja do Sahr' : 'Loja da Nia';
    v.addNPC({
      id: `abstracao-loja-${i}`, name, title: 'Loja',
      x: s.door.x, z: s.door.z, facing: Math.PI,
      onInteract: (g) => Mechanics.shopkeeper(g, { name, village: 'Vila Abstração' }),
    });
  }

  // Feira humilde (sudeste, perto do portão)
  const fx = cx + 35, fz = cz + 35;
  v.paintDisc(fx, fz, 12, 0x7a6248);
  for (let k = 0; k < 6; k++) B.marketStall(ctx, { x: fx + (k % 3) * 5 - 5, z: fz + Math.floor(k / 3) * 7 - 3, rot: k < 3 ? 0 : Math.PI, poor: true });
  v.reserve(fx, fz, 13);

  // Casas simples (rondavéis de barro e casinhas de palha)
  v.scatterHouses((x, z, rot) => {
    if (v.rnd() < 0.65) {
      const r = 2.3 + v.rnd() * 0.5;
      return { ...B.rondavel(ctx, { x, z, rot, r, wall: v.rnd() < 0.5 ? M.mudBrick : M.mudBrickDark }), r: r + 0.9 };
    }
    const info = B.house(ctx, { x, z, rot, w: 5, d: 4, h: 2.4, wall: M.mudBrickDark, roof: 'thatch' });
    return { ...info, w: 5, d: 4, r: 3.2 };
  });

  // Populistas e patrulha Hoogmoed
  for (let i = 0; i < 8; i++) {
    const a = v.rnd() * Math.PI * 2, r = 10 + v.rnd() * 30;
    v.addNPC({
      id: `populista-${i}`, name: 'Populista', look: { shirt: 0x8a7a66, pants: 0x4a3a2a, build: 0.85 },
      x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, facing: v.rnd() * 6,
      onInteract: i < 3 ? (g) => Mechanics.populist(g) : null,
    });
  }
  v.addWanderers(6, { shirt: 0x7a6a58 });
  const patrol = [];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; patrol.push({ x: cx + Math.cos(a) * (R - 12), z: cz + Math.sin(a) * (R - 12) }); }
  v.addNPC({ id: 'hoogmoed-patrulha', name: 'Patrulha Hoogmoed', look: { shirt: 0x7a2a1a, hat: 'wrap', accessory: 'spear' }, x: patrol[0].x, z: patrol[0].z, path: patrol });

  v.finalize();
  return v;
}
