import { Village } from './Village.js';
import * as B from './Builders.js';
import { VILLAGES } from '../config/villages.js';
import { Mechanics } from '../systems/Mechanics.js';

/**
 * VILA RENASCIMENTO — ilha no centro do lago.
 * Praça central com o poço (entrada secreta da sede do KKK), igreja bem
 * cuidada ao norte, lojas/mercadinhos ao redor da praça, oito ruas que
 * levam às pontes e a casa destruída do Senhor (Especialista em NEX).
 */
export function buildRenascimento(game) {
  const v = new Village(game, VILLAGES.renascimento, 101);
  const { ctx } = v;
  const { M } = ctx;
  const cx = v.x, cz = v.z;
  const plazaR = 26;

  // Praça e poço
  B.plaza(ctx, { x: cx, z: cz, r: plazaR, mat: M.cobbleWarm });
  v.paintDisc(cx, cz, plazaR + 3, 0x8a7a66);
  v.reserve(cx, cz, plazaR + 4);
  B.well(ctx, { x: cx, z: cz });
  game.interactions.register({
    id: 'renascimento-well', label: 'Usar o poço', radius: 3.2,
    position: { x: cx, y: v.y + 1, z: cz }, onInteract: (g) => Mechanics.well(g),
  });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const p = { x: cx + Math.cos(a) * (plazaR - 4), z: cz + Math.sin(a) * (plazaR - 4) };
    B.bench(ctx, { x: p.x, z: p.z, rot: Math.atan2(cx - p.x, cz - p.z) });
  }

  // Oito ruas alinhadas às pontes
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2;
    v.street(cx + Math.cos(a) * plazaR, cz + Math.sin(a) * plazaR, cx + Math.cos(a) * 232, cz + Math.sin(a) * 232, 6);
  }
  // Rua circular interna
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, b = ((k + 1) / 24) * Math.PI * 2;
    v.street(cx + Math.cos(a) * 95, cz + Math.sin(a) * 95, cx + Math.cos(b) * 95, cz + Math.sin(b) * 95, 4.5);
  }

  // Igreja bem cuidada (norte da praça, de frente para ela)
  const churchInfo = B.church(ctx, { x: cx, z: cz - 52, rot: 0, scale: 1.1 });
  v.reserve(cx, cz - 52, 20);
  v.addNPC({
    id: 'padre', name: 'Padre', title: 'Igreja',
    look: { shirt: 0x15151a, robe: true, hat: null, skin: 0x5c3a24 },
    x: churchInfo.door.x + 2, z: churchInfo.door.z, facing: 0,
    onInteract: (g) => Mechanics.priest(g),
  });

  // Lojas e mercadinhos em volta da praça
  let shopN = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.6) continue; // lado da igreja
    const r = plazaR + 12;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const rot = Math.atan2(cx - x, cz - z);
    const info = B.shop(ctx, { x, z, rot, w: 8, d: 6.5, roof: shopN % 2 ? 'tile' : 'tin' });
    v.reserve(x, z, 8);
    if (shopN < 3) {
      const names = ['Mercadinho da Dona Ama', 'Loja do Kofi', 'Armazém Renascer'];
      v.addNPC({
        id: `renascimento-shop-${shopN}`, name: names[shopN], title: 'Loja',
        x: info.door.x, z: info.door.z, facing: rot,
        onInteract: (g) => Mechanics.shopkeeper(g, { name: names[shopN], village: 'Vila Renascimento' }),
      });
    }
    shopN++;
  }

  // Casa destruída "em um canto" (sudoeste) — Senhor, Especialista em NEX
  const ra = Math.PI * 0.86, rr = 182;
  const rx = cx + Math.cos(ra) * rr, rz = cz + Math.sin(ra) * rr;
  const ruin = B.ruinedHouse(ctx, { x: rx, z: rz, rot: Math.atan2(cx - rx, cz - rz) });
  v.reserve(rx, rz, 14);
  v.addNPC({
    id: 'senhor_nex', name: 'Senhor', title: 'Especialista em NEX',
    look: { skin: 0x3b2417, shirt: 0x6a5a48, pants: 0x3a3028, hair: 0xd8d8d8, hunch: 0.25, accessory: 'staff', height: 1.7, robe: true },
    x: ruin.inside.x, z: ruin.inside.z, facing: Math.atan2(cx - rx, cz - rz),
    onInteract: (g) => Mechanics.healer(g),
  });
  B.firePit(ctx, { x: ruin.inside.x + 2.5, z: ruin.inside.z + 1.5 });

  // Casas espalhadas organicamente (Poisson Disk), viradas para a rua mais próxima
  const walls = [M.adobeOchre, M.adobeRed, M.adobeWhite, M.adobePastel, M.mudBrick];
  const roofs = ['tin', 'tin', 'tile', 'tile', 'flat'];
  v.scatterHouses((x, z, rot) => {
    if (v.rnd() < 0.08) return null; // terreno baldio
    const w = 6 + v.rnd() * 3, d = 5 + v.rnd() * 2;
    const info = B.house(ctx, {
      x, z, rot, w, d, h: 2.8 + v.rnd() * 0.6,
      wall: walls[Math.floor(v.rnd() * walls.length)], roof: roofs[Math.floor(v.rnd() * roofs.length)],
    });
    return { door: info.door, w, d, r: Math.hypot(w, d) / 2 };
  });

  // Moradores (população: 65% adultos, 5% crianças, 30% idosos)
  v.addWanderers(14);
  for (let i = 0; i < 6; i++) {
    const a = v.rnd() * Math.PI * 2, r = 8 + v.rnd() * 14;
    v.addNPC({
      id: `renascimento-idoso-${i}`, name: 'Idoso', look: { hunch: 0.2, hair: 0xcfcfcf, height: 1.65 },
      x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, facing: v.rnd() * 6,
    });
  }
  v.addNPC({ id: 'renascimento-crianca', name: 'Criança', look: { height: 1.15, build: 0.85 }, x: cx + 6, z: cz + 10 });

  v.finalize();
  return v;
}
