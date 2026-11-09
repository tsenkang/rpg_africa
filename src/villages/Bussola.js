import { Village } from './Village.js';
import * as B from './Builders.js';
import { VILLAGES, EXTRA_FLAT_ZONES } from '../config/villages.js';
import { uvToWorld } from '../config/worldConfig.js';
import { Mechanics } from '../systems/Mechanics.js';

/**
 * VILA BÚSSOLA DO SUL — às margens do rio, a mais rica.
 * Muralha com canhões e guardas (portão só abre com a confiança do
 * prefeito), maior catedral, mansão, grande relógio (cofre embaixo),
 * duas feiras, área comercial, plantações, fazenda e porto de pesca.
 */
export function buildBussola(game) {
  const v = new Village(game, VILLAGES.bussola, 404);
  const { ctx } = v;
  const { M } = ctx;
  const cx = v.x, cz = v.z;
  const R = v.radius;
  const T = game.terrain;

  // Procura a água (rio) mais próxima para virar o portão e o porto para ela.
  let river = { a: 0, d: Infinity };
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    for (let d = R + 8; d < R + 260; d += 4) {
      if (T.heightAt(cx + Math.cos(a) * d, cz + Math.sin(a) * d) < -0.6) {
        if (d < river.d) river = { a, d };
        break;
      }
    }
  }
  const gateA = Number.isFinite(river.d) ? river.a : 0;

  const wall = B.fortressWall(ctx, { x: cx, z: cz, r: R, gateAngle: gateA, height: 9, thickness: 3, towers: 12 });
  v.gate = wall.gate;
  v.street(cx, cz, wall.gate.outside.x + Math.cos(gateA) * 10, wall.gate.outside.z + Math.sin(gateA) * 10, 7, 0x76654f);

  // Guardas: nas torres e no portão
  wall.towers.forEach((t, i) => {
    if (i % 2) return;
    v.addNPC({ id: `bussola-torre-${i}`, name: 'Guarda', look: { hat: 'helmet', accessory: 'rifle', shirt: 0x2e3a4a }, x: t.x, z: t.z, y: t.y, facing: Math.atan2(Math.cos(t.angle), Math.sin(t.angle)) });
  });
  const out = wall.gate.outside;
  const side = { x: -Math.sin(gateA), z: Math.cos(gateA) };
  v.addNPC({
    id: 'bussola-guarda-portao', name: 'Guarda do Portão', title: 'Bússola do Sul',
    look: { hat: 'helmet', accessory: 'rifle', shirt: 0x2e3a4a, build: 1.1 },
    x: out.x + side.x * 5, z: out.z + side.z * 5, facing: Math.atan2(Math.cos(gateA), Math.sin(gateA)),
    onInteract: (g) => Mechanics.gateGuard(g),
  });
  v.addNPC({
    id: 'mensageiro-prefeito', name: 'Mensageiro do Prefeito', title: 'Confiança',
    look: { shirt: 0x1f4a6a, robe: true, hat: null, skin: 0x4a2c1c },
    x: out.x - side.x * 5, z: out.z - side.z * 5, facing: Math.atan2(Math.cos(gateA), Math.sin(gateA)),
    onInteract: (g) => Mechanics.mayorEnvoy(g),
  });

  // Praça central com o grande relógio (cofre embaixo)
  B.plaza(ctx, { x: cx, z: cz, r: 22, mat: M.cobble });
  v.reserve(cx, cz, 23);
  const clock = B.clockTower(ctx, { x: cx, z: cz, rot: gateA - Math.PI / 2 + Math.PI });
  // porta do cofre voltada para o portão
  game.interactions.register({
    id: 'bussola-cofre', label: 'Examinar a porta do relógio', radius: 3,
    position: { x: clock.vaultDoor.x, y: clock.y0 + 1.2, z: clock.vaultDoor.z },
    onInteract: (g) => Mechanics.vault(g),
  });

  // Catedral (lado oposto ao portão) e mansão
  const back = gateA + Math.PI;
  const catX = cx + Math.cos(back) * 62, catZ = cz + Math.sin(back) * 62;
  const catRot = Math.atan2(cx - catX, cz - catZ);
  const cat = B.cathedral(ctx, { x: catX, z: catZ, rot: catRot });
  v.reserve(catX, catZ, 34);
  v.street(cx, cz, cat.door.x, cat.door.z, 6, 0x8a7a66);
  v.addNPC({ id: 'bispo', name: 'Bispo', title: 'Catedral', look: { robe: true, shirt: 0x5a1a2a }, x: cat.door.x, z: cat.door.z, facing: catRot, onInteract: (g) => Mechanics.priest(g) });

  const manA = back + Math.PI / 2;
  const manX = cx + Math.cos(manA) * 60, manZ = cz + Math.sin(manA) * 60;
  const manRot = Math.atan2(cx - manX, cz - manZ);
  const man = B.mansion(ctx, { x: manX, z: manZ, rot: manRot });
  v.reserve(manX, manZ, 22);
  v.street(cx, cz, man.door.x, man.door.z, 5, 0x8a7a66);
  v.addNPC({
    id: 'prefeito', name: 'Prefeito', title: 'Mansão',
    look: { shirt: 0xe8e0d0, robe: true, hat: null, build: 1.25, skin: 0x3a2214 },
    x: man.door.x, z: man.door.z, facing: manRot,
    onInteract: (g) => Mechanics.mayor(g),
  });

  // Área comercial (avenida do portão até a praça)
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      const t = 32 + i * 12;
      const x = cx + Math.cos(gateA) * t + side.x * s * 11;
      const z = cz + Math.sin(gateA) * t + side.z * s * 11;
      const rot = Math.atan2(-side.x * s, -side.z * s);
      const sh = B.shop(ctx, { x, z, rot, w: 9, d: 7, roof: 'tile' });
      v.reserve(x, z, 6);
      if (i % 2 === 0 && s === 1) {
        const name = ['Casa de Câmbio Luiheid', 'Armazém do Sul', 'Joalheria Ouro do Rio'][i / 2];
        v.addNPC({ id: `bussola-loja-${i}`, name, title: 'Comércio', x: sh.door.x, z: sh.door.z, facing: rot, onInteract: (g) => Mechanics.shopkeeper(g, { name, village: 'Vila Bússola do Sul' }) });
      }
    }
  }

  // Duas feiras
  for (const fa of [manA + Math.PI, gateA + Math.PI * 0.7]) {
    const fx = cx + Math.cos(fa) * 55, fz = cz + Math.sin(fa) * 55;
    if (!v.isFree(fx, fz, 10)) continue;
    v.paintDisc(fx, fz, 15, 0x8a7a66);
    for (let k = 0; k < 9; k++) B.marketStall(ctx, { x: fx + (k % 3) * 4.5 - 4.5, z: fz + Math.floor(k / 3) * 6 - 6, rot: fa });
    v.reserve(fx, fz, 16);
  }

  // Casas menores, ricas (telha e reboco)
  const walls = [M.adobeWhite, M.adobePastel, M.adobeOchre, M.stoneLight];
  for (let i = 0; i < 900; i++) {
    const a = v.rnd() * Math.PI * 2, r = 28 + Math.sqrt(v.rnd()) * (R - 36);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!v.isFree(x, z, 4.5)) continue;
    B.house(ctx, { x, z, rot: Math.atan2(cx - x, cz - z), w: 7, d: 6, h: 3.3, wall: walls[Math.floor(v.rnd() * walls.length)], roof: 'tile' });
    v.reserve(x, z, 4.6);
  }

  // Plantações e fazenda fora da muralha
  for (const zone of EXTRA_FLAT_ZONES) {
    const c = uvToWorld(zone.u, zone.v);
    const n = zone.radius > 70 ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const fx = c.x + ((i % 2) - 0.5) * zone.radius * 0.8;
      const fz = c.z + (Math.floor(i / 2) - (n > 2 ? 0.5 : 0)) * zone.radius * 0.7;
      v.shapes.push(B.field(ctx, { x: fx, z: fz, rot: 0.1, w: zone.radius * 0.7, d: zone.radius * 0.55, crop: i % 2 ? 'maize' : 'other' }));
    }
  }
  const farmA = gateA + Math.PI * 0.55;
  const farmX = cx + Math.cos(farmA) * (R + 45), farmZ = cz + Math.sin(farmA) * (R + 45);
  B.corral(ctx, { x: farmX, z: farmZ, rot: farmA, w: 34, d: 22 });
  for (let i = 0; i < 10; i++) {
    const an = B.animal(ctx, { x: farmX + (v.rnd() - 0.5) * 26, z: farmZ + (v.rnd() - 0.5) * 16, kind: i < 6 ? 'cow' : 'goat' });
    v.animals.push(an);
  }
  B.house(ctx, { x: farmX + Math.cos(farmA) * 22, z: farmZ + Math.sin(farmA) * 22, rot: farmA + Math.PI, w: 10, d: 7, h: 3.6, wall: M.woodLight, roof: 'tin' });
  v.addNPC({ id: 'bussola-fazendeiro', name: 'Fazendeiro', look: { hat: 'straw' }, x: farmX - 8, z: farmZ, path: [{ x: farmX - 8, z: farmZ - 12 }, { x: farmX - 8, z: farmZ + 12 }] });

  // Porto de pesca no rio
  if (Number.isFinite(river.d)) {
    const pa = gateA + 0.25;
    let shore = river.d;
    for (let d = R + 6; d < R + 260; d += 1) {
      if (T.heightAt(cx + Math.cos(pa) * d, cz + Math.sin(pa) * d) < 0.4) { shore = d; break; }
    }
    const ax = cx + Math.cos(pa) * (shore - 4), az = cz + Math.sin(pa) * (shore - 4);
    const bx = cx + Math.cos(pa) * (shore + 22), bz = cz + Math.sin(pa) * (shore + 22);
    B.pier(ctx, { ax, az, bx, bz, width: 3.5, boats: 3 });
    game.pierDecks = game.pierDecks || [];
    game.pierDecks.push({ ax, az, bx, bz, width: 3.5, y: Math.max(1.0, T.heightAt(ax, az) + 0.2) + 0.05 });
    v.street(wall.gate.outside.x, wall.gate.outside.z, ax, az, 4);
    for (let i = 0; i < 4; i++) B.barrel(ctx, { x: ax - Math.cos(pa) * 3 + side.x * (i - 1.5) * 1.2, z: az - Math.sin(pa) * 3 + side.z * (i - 1.5) * 1.2 });
    v.addNPC({ id: 'pescador', name: 'Pescador', title: 'Porto', look: { hat: 'straw' }, x: ax + Math.cos(pa) * 6, z: az + Math.sin(pa) * 6, y: Math.max(1.0, T.heightAt(ax, az) + 0.2) + 0.05,
      onInteract: (g) => Mechanics.talk(g, { speaker: 'Pescador', title: 'Porto da Bússola', text: '"O rio dá peixe para a vila inteira. Os Luiheid compram tudo que sobra."' }) });
  }

  v.addWanderers(16);
  v.finalize();
  return v;
}
