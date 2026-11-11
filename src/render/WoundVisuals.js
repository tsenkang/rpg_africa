import * as THREE from 'three';
import { LIMBS } from '../config/survival.js';

/**
 * Ferimentos visíveis na malha 3D do personagem: cada ferimento do `Body`
 * vira um pequeno grupo de malhas preso à articulação do membro (ombro,
 * cotovelo, quadril ou joelho do Humanoid), então anda, corre e nada junto
 * com o corpo. Sincroniza pelos eventos do Body (nasce, muda, some).
 *
 * Referencial de cada ferimento: +Z sai da pele, Y corre ao longo do osso.
 * Cada malha leva `userData.woundId` (a inspeção corporal usa para clicar
 * e soltar remédios em cima).
 *
 * @example
 * const wv = new WoundVisuals(player.model, survival.body);
 * // no loop:
 * wv.update(dt, time); // sanguessuga se contorce, larva pulsa, pus brilha
 */
export class WoundVisuals {
  /**
   * @param {import('../entities/Humanoid.js').Humanoid} model
   * @param {import('../systems/Body.js').Body} body
   */
  constructor(model, body) {
    this.model = model;
    this.body = body;
    this.groups = new Map(); // woundId → THREE.Group
    this.mats = makeMaterials();
    this.geos = makeGeometries();
    for (const w of body.wounds) this.build(w);
    body.on('wound-added', (w) => this.build(w));
    body.on('wound-changed', (w) => this.build(w));
    body.on('wound-removed', (w) => this.drop(w.id));
  }

  /**
   * Articulação e medidas do segmento onde o ferimento fica.
   * @returns {{ joint: THREE.Object3D, len: number, radius: number }}
   */
  segment(limb, seg) {
    const L = LIMBS[limb], m = this.model;
    const i = L.side < 0 ? 0 : 1; // Humanoid cria lados [-1, +1]
    if (L.arm) {
      const upper = seg === 'upper';
      const joint = upper ? m.arms[i] : m.elbows[i];
      const len = Math.abs((upper ? m.elbows[i] : m.hands[i]).position.y);
      return { joint, len, radius: len * (upper ? 0.173 : 0.163) };
    }
    const upper = seg === 'upper';
    const joint = upper ? m.legs[i] : m.knees[i];
    const child = upper ? m.knees[i] : joint.children.find((c) => c.isGroup && c.position.y < 0) ?? m.knees[i];
    const len = Math.abs(child.position.y) || 0.42;
    return { joint, len, radius: len * (upper ? 0.186 : 0.148) };
  }

  /** (Re)cria as malhas de um ferimento. */
  build(w) {
    this.drop(w.id);
    const { joint, len, radius } = this.segment(w.limb, w.spot.seg);
    const g = new THREE.Group();
    g.name = `wound-${w.id}`;
    g.userData.woundId = w.id;
    // Ponto na superfície: ao longo do osso (−Y) e em volta dele (ângulo).
    const y = -w.spot.t * len;
    const pivot = new THREE.Group();
    pivot.position.y = y;
    pivot.rotation.y = w.spot.angle;
    const skin = new THREE.Group();
    skin.position.z = radius;
    pivot.add(skin);
    g.add(pivot);
    const anim = [];
    for (const mesh of this.meshesFor(w)) {
      mesh.userData.woundId = w.id;
      mesh.userData.base = mesh.scale.clone();
      if (mesh.userData.wiggle || mesh.userData.pulse) anim.push(mesh);
      skin.add(mesh);
    }
    g.userData.anim = anim;
    // Esfera invisível maior em volta do ferimento: alvo fácil para o mouse na inspeção.
    const pick = new THREE.Mesh(this.geos.dot, this.mats.pick);
    pick.scale.setScalar(0.03);
    pick.userData.woundId = w.id;
    pick.userData.pick = true;
    skin.add(pick);
    g.userData.radius = radius;
    // Curativo: faixa em volta do membro inteiro (não gira com o ferimento).
    if (w.bandage) {
      const band = new THREE.Mesh(this.geos.band, this.mats[`band_${w.bandage.suture ? 'sutura' : w.bandage.item}`] ?? this.mats.band_curativo_folha);
      band.scale.set(radius + 0.006, 1, radius + 0.006);
      band.position.y = y;
      band.userData.woundId = w.id;
      g.add(band);
    }
    g.userData.kind = w.type;
    g.userData.skin = skin;
    joint.add(g);
    this.groups.set(w.id, g);
  }

  drop(id) {
    const g = this.groups.get(id);
    if (!g) return;
    g.parent?.remove(g);
    this.groups.delete(id);
  }

  /** Malhas de cada tipo, no referencial da pele (+Z para fora). */
  meshesFor(w) {
    const G = this.geos, M = this.mats, out = [];
    const mk = (geo, mat, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1], rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.rotation.z = rz;
      out.push(m);
      return m;
    };
    switch (w.type) {
      case 'sanguessuga': {
        const leech = mk(G.capsule, M.leech, [0, 0, 0.006], [0.009, 0.015, 0.007]);
        leech.userData.wiggle = true;
        break;
      }
      case 'larva': {
        mk(G.dome, M.bump, [0, 0, 0], [0.016, 0.022, 0.009]).userData.pulse = true;
        mk(G.dot, M.puncture, [0, 0.004, 0.009], [0.0025, 0.0025, 0.0025]);
        break;
      }
      case 'arranhao':
        for (let k = -1; k <= 1; k++) mk(G.box, M.scratch, [k * 0.007, 0, 0.002], [0.0025, 0.045, 0.002], 0.35 + k * 0.05);
        break;
      case 'laceracao':
        mk(G.dome, M.flesh, [0, 0, 0], [0.012, 0.045, 0.004]);
        mk(G.dome, M.blood, [0, 0, 0.002], [0.007, 0.038, 0.004]).userData.pulse = true;
        mk(G.dome, M.blood, [0.002, -0.04, 0.001], [0.004, 0.018, 0.003]); // escorrendo
        break;
      case 'limpa':
        mk(G.dome, M.cleanFlesh, [0, 0, 0], [0.012, 0.04, 0.003]);
        break;
      case 'infeccao':
        mk(G.disc, M.inflamed, [0, 0, 0.001], [0.026, 0.026, 1]);
        mk(G.dome, M.pus, [0, 0, 0.002], [0.012, 0.02, 0.008]).userData.pulse = true;
        break;
      case 'veneno':
        mk(G.disc, M.venomHalo, [0, 0, 0.001], [0.032, 0.032, 1]).userData.pulse = true;
        for (const s of [-1, 1]) mk(G.dot, M.puncture, [s * 0.008, 0.003, 0.002], [0.003, 0.003, 0.003]);
        break;
      default:
        mk(G.dot, M.blood, [0, 0, 0.002], [0.006, 0.006, 0.003]);
    }
    return out;
  }

  /** Animação: sanguessuga se contorce, larva/pus/veneno pulsam. */
  update(dt, time) {
    for (const g of this.groups.values()) {
      for (const m of g.userData.anim) {
        const b = m.userData.base;
        if (m.userData.wiggle) {
          const s = 1 + Math.sin(time * 7 + m.id) * 0.18;
          m.scale.set(b.x / Math.sqrt(s), b.y * s, b.z);
        } else {
          m.scale.copy(b).multiplyScalar(1 + Math.sin(time * 3 + m.id) * 0.12);
        }
      }
    }
  }

  /** Alvos de clique da inspeção (uma esfera invisível por ferimento). */
  pickables() {
    const out = [];
    for (const g of this.groups.values()) for (const m of g.userData.skin.children) if (m.userData.pick) out.push(m);
    return out;
  }

  /**
   * Puxão na sanguessuga: afasta o ferimento da pele `amount` m (0 = solta).
   * @param {number} id ferimento
   */
  stretch(id, amount) {
    const g = this.groups.get(id);
    if (g) g.userData.skin.position.z = g.userData.radius + amount;
  }
}

function makeGeometries() {
  return {
    capsule: new THREE.CapsuleGeometry(1, 1, 3, 8),
    dome: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2),
    dot: new THREE.SphereGeometry(1, 8, 6),
    box: new THREE.BoxGeometry(1, 1, 1),
    disc: new THREE.CircleGeometry(1, 24),
    band: new THREE.CylinderGeometry(1, 1, 0.06, 16, 1, true),
  };
}

function makeMaterials() {
  const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
  const halo = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  return {
    leech: m(0x0c0a08, { roughness: 0.15, metalness: 0.2 }),
    bump: m(0xb06a58, { roughness: 0.8 }),
    puncture: m(0x1a0606, { roughness: 0.9 }),
    scratch: m(0xa01818, { emissive: 0x300000 }),
    flesh: m(0x8a1a16, { roughness: 0.35, emissive: 0x2a0402 }),
    blood: m(0xb00e0e, { roughness: 0.2, emissive: 0x400000 }),
    cleanFlesh: m(0xd88a86, { roughness: 0.5 }),
    pus: m(0xc8c440, { roughness: 0.25, emissive: 0x2a2a00 }),
    inflamed: halo(0xb0301a),
    venomHalo: halo(0x7a1aa8),
    band_curativo_folha: m(0x7a9a4a, { side: THREE.DoubleSide, roughness: 0.9 }),
    band_curativo_cinza: m(0x8a8a86, { side: THREE.DoubleSide, roughness: 0.95 }),
    band_curativo_mel: m(0xc89a3a, { side: THREE.DoubleSide, roughness: 0.4 }),
    band_curativo_tabaco: m(0x6a4a22, { side: THREE.DoubleSide, roughness: 0.9 }),
    band_curativo_lirio: m(0xe8e4d8, { side: THREE.DoubleSide, roughness: 0.8 }),
    band_sutura: m(0x1a1410, { side: THREE.DoubleSide, roughness: 0.7 }),
    pick: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  };
}
