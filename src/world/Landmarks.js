import * as THREE from 'three';
import { StaticBatcher } from '../render/StaticBatcher.js';
import { G, local, groundUnder, house, well, marketStall, dryingRack, crate, barrel, firePit } from '../villages/Builders.js';
import { mulberry32 } from './Noise.js';
import { createGiantTree, createGiantTreeMaterials } from './TreeFactory.js';

/** Geometrias extras dos marcos. */
const LG = {
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  taper8: new THREE.CylinderGeometry(0.62, 1, 1, 8),
  spire7: new THREE.ConeGeometry(1, 1, 7),
  /** Tronco de pirâmide quadrada: base 1 x 1, topo 0,78 x 0,78, altura 1. */
  frustum: new THREE.CylinderGeometry(0.78 * Math.SQRT1_2, Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  /** Patamar de templo: topo 0,93 da base (sobra um degrau para o patamar de cima). */
  tier: new THREE.CylinderGeometry(0.93 * Math.SQRT1_2, Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  /** Ameia triangular (estilo sudano-saheliano). */
  merlon: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
};

/**
 * Constrói os marcos do mapa (`LANDMARKS` em `src/config/landmarks.js`):
 * Torre Negra, Templo dos Degraus, Fortaleza das Areias, Povoado do Oásis,
 * Muralhas de Pedra, Pináculos Pretos e as árvores anciãs.
 *
 * As áreas aplainadas são registradas antes do terreno (`flatZones`); depois
 * do terreno pronto, `build()` ergue a geometria.
 *
 * @example
 *   const lm = new Landmarks(LANDMARKS, uvToWorld);
 *   lm.registerFlatZones(generator);      // antes de terrain.generate()
 *   scene.add(lm.build(game));            // depois do terreno
 *   lm.nearest(x, z)                      // { config, distance } para a UI
 */
export class Landmarks {
  /**
   * @param {object[]} list `LANDMARKS`
   * @param {(u: number, v: number) => { x: number, z: number }} toWorld
   */
  constructor(list, toWorld) {
    this.items = list.map((cfg) => ({ ...toWorld(cfg.u, cfg.v), config: cfg }));
    this.group = new THREE.Group();
    this.group.name = 'landmarks';
    /** Árvores pedidas pelos marcos (plantadas depois, por `Vegetation.plant`). */
    this.plants = [];
  }

  /** Aplaina o chão dos marcos que pedem `flatten`. */
  registerFlatZones(generator) {
    for (const it of this.items) {
      const f = it.config.flatten;
      if (f) generator.addFlatZone({ x: it.x, z: it.z, radius: f.radius, blend: f.blend });
    }
  }

  /** Verdadeiro se (x, z) está na área livre de vegetação de algum marco. */
  isClear(x, z, pad = 0) {
    for (const it of this.items) {
      const r = it.config.clear + pad;
      const dx = x - it.x, dz = z - it.z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /** Marco mais próximo dentro do raio de anúncio (clear × 1,6). */
  nearest(x, z) {
    let best = null;
    for (const it of this.items) {
      const d = Math.hypot(x - it.x, z - it.z);
      if (d < it.config.clear * 1.6 && (!best || d < best.distance)) best = { config: it.config, distance: d, x: it.x, z: it.z };
    }
    return best;
  }

  /**
   * Ergue todos os marcos.
   * @param {{ terrain, collisions, materials, timeUniform, photos }} game
   */
  build(game) {
    const batch = new StaticBatcher();
    for (const it of this.items) {
      const ctx = {
        batch, dynamic: this.group, collisions: game.collisions, terrain: game.terrain,
        M: game.materials, rnd: mulberry32(it.config.id.length * 991 + Math.round(it.x)), plants: this.plants,
      };
      const fn = BUILDERS[it.config.type];
      if (fn) fn(ctx, { x: it.x, z: it.z, rot: it.config.rot ?? 0, cfg: it.config, game });
    }
    batch.build(this.group);
    return this.group;
  }
}

/** Atalho: peça em coordenadas locais (rot em Y, frente = +Z local). */
function placer(ctx, x, z, rot, y0) {
  return (geo, mat, { lx = 0, ly = 0, lz = 0, w = 1, h = 1, d = 1, rx = 0, ry = 0, rz = 0 }) => {
    const p = local(x, z, rot, lx, lz);
    ctx.batch.add(geo, mat, { x: p.x, y: y0 + ly, z: p.z, rx, ry: rot + ry, rz, sx: w, sy: h, sz: d });
  };
}

/** Colisão circular / retangular em coordenadas locais. */
function solidCircle(ctx, x, z, rot, lx, lz, r, tag) {
  const p = local(x, z, rot, lx, lz);
  ctx.collisions.addCircle(p.x, p.z, r, tag);
}
function solidBox(ctx, x, z, rot, lx, lz, hw, hd, ry, tag) {
  const p = local(x, z, rot, lx, lz);
  ctx.collisions.addBox(p.x, p.z, hw, hd, rot + ry, tag);
}

/** Muro reto entre dois pontos locais (com colisão). */
function wallSeg(ctx, P, x, z, rot, ax, az, bx, bz, { h, t, mat, tag = 'landmark', ly = 0 }) {
  const len = Math.hypot(bx - ax, bz - az);
  const ry = Math.atan2(bx - ax, bz - az);
  const lx = (ax + bx) / 2, lz = (az + bz) / 2;
  P(G.box, mat, { lx, lz, ly: ly + h / 2, w: t, h, d: len + t * 0.5, ry });
  solidBox(ctx, x, z, rot, lx, lz, t / 2, len / 2, ry, tag);
  return { len, ry, lx, lz };
}

// ============================================================== construtores

const BUILDERS = {
  /** Torre Negra: pináculo octogonal de basalto com fendas que brilham. */
  darkTower(ctx, { x, z, rot }) {
    const { M } = ctx;
    const y0 = groundUnder(ctx, x, z, rot, 11, 11) - 0.6;
    const P = placer(ctx, x, z, rot, y0);
    // Embasamento em três degraus.
    [[12, 1.4], [10, 1.2], [8.4, 1.2]].reduce((y, [r, h]) => {
      P(LG.cyl8, M.basalt, { ly: y + h / 2, w: r, h, d: r, ry: Math.PI / 8 });
      return y + h;
    }, 0);
    const baseTop = 3.8, shaftH = 34, R = 6.4;
    // Contrafortes (8 aletas inclinadas).
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      P(G.box, M.basaltDark, { lx: Math.cos(a) * (R + 0.6), lz: Math.sin(a) * (R + 0.6), ly: baseTop + 7, w: 0.9, h: 15, d: 3.2, ry: Math.PI / 2 - a, rx: -0.14 });
    }
    // Fuste afunilado, anéis e fendas de luz.
    P(LG.taper8, M.basaltDark, { ly: baseTop + shaftH / 2, w: R, h: shaftH, d: R, ry: Math.PI / 8 });
    const rAt = (y) => R * (1 - 0.38 * (y / shaftH));
    for (let y = 7; y < shaftH; y += 7) {
      P(LG.cyl8, M.basalt, { ly: baseTop + y, w: rAt(y) + 0.35, h: 0.6, d: rAt(y) + 0.35, ry: Math.PI / 8 });
    }
    for (let y = 5; y < shaftH - 2; y += 4.5) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + (y % 9 > 4 ? Math.PI / 4 : 0);
        const r = rAt(y) * Math.cos(Math.PI / 8) - 0.05;
        P(G.box, M.runeGlow, { lx: Math.cos(a) * r, lz: Math.sin(a) * r, ly: baseTop + y, w: 0.35, h: 1.8, d: 0.35, ry: Math.PI / 2 - a });
      }
    }
    // Coroa com ameias, agulha e orbe.
    const top = baseTop + shaftH;
    P(LG.cyl8, M.basalt, { ly: top + 0.6, w: 4.9, h: 1.2, d: 4.9, ry: Math.PI / 8 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      P(G.pyramid, M.basaltDark, { lx: Math.cos(a) * 4.4, lz: Math.sin(a) * 4.4, ly: top + 2.2, w: 1.0, h: 2.2, d: 1.0 });
    }
    P(LG.spire7, M.basaltDark, { ly: top + 1.2 + 8, w: 3.2, h: 16, d: 3.2 });
    P(G.cyl6, M.iron, { ly: top + 18.5, w: 0.12, h: 3, d: 0.12 });
    P(G.sphere, M.runeGlow, { ly: top + 20.2, w: 0.55, h: 0.55, d: 0.55 });
    solidCircle(ctx, x, z, rot, 0, 0, 10.5, 'landmark');
    // Anel de muro arruinado em volta.
    const rnd = ctx.rnd;
    for (let k = 0; k < 14; k++) {
      if (k === 3 || k === 10) continue; // passagens
      const a0 = (k / 14) * Math.PI * 2, a1 = ((k + 0.85) / 14) * Math.PI * 2;
      const h = 1.2 + rnd() * 3.8;
      wallSeg(ctx, P, x, z, rot, Math.cos(a0) * 24, Math.sin(a0) * 24, Math.cos(a1) * 24, Math.sin(a1) * 24, { h, t: 1.4, mat: M.basalt });
    }
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, r = 14 + rnd() * 14, s = 0.3 + rnd() * 1.0;
      P(G.rock, M.basalt, { lx: Math.cos(a) * r, lz: Math.sin(a) * r, ly: s * 0.3, w: s * 1.4, h: s * 0.8, d: s });
    }
  },

  /** Templo dos Degraus: pirâmide de seis patamares com escadaria e santuário. */
  stepTemple(ctx, { x, z, rot }) {
    const { M } = ctx;
    const y0 = groundUnder(ctx, x, z, rot, 22, 22) - 0.5;
    const P = placer(ctx, x, z, rot, y0);
    const tiers = 6, tierH = 3.6, base = 42, topW = 13;
    for (let i = 0; i < tiers; i++) {
      const s = base - (base - topW) * (i / (tiers - 1));
      P(LG.tier, M.mossStone, { ly: i * tierH + tierH / 2, w: s, h: tierH, d: s });
      P(G.box, M.stoneDark, { ly: (i + 1) * tierH - 0.25, w: s * 0.935, h: 0.5, d: s * 0.935 }); // friso
      P(G.box, M.stone, { ly: i * tierH + 0.3, w: s + 0.2, h: 0.6, d: s + 0.2 }); // soco
    }
    const H = tiers * tierH;
    // Escadaria frontal com balaustradas.
    const run = base / 2 - topW / 2 + 1.5, z0 = base / 2 + 1.5;
    const steps = Math.round(H / 0.45);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      P(G.box, M.stone, { lz: z0 - t * run - 0.6, ly: (k + 0.5) * (H / steps), w: 7, h: H / steps, d: 1.6 });
    }
    const slope = Math.atan2(H, run), slen = Math.hypot(H, run);
    for (const s of [-1, 1]) {
      P(G.box, M.stoneDark, { lx: s * 4, lz: z0 - run / 2, ly: H / 2 + 0.5, w: 1.0, h: 1.2, d: slen, rx: slope });
      P(G.box, M.stoneDark, { lx: s * 4, lz: z0 + 0.3, ly: 1.0, w: 1.4, h: 2.0, d: 1.4 });
      P(G.sphere, M.stone, { lx: s * 4, lz: z0 + 0.3, ly: 2.3, w: 0.6, h: 0.6, d: 0.6 });
    }
    // Santuário no topo: paredes, portal, teto em laje e braseiros.
    P(G.box, M.stone, { ly: H + 2.5, lz: -1, w: 9, h: 5, d: 7 });
    P(G.box, M.darkOpening, { ly: H + 1.6, lz: 2.52, w: 2.2, h: 3.2, d: 0.1 });
    P(G.box, M.stoneDark, { ly: H + 3.4, lz: 2.6, w: 3.4, h: 0.6, d: 0.4 });
    P(G.box, M.stoneDark, { ly: H + 5.3, lz: -1, w: 10.4, h: 0.6, d: 8.4 });
    P(LG.frustum, M.mossStone, { ly: H + 6.6, lz: -1, w: 8, h: 2, d: 6 });
    for (const s of [-1, 1]) {
      P(G.cyl, M.stoneDark, { lx: s * 3.6, lz: 4.2, ly: H + 0.6, w: 0.5, h: 1.2, d: 0.5 });
      P(G.sphere, M.runeGlow, { lx: s * 3.6, lz: 4.2, ly: H + 1.35, w: 0.42, h: 0.3, d: 0.42 });
    }
    // Cipós escorrendo pelos patamares.
    const rnd = ctx.rnd;
    for (let i = 0; i < 46; i++) {
      const tier = Math.floor(rnd() * tiers);
      const s = base - (base - topW) * (tier / (tiers - 1));
      const side = Math.floor(rnd() * 4), along = (rnd() - 0.5) * s * 0.8;
      if (side === 0 && Math.abs(along) < 5) continue; // não cobrir a escada
      const a = side * Math.PI / 2;
      const off = s * 0.485;
      const len = 1.5 + rnd() * 3;
      P(G.box, M.vine, {
        lx: Math.sin(a) * off + Math.cos(a) * along, lz: Math.cos(a) * off - Math.sin(a) * along,
        ly: (tier + 1) * tierH - len / 2, w: 0.5 + rnd() * 0.9, h: len, d: 0.12, ry: a, rx: 0.04,
      });
    }
    // Estelas e colunas caídas em volta.
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, r = 27 + rnd() * 14;
      if (rnd() < 0.5) P(G.box, M.mossStone, { lx: Math.cos(a) * r, lz: Math.sin(a) * r, ly: 1.4, w: 1.1, h: 2.8 + rnd(), d: 0.5, ry: a, rz: (rnd() - 0.5) * 0.3 });
      else P(G.cyl, M.mossStone, { lx: Math.cos(a) * r, lz: Math.sin(a) * r, ly: 0.45, w: 0.5, h: 4 + rnd() * 2, d: 0.5, rz: Math.PI / 2, ry: a });
    }
    solidBox(ctx, x, z, rot, 0, 0, base / 2, base / 2, 0, 'landmark');
    solidBox(ctx, x, z, rot, 0, z0 - run / 2, 4.2, run / 2, 0, 'landmark');
  },

  /** Fortaleza das Areias: cidadela de barro com torres afuniladas e torreão. */
  desertFortress(ctx, { x, z, rot }) {
    const { M } = ctx;
    const S = 40, wallH = 10, t = 2.6;
    const y0 = groundUnder(ctx, x, z, rot, S, S) - 0.6;
    const P = placer(ctx, x, z, rot, y0);
    const wall = M.adobeRed, dark = M.mudBrickDark;
    const merlons = (ax, az, bx, bz, y) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 2.2);
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        P(LG.merlon, wall, { lx: ax + (bx - ax) * k, lz: az + (bz - az) * k, ly: y + 0.6, w: 0.9, h: 1.2, d: 0.9 });
      }
    };
    const torons = (ax, az, bx, bz, y, nx, nz) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 1.6);
      for (let i = 1; i < n; i++) {
        const k = i / n;
        P(G.cyl6, M.woodDark, { lx: ax + (bx - ax) * k + nx * 0.3, lz: az + (bz - az) * k + nz * 0.3, ly: y, w: 0.08, h: 1.0, d: 0.08, rx: Math.PI / 2, ry: Math.atan2(nx, nz) });
      }
    };
    // Muralha com portão na frente (+Z).
    const gate = 5;
    const sides = [
      [[-S, -S], [S, -S], [0, -1]], [[S, -S], [S, S], [1, 0]], [[-S, S], [-S, -S], [-1, 0]],
      [[-S, S], [-gate, S], [0, 1]], [[gate, S], [S, S], [0, 1]],
    ];
    for (const [[ax, az], [bx, bz], [nx, nz]] of sides) {
      wallSeg(ctx, P, x, z, rot, ax, az, bx, bz, { h: wallH, t, mat: wall });
      P(G.box, dark, { lx: (ax + bx) / 2 + nx * (t / 2 + 0.3), lz: (az + bz) / 2 + nz * (t / 2 + 0.3), ly: 1.2, w: Math.abs(bx - ax) + (nx ? 0.6 : 0), h: 2.4, d: Math.abs(bz - az) + (nz ? 0.6 : 0) });
      merlons(ax + nx * t * 0.3, az + nz * t * 0.3, bx + nx * t * 0.3, bz + nz * t * 0.3, wallH);
      torons(ax, az, bx, bz, wallH * 0.6, nx * t / 2, nz * t / 2);
    }
    // Torres de canto e de portão (troncos de pirâmide).
    const tower = (lx, lz, s, h) => {
      P(LG.frustum, wall, { lx, lz, ly: h / 2, w: s, h, d: s });
      P(G.box, dark, { lx, lz, ly: h + 0.3, w: s * 0.84, h: 0.6, d: s * 0.84 });
      const e = s * 0.39;
      for (const [ax, az, bx, bz] of [[-e, -e, e, -e], [e, -e, e, e], [e, e, -e, e], [-e, e, -e, -e]]) merlons(lx + ax, lz + az, lx + bx, lz + bz, h + 0.6);
      for (let y = h * 0.35; y < h - 2; y += h * 0.3) {
        for (const [ox, oz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const r = s / 2 * (1 - 0.22 * (y / h)) + 0.02;
          P(G.box, M.darkOpening, { lx: lx + ox * r, lz: lz + oz * r, ly: y, w: oz ? 0.5 : 0.08, h: 1.3, d: ox ? 0.5 : 0.08 });
        }
      }
      solidBox(ctx, x, z, rot, lx, lz, s / 2, s / 2, 0, 'landmark');
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tower(sx * S, sz * S, 9, 17);
    for (const sx of [-1, 1]) tower(sx * (gate + 3), S, 6.5, 14);
    P(G.box, dark, { lz: S, ly: 12.2, w: gate * 2 + 2, h: 2.4, d: t + 0.4 }); // arco do portão
    P(G.box, M.woodDark, { lz: S - 0.5, ly: 4.2, w: gate * 2 - 0.2, h: 8.4, d: 0.3 }); // portão (aberto pela metade)
    // Torreão central e minarete.
    P(LG.frustum, wall, { lz: -12, ly: 13, w: 24, h: 26, d: 20 });
    P(G.box, dark, { lz: -12, ly: 26.3, w: 19, h: 0.7, d: 15.8 });
    merlons(-9, -19.5, 9, -19.5, 26.6); merlons(-9, -4.5, 9, -4.5, 26.6);
    merlons(-9, -19.5, -9, -4.5, 26.6); merlons(9, -19.5, 9, -4.5, 26.6);
    for (let y = 6; y < 24; y += 5.5) for (let i = -2; i <= 2; i++) {
      P(G.box, M.darkOpening, { lx: i * 3.6, lz: -12 + 10 * (1 - 0.22 * (y / 26)) + 0.02, ly: y, w: 0.9, h: 1.6, d: 0.1 });
    }
    torons(-11, -2, 11, -2, 18, 0, 0.4); torons(-11, -2, 11, -2, 9, 0, 0.6);
    P(LG.frustum, wall, { lx: 14, lz: -24, ly: 18, w: 5.5, h: 36, d: 5.5 });
    P(G.pyramid, dark, { lx: 14, lz: -24, ly: 37.5, w: 4.2, h: 3, d: 4.2 });
    P(G.sphere, M.gold, { lx: 14, lz: -24, ly: 39.4, w: 0.45, h: 0.45, d: 0.45 });
    solidBox(ctx, x, z, rot, 0, -12, 12, 10, 0, 'landmark');
    solidBox(ctx, x, z, rot, 14, -24, 2.8, 2.8, 0, 'landmark');
    // Pátio: casas de teto plano, poço e mercadoria.
    const yard = [[-26, -8], [-26, 10], [26, -6], [26, 12], [-12, 22], [12, 24]];
    for (const [lx, lz] of yard) {
      const p = local(x, z, rot, lx, lz);
      house(ctx, { x: p.x, z: p.z, rot: rot + (Math.abs(lx) > 20 ? Math.sign(lx) * -Math.PI / 2 : Math.PI), w: 7, d: 6, h: 3.4, wall: M.adobeOchre, roof: 'flat' });
    }
    const wp = local(x, z, rot, 0, 14);
    well(ctx, { x: wp.x, z: wp.z });
    for (let i = 0; i < 5; i++) {
      const p = local(x, z, rot, -6 + i * 3, 30);
      if (i % 2) crate(ctx, { x: p.x, z: p.z, rot }); else barrel(ctx, { x: p.x, z: p.z });
    }
  },

  /** Povoado do Oásis: anel de casas de teto plano em volta de poço e feira. */
  desertSettlement(ctx, { x, z, rot }) {
    const { M } = ctx;
    const rnd = ctx.rnd;
    const walls = [M.adobeOchre, M.adobePastel, M.adobeWhite, M.adobeRed];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      const r = 30 + rnd() * 8;
      house(ctx, {
        x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, rot: Math.atan2(-Math.cos(a), -Math.sin(a)),
        w: 6 + rnd() * 3, d: 5 + rnd() * 2, h: 3 + rnd() * 1.4, wall: walls[i % walls.length], roof: 'flat',
      });
    }
    well(ctx, { x, z });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      marketStall(ctx, { x: x + Math.cos(a) * 12, z: z + Math.sin(a) * 12, rot: Math.atan2(-Math.cos(a), -Math.sin(a)) });
    }
    // Palmeiras do oásis em volta do poço e entre as casas.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.3, r = 6 + rnd() * 3;
      ctx.plants.push({ type: 'palm', x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, s: 0.9 + rnd() * 0.4, ry: rnd() * 6 });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.5, r = 22 + rnd() * 4;
      ctx.plants.push({ type: 'palm', x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, s: 0.8 + rnd() * 0.4, ry: rnd() * 6 });
    }
    dryingRack(ctx, { x: x + 18, z: z - 4, rot: 0.4 });
    firePit(ctx, { x: x - 17, z: z + 6 });
    // Muro baixo de barro com duas entradas.
    const P = placer(ctx, x, z, rot, ctx.terrain.heightAt(x, z) - 0.3);
    for (let k = 0; k < 28; k++) {
      if (k === 0 || k === 14) continue;
      const a0 = (k / 28) * Math.PI * 2, a1 = ((k + 1) / 28) * Math.PI * 2, R = 47;
      wallSeg(ctx, P, x, z, rot, Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R, { h: 1.8, t: 0.7, mat: M.mudBrick });
    }
  },

  /** Muralhas de Pedra: recinto elíptico de pedra seca com torre cônica. */
  stoneEnclosure(ctx, { x, z, rot }) {
    const { M } = ctx;
    const A = 36, B = 27, H = 9;
    const y0 = groundUnder(ctx, x, z, rot, A, B) - 0.4;
    const P = placer(ctx, x, z, rot, y0);
    const N = 72;
    const pt = (k) => {
      const a = (k / N) * Math.PI * 2;
      return [Math.cos(a) * A, Math.sin(a) * B];
    };
    for (let k = 0; k < N; k++) {
      if (k >= 17 && k <= 19) continue; // entrada
      const [ax, az] = pt(k), [bx, bz] = pt(k + 1);
      // Muro largo na base e estreito no alto (dois blocos).
      wallSeg(ctx, P, x, z, rot, ax, az, bx, bz, { h: H * 0.55, t: 4.2, mat: M.dryStone });
      const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
      P(G.box, M.dryStone, { lx: (ax + bx) / 2, lz: (az + bz) / 2, ly: H * 0.55 + H * 0.225, w: 2.6, h: H * 0.45, d: len + 1.2, ry });
      // Faixa em zigue-zague (chevron) perto do topo.
      if (k % 2 === 0 && (k < 8 || k > 60)) {
        P(G.box, M.stoneDark, { lx: (ax + bx) / 2, lz: (az + bz) / 2, ly: H - 1.4, w: 2.7, h: 0.5, d: len * 0.6, ry, rx: 0.5 });
      }
    }
    // Torre cônica maciça.
    P(G.cyl, M.dryStone, { lx: 12, lz: -6, ly: 5.5, w: 5.2, h: 11, d: 5.2 });
    P(G.cyl, M.dryStone, { lx: 12, lz: -6, ly: 12, w: 3.6, h: 2, d: 3.6 });
    P(G.cone, M.dryStone, { lx: 12, lz: -6, ly: 13.6, w: 3.4, h: 1.4, d: 3.4 });
    solidCircle(ctx, x, z, rot, 12, -6, 5.4, 'landmark');
    // Muros internos e ruínas de cabanas.
    wallSeg(ctx, P, x, z, rot, 4, -18, 20, -12, { h: 5, t: 2, mat: M.dryStone });
    wallSeg(ctx, P, x, z, rot, 20, 4, 26, -10, { h: 4.4, t: 2, mat: M.dryStone });
    const rnd = ctx.rnd;
    for (let i = 0; i < 5; i++) {
      const lx = -22 + i * 8 + rnd() * 3, lz = (rnd() - 0.2) * 14;
      // Cabana em ruínas: anel de tocos de parede com a porta aberta.
      for (let k = 0; k < 12; k++) {
        if (k === 0) continue;
        const a = (k / 12) * Math.PI * 2, hh = 0.5 + rnd() * 1.5;
        P(G.box, M.adobeRed, { lx: lx + Math.cos(a) * 2.4, lz: lz + Math.sin(a) * 2.4, ly: hh / 2, w: 0.45, h: hh, d: 1.3, ry: Math.PI / 2 - a + Math.PI / 2 });
      }
      P(G.rock, M.rubble, { lx: lx + 0.4, lz: lz - 0.3, ly: 0.2, w: 0.9, h: 0.4, d: 0.7 });
    }
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2, r = 0.7 + rnd() * 0.5;
      const s = 0.25 + rnd() * 0.5;
      P(G.rock, M.dryStone, { lx: Math.cos(a) * A * r, lz: Math.sin(a) * B * r, ly: s * 0.3, w: s * 1.4, h: s * 0.7, d: s });
    }
  },

  /** Pináculos Pretos: agulhas de basalto, arco em ruínas e runas acesas. */
  blackSpires(ctx, { x, z, rot }) {
    const { M } = ctx;
    const rnd = ctx.rnd;
    const spires = [[0, 0, 7, 46], [14, -8, 4.5, 30], [-12, -10, 5, 34], [-6, 14, 3.4, 22], [16, 12, 3, 18], [-20, 6, 2.6, 15], [6, -22, 3.8, 26]];
    for (const [lx, lz, r, h] of spires) {
      const p = local(x, z, rot, lx, lz);
      const y = ctx.terrain.heightAt(p.x, p.z) - 2;
      const lean = (rnd() - 0.5) * 0.12, ry = rnd() * 6;
      ctx.batch.add(LG.spire7, M.basaltDark, { x: p.x, y: y + h / 2, z: p.z, ry, rz: lean, sx: r, sy: h, sz: r });
      ctx.batch.add(LG.spire7, M.basalt, { x: p.x + r * 0.5, y: y + h * 0.18, z: p.z - r * 0.3, ry: ry + 1, rz: lean - 0.2, sx: r * 0.6, sy: h * 0.36, sz: r * 0.6 });
      // Runas: fendas acesas na face da agulha.
      for (let k = 0; k < 3; k++) {
        const yy = h * (0.2 + k * 0.12), rr = r * (1 - (yy + 2) / h) * 0.95;
        const a = ry + k * 2.1;
        ctx.batch.add(G.box, M.runeGlow, { x: p.x + Math.cos(a) * rr, y: y + yy, z: p.z + Math.sin(a) * rr, ry: Math.PI / 2 - a, sx: 0.25, sy: 1.2, sz: 0.25 });
      }
      ctx.collisions.addCircle(p.x, p.z, r * 0.8, 'landmark');
    }
    // Arco arruinado.
    const ap = local(x, z, rot, 0, 26);
    const y0 = ctx.terrain.heightAt(ap.x, ap.z) - 0.3;
    const P = placer(ctx, ap.x, ap.z, rot, y0);
    for (const s of [-1, 1]) {
      P(G.box, M.basalt, { lx: s * 3.2, ly: 4, w: 1.6, h: 8, d: 1.6 });
      ctx.collisions.addCircle(local(ap.x, ap.z, rot, s * 3.2, 0).x, local(ap.x, ap.z, rot, s * 3.2, 0).z, 1.1, 'landmark');
    }
    P(G.box, M.basaltDark, { ly: 8.5, w: 8.6, h: 1.2, d: 1.8, rz: 0.06 });
    P(G.box, M.runeGlow, { ly: 8.5, lz: 0.92, w: 4, h: 0.18, d: 0.04 });
    for (let i = 0; i < 35; i++) {
      const a = rnd() * Math.PI * 2, r = 8 + rnd() * 26, s = 0.3 + rnd() * 1.2;
      const p = local(x, z, rot, Math.cos(a) * r, Math.sin(a) * r);
      ctx.batch.add(G.rock, M.basaltDark, { x: p.x, y: ctx.terrain.heightAt(p.x, p.z) + s * 0.2, z: p.z, ry: a, sx: s * 1.3, sy: s * 0.8, sz: s });
    }
  },

  /** Árvore anciã: geometria única com casca e folhagem em foto. */
  giantTree(ctx, { x, z, cfg, game }) {
    const height = cfg.height ?? 60;
    const { geometry, trunkRadius } = createGiantTree(height, cfg.id.length);
    const mats = createGiantTreeMaterials(game.timeUniform, game.photos);
    const mesh = new THREE.Mesh(geometry, mats);
    mesh.position.set(x, ctx.terrain.heightAt(x, z) - 0.4, z);
    mesh.rotation.y = cfg.rot ?? 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = cfg.id;
    ctx.dynamic.add(mesh);
    ctx.collisions.addCircle(x, z, trunkRadius * 0.62, 'landmark');
  },
};
