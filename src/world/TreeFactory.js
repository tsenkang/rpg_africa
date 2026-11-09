import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Noise, mulberry32 } from './Noise.js';
import { FOLIAGE_SPRITES, FOLIAGE_TINT, BARK_PHOTO, PHOTO_TEXTURES } from '../config/photoAssets.js';
import { MODEL_SPECIES, OAK_VARIANTS, ACACIA_FILES } from '../config/treeModels.js';

/**
 * Plantas em escala real (metros), no estilo do modelo de referência:
 * folhagem = cartões com recortes de FOTOS reais (atlas com transparência),
 * troncos = geometria com foto de casca + mapa normal.
 *
 * Cada espécie tem `hi` (perto) e `lo` (longe). A geometria tem grupos de
 * material: 0 casca, 1 folhagem (foto), 2 liso (cor por vértice), 3 rocha,
 * 4 casca do carvalho, 5 folhas de verão, 6 folhas de inverno, 7+ billboards.
 *
 * Folhosas, sumaúmas, árvores pretas e mortas usam os carvalhos 3D do
 * pacote de modelos (veja config/treeModels.js); as demais são procedurais.
 *
 * Espécies inspiradas na flora africana real:
 *  - Savana: acácia-guarda-chuva (copa achatada), baobá
 *  - Kalahari: acácia-camelo (camelthorn), arbustos secos
 *  - Taiga: abetos e pinheiros (16-22 m)
 *  - Tropical: folhosas, bananeiras, palmeiras
 *  - Equatorial: sumaúma/kapok emergente (35 m, raízes tabulares)
 *  - Floresta Preta: árvores escuras e retorcidas, árvores mortas
 */

const noise = new Noise(77);
const MAT = { bark: 0, leaf: 1, plain: 2, rock: 3, oakBark: 4, oakLeaf: 5, oakWinter: 6 };
const MAT_BILLBOARD = 7;
/** Depois dos billboards dos carvalhos: casca e folhas das acácias 3D. */
const MAT_ACACIA_BARK = MAT_BILLBOARD + OAK_VARIANTS.length;
const MAT_ACACIA_LEAF = MAT_ACACIA_BARK + 1;
const ATLAS = PHOTO_TEXTURES.foliage.size;
const TILE = BARK_PHOTO.tileMeters;
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- utilidades

function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.color) {
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  }
  return g;
}

/** Pinta a geometria; `ao` escurece a base (oclusão ambiente falsa). */
function paint(geo, hex, { ao = 0.35, aoAxisMin = null, aoAxisMax = null, vary = 0.08, seed = 1 } = {}) {
  const base = new THREE.Color(hex);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  let minY = aoAxisMin, maxY = aoAxisMax;
  if (minY === null || maxY === null) {
    geo.computeBoundingBox();
    minY = geo.boundingBox.min.y;
    maxY = geo.boundingBox.max.y;
  }
  const rnd = mulberry32(seed);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / Math.max(0.001, maxY - minY);
    const shade = (1 - ao) + ao * t;
    const v = 1 + (rnd() - 0.5) * vary;
    colors[i * 3] = base.r * shade * v;
    colors[i * 3 + 1] = base.g * shade * v;
    colors[i * 3 + 2] = base.b * shade * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Casca: cor clara (a foto dá a cor) com tom e AO. */
function bark(geo, tint = 0xffffff, ao = 0.4) {
  return paint(geo, tint, { ao, vary: 0.05 });
}

function lumpy(geo, amount, freq = 0.9, seed = 0) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise.n2(v.x * freq + seed, v.z * freq + v.y * 0.7 - seed);
    v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}

function transform(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  geo.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  ));
  return geo;
}

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

/** Galho/tronco cilíndrico com UV de casca em escala real. */
function limb(rTop, rBottom, len, seg, from, dir) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, len, seg, 3);
  scaleUV(g, Math.max(1, Math.round((Math.PI * (rTop + rBottom)) / TILE)), len / TILE);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
}

function cluster(r, detail, { x, y, z, sx = 1, sy = 1, sz = 1, bump = 0.22, seed = 0 }) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  lumpy(g, bump, 0.8 / r, seed);
  return transform(g, { x, y, z, sx, sy, sz });
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------ cartões de foto

function sprite(name) {
  const s = FOLIAGE_SPRITES[name];
  const [x0, y0, x1, y1] = s.rect;
  return { u0: x0 / ATLAS, u1: x1 / ATLAS, v0: 1 - y1 / ATLAS, v1: 1 - y0 / ATLAS, aspect: (x1 - x0) / (y1 - y0), mean: s.mean };
}

/**
 * Cor dos vértices do cartão: tom da espécie dividido pela média da foto,
 * para a foto manter o detalhe e a espécie dar o tom. AO na base.
 */
function tintCard(geo, sp, hex, { strength = FOLIAGE_TINT, ao = 0.35, aoMin, aoMax } = {}) {
  const t = new THREE.Color(hex);
  const k = [t.r / sp.mean[0], t.g / sp.mean[1], t.b / sp.mean[2]];
  // Normaliza o brilho do tom: só muda a matiz/saturação, não escurece.
  const lum = (k[0] * 0.3 + k[1] * 0.59 + k[2] * 0.11) || 1;
  const f = k.map((c) => 1 + (c / lum - 1) * strength);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const tt = THREE.MathUtils.clamp((pos.getY(i) - aoMin) / Math.max(0.01, aoMax - aoMin), 0, 1);
    const shade = 1 - ao + ao * tt;
    colors[i * 3] = f[0] * shade;
    colors[i * 3 + 1] = f[1] * shade;
    colors[i * 3 + 2] = f[2] * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Normais "esféricas" a partir do centro da copa → folhagem com volume. */
function crownNormals(geo, center, upBias = 0.35) {
  const p = geo.attributes.position;
  const n = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(center);
    v.y = v.y * 0.6;
    v.normalize().addScaledVector(UP, upBias).normalize();
    n[i * 3] = v.x; n[i * 3 + 1] = v.y; n[i * 3 + 2] = v.z;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return geo;
}

function quadUV(geo, sp) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, sp.u0 + uv.getX(i) * (sp.u1 - sp.u0), sp.v0 + uv.getY(i) * (sp.v1 - sp.v0));
  }
  return geo;
}

/**
 * `n` cartões verticais cruzados (vista lateral da foto), base no chão.
 */
function crossCards(name, height, { n = 3, x = 0, y = 0, z = 0, ry = 0, widthScale = 1, tint, strength, ao = 0.4, sink = 0 } = {}) {
  const sp = sprite(name);
  const w = height * sp.aspect * widthScale;
  const out = [];
  const center = V(x, y + height * 0.55, z);
  for (let k = 0; k < n; k++) {
    const g = quadUV(new THREE.PlaneGeometry(w, height), sp);
    g.translate(0, height / 2 - sink, 0);
    g.rotateY(ry + (k / n) * Math.PI);
    g.translate(x, y, z);
    crownNormals(g, center, 0.45);
    tintCard(g, sp, tint, { strength, ao, aoMin: y, aoMax: y + height });
    out.push(g);
  }
  return out;
}

/** Um cartão de copa vista de cima (horizontal, inclinável). */
function canopyCard(name, r, { x = 0, y = 0, z = 0, rx = 0, rz = 0, ry = 0, tint, strength, center, ao = 0.3 } = {}) {
  const sp = sprite(name);
  const g = quadUV(new THREE.PlaneGeometry(2 * r, 2 * r), sp);
  g.rotateX(-Math.PI / 2);
  transform(g, { x, y, z, rx, ry, rz });
  crownNormals(g, center ?? V(x, y - r * 0.4, z), 0.6);
  tintCard(g, sp, tint, { strength, ao, aoMin: y - r, aoMax: y + r * 0.4 });
  return g;
}

/**
 * Uma "bola" de folhagem: um cartão horizontal + dois inclinados, girados.
 * Dá volume de qualquer ângulo com só 3 quads.
 */
function leafBall(r, { x, y, z, tint, seed = 0, flat = 0, strength, crown }) {
  const rnd = mulberry32(seed + 17);
  const names = ['canopyA', 'canopyB'];
  const c = crown ?? V(x, y, z);
  const out = [canopyCard(names[seed % 2], r, { x, y: y + r * 0.15, z, ry: rnd() * 6.28, tint, strength, center: c })];
  const tilt = (1 - flat) * (0.75 + rnd() * 0.35);
  if (tilt > 0.05) {
    const a = rnd() * Math.PI;
    out.push(canopyCard(names[(seed + 1) % 2], r * 0.9, { x, y, z, ry: a, rx: tilt, tint, strength, center: c }));
    out.push(canopyCard(names[seed % 2], r * 0.9, { x, y, z, ry: a + Math.PI / 2, rx: tilt, tint, strength, center: c }));
  }
  return out;
}

/** Junta as partes; cada categoria vira um grupo de material. */
function finish(parts) {
  const geos = [], mats = [];
  for (const [key, list] of Object.entries(parts)) {
    if (!list?.length) continue;
    geos.push(mergeGeometries(list.map(prep), false));
    mats.push(MAT[key]);
  }
  const merged = mergeGeometries(geos, true);
  merged.groups.forEach((gr, i) => { gr.materialIndex = mats[i]; });
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

// ------------------------------------------------------------------ espécies

const builders = {
  acacia() {
    const leaf = 0x6c7a34;
    const hiBark = [
      bark(limb(0.17, 0.28, 3.4, 8, V(0, 0, 0), V(0.08, 1, 0)), 0xd8ccbc),
      bark(limb(0.08, 0.15, 2.8, 6, V(0.25, 3.2, 0), V(0.75, 1, 0.2)), 0xd8ccbc),
      bark(limb(0.08, 0.15, 2.6, 6, V(0.25, 3.2, 0), V(-0.7, 1, -0.3)), 0xd8ccbc),
      bark(limb(0.06, 0.1, 2.2, 5, V(0.25, 3.1, 0), V(0.1, 1, 0.9)), 0xd8ccbc),
    ];
    // Copa em guarda-chuva: cartões quase horizontais, em camadas finas.
    const crown = V(0.2, 5.6, 0.1);
    const hiLeaf = [];
    [[2.0, 5.9, 0.3, 2.7], [-1.6, 5.7, -0.8, 2.5], [0.3, 6.2, 1.6, 2.4], [0.2, 6.45, -0.3, 2.3], [-0.6, 6.1, 1.1, 2.0]]
      .forEach(([x, y, z, r], k) => {
        hiLeaf.push(canopyCard(k % 2 ? 'canopyA' : 'canopyB', r, { x, y, z, ry: k * 1.3, rx: (k % 3 - 1) * 0.12, tint: leaf, center: crown }));
        hiLeaf.push(canopyCard(k % 2 ? 'canopyB' : 'canopyA', r * 0.8, { x, y: y - 0.35, z, ry: k * 2.1, rz: (k % 2 ? 0.18 : -0.18), tint: leaf, center: crown }));
      });
    const loLeaf = [
      canopyCard('canopyA', 3.9, { x: 0.2, y: 6.0, z: 0.1, tint: leaf, center: crown }),
      canopyCard('canopyB', 3.2, { x: 0.2, y: 5.6, z: 0.1, ry: 1.2, rx: 0.15, tint: leaf, center: crown }),
    ];
    return {
      hi: finish({ bark: hiBark, leaf: hiLeaf }),
      lo: finish({ bark: [bark(limb(0.15, 0.28, 5.5, 5, V(0, 0, 0), V(0, 1, 0)), 0xd8ccbc)], leaf: loLeaf }),
      height: 6.6,
    };
  },

  camelthorn() {
    const leaf = 0x7a7a3c;
    const crown = V(0, 3.7, 0);
    const hiBark = [
      bark(limb(0.14, 0.24, 2.2, 7, V(0, 0, 0), V(0.15, 1, 0)), 0xa8988a),
      bark(limb(0.07, 0.12, 2.4, 6, V(0.2, 2.0, 0), V(0.9, 1, 0.3)), 0xa8988a),
      bark(limb(0.07, 0.12, 2.2, 6, V(0.2, 2.0, 0), V(-0.8, 1, -0.2)), 0xa8988a),
    ];
    const hiLeaf = [[1.6, 4.0, 0.4, 1.9], [-1.4, 3.8, -0.3, 1.8], [0.1, 4.3, 0.9, 1.7]]
      .flatMap(([x, y, z, r], k) => leafBall(r, { x, y, z, tint: leaf, seed: k + 9, flat: 0.55, crown }));
    return {
      hi: finish({ bark: hiBark, leaf: hiLeaf }),
      lo: finish({
        bark: [bark(limb(0.12, 0.22, 3.5, 5, V(0, 0, 0), V(0, 1, 0)), 0xa8988a)],
        leaf: [canopyCard('canopyA', 2.9, { y: 4.1, tint: leaf, center: crown })],
      }),
      height: 4.8,
    };
  },

  baobab() {
    const leaf = 0x7a8a40, tone = 0xd9cfc4;
    const prof = [[2.0, 0], [2.2, 0.6], [2.05, 3], [1.85, 6], [1.55, 8.5], [1.0, 10], [0.5, 10.6], [0.01, 10.7]];
    const trunkGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 16);
    lumpy(trunkGeo, 0.06, 0.5, 4);
    scaleUV(trunkGeo, Math.round((Math.PI * 4.2) / TILE), 10.7 / TILE);
    const hiBark = [bark(trunkGeo, tone, 0.3)];
    const hiLeaf = [];
    const crown = V(0, 12.5, 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3;
      const from = V(Math.cos(a) * 0.9, 9.6, Math.sin(a) * 0.9);
      const dir = V(Math.cos(a), 0.9 + (k % 3) * 0.25, Math.sin(a));
      hiBark.push(bark(limb(0.12, 0.38, 3.2 + (k % 3) * 0.6, 6, from, dir), tone));
      const tip = from.clone().add(dir.clone().normalize().multiplyScalar(3.4));
      hiLeaf.push(...leafBall(1.3, { x: tip.x, y: tip.y + 0.3, z: tip.z, tint: leaf, seed: k, flat: 0.3, crown }));
    }
    const loTrunk = new THREE.CylinderGeometry(1.3, 2.1, 10.5, 8);
    scaleUV(loTrunk, 8, 10.5 / TILE);
    return {
      hi: finish({ bark: hiBark, leaf: hiLeaf }),
      lo: finish({
        bark: [bark(loTrunk.translate(0, 5.25, 0), tone)],
        leaf: [canopyCard('canopyB', 4.4, { y: 12.4, tint: leaf, center: crown }), canopyCard('canopyA', 3.8, { y: 11.8, ry: 1, rx: 0.4, tint: leaf, center: crown })],
      }),
      height: 13,
    };
  },

  spruce() {
    return {
      hi: finish({ leaf: crossCards('spruce', 18, { n: 3, tint: 0x24402a, strength: 0.3, ao: 0.45, sink: 0.2 }) }),
      lo: finish({ leaf: crossCards('spruce', 18, { n: 2, tint: 0x24402a, strength: 0.3, ao: 0.45, sink: 0.2 }) }),
      height: 18,
    };
  },

  pine() {
    return {
      hi: finish({ leaf: crossCards('pine', 19, { n: 3, widthScale: 0.8, tint: 0x3a5230, strength: 0.3, ao: 0.4, sink: 0.2 }) }),
      lo: finish({ leaf: crossCards('pine', 19, { n: 2, widthScale: 0.8, tint: 0x3a5230, strength: 0.3, ao: 0.4, sink: 0.2 }) }),
      height: 19,
    };
  },

  palm() {
    const frond = 0x4a7a2c;
    const trunk = [];
    let p = V(0, 0, 0);
    const bend = V(0.18, 1, 0.05);
    for (let k = 0; k < 6; k++) {
      const dir = bend.clone().setX(0.06 + k * 0.05);
      trunk.push(bark(limb(0.19 - k * 0.012, 0.24 - k * 0.012, 1.55, 8, p, dir), 0xe8d8c0, 0.2));
      p = p.clone().add(dir.normalize().multiplyScalar(1.5));
    }
    const top = p;
    const fronds = [];
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2;
      const leaf = new THREE.ConeGeometry(0.5, 4.6, 4, 6);
      leaf.translate(0, 2.3, 0);
      const pos = leaf.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        pos.setZ(i, pos.getZ(i) * 0.18 - (y / 4.6) ** 2 * 1.9);
      }
      transform(leaf, { rx: -1.05 - (k % 3) * 0.15, ry: a });
      leaf.translate(top.x, top.y, top.z);
      fronds.push(paint(leaf, frond, { ao: 0.3, seed: k }));
    }
    fronds.push(paint(cluster(0.35, 1, { x: top.x, y: top.y - 0.2, z: top.z }), 0x6b4a2a));
    return {
      hi: finish({ bark: trunk, plain: fronds }),
      lo: finish({
        bark: [bark(limb(0.15, 0.22, 9, 5, V(0, 0, 0), V(0.25, 1, 0.05)), 0xe8d8c0)],
        plain: [paint(cluster(2.6, 0, { x: top.x, y: top.y - 0.4, z: top.z, sy: 0.35 }), frond)],
      }),
      height: 10,
    };
  },

  shrub() {
    const leaf = 0x6a7036;
    const crown = V(0, 0.6, 0);
    const hi = [
      ...crossCards('leafBranch', 1.5, { n: 3, tint: leaf, ao: 0.5 }),
      ...leafBall(0.75, { x: 0.3, y: 0.7, z: 0.1, tint: leaf, seed: 3, crown }),
      ...leafBall(0.6, { x: -0.4, y: 0.5, z: -0.2, tint: leaf, seed: 4, crown }),
    ];
    return {
      hi: finish({ leaf: hi }),
      lo: finish({ leaf: crossCards('leafBranch', 1.5, { n: 2, tint: leaf, ao: 0.5 }) }),
      height: 1.4,
    };
  },

  dryShrub() {
    const tint = 0x9a8456;
    return {
      hi: finish({ leaf: [...crossCards('grassDry', 1.0, { n: 3, tint, widthScale: 1.1 }), ...crossCards('root', 0.9, { n: 2, tint: 0x6a5a48, ry: 0.5 })] }),
      lo: finish({ leaf: crossCards('grassDry', 1.0, { n: 2, tint, widthScale: 1.1 }) }),
      height: 1.1,
    };
  },

  bush() {
    const leaf = 0x355a26;
    const crown = V(0, 1.0, 0);
    const hi = [[0, 1.0, 0, 1.3], [1.0, 0.8, 0.3, 1.0], [-0.9, 0.85, -0.4, 1.05], [0.2, 1.5, -0.6, 0.9]]
      .flatMap(([x, y, z, r], k) => leafBall(r, { x, y, z, tint: leaf, seed: k + 40, crown }));
    return {
      hi: finish({ leaf: [...hi, ...crossCards('firSmall', 2.2, { n: 2, tint: leaf, ry: 0.4 })] }),
      lo: finish({ leaf: leafBall(1.7, { x: 0, y: 1.0, z: 0, tint: leaf, seed: 1, crown }) }),
      height: 2.2,
    };
  },

  broadleaf() {
    const leaf = 0x3a6428;
    const tone = 0xcfc2b4;
    const hiBark = [
      bark(limb(0.24, 0.48, 8, 9, V(0, 0, 0), V(0.05, 1, 0)), tone, 0.45),
      bark(limb(0.1, 0.2, 4, 6, V(0, 6, 0), V(0.8, 1, 0.2)), tone),
      bark(limb(0.1, 0.2, 4, 6, V(0, 6.5, 0), V(-0.7, 1, -0.5)), tone),
      bark(limb(0.08, 0.18, 3.5, 6, V(0, 7, 0), V(-0.1, 1, 0.9)), tone),
    ];
    const crown = V(0, 11, 0);
    const hiLeaf = [[2.6, 10, 0.5, 3.0], [-2.4, 10.3, -1.4, 2.9], [0, 11.8, 0, 3.4], [-0.4, 10, 2.6, 2.7], [1.3, 12.6, -1.8, 2.5], [-1.6, 12.2, 1.2, 2.4]]
      .flatMap(([x, y, z, r], k) => leafBall(r, { x, y, z, tint: leaf, seed: k + 60, crown }));
    const loTrunk = new THREE.CylinderGeometry(0.25, 0.45, 9, 5);
    scaleUV(loTrunk, 1, 9 / TILE);
    return {
      hi: finish({ bark: hiBark, leaf: hiLeaf }),
      lo: finish({ bark: [bark(loTrunk.translate(0, 4.5, 0), tone)], leaf: leafBall(4.8, { x: 0, y: 11, z: 0, tint: leaf, seed: 2, crown }) }),
      height: 14.5,
    };
  },

  kapok() {
    const leaf = 0x3d6a2c, tone = 0xe2dad0;
    const hiBark = [bark(limb(0.75, 1.35, 30, 12, V(0, 0, 0), V(0, 1, 0)), tone, 0.45)];
    for (let k = 0; k < 6; k++) {
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(3.4, 0), new THREE.Vector2(0, 5.2)]);
      const fin = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: false });
      scaleUV(fin, 1 / TILE, 1 / TILE);
      fin.translate(0.9, 0, -0.16);
      fin.rotateY((k / 6) * Math.PI * 2 + 0.2);
      hiBark.push(bark(fin, tone, 0.5));
    }
    const crown = V(0, 31, 0);
    const hiLeaf = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const from = V(0, 25 + (k % 2) * 2, 0);
      const dir = V(Math.cos(a), 0.55, Math.sin(a));
      hiBark.push(bark(limb(0.25, 0.55, 8, 7, from, dir), tone));
      const tip = from.clone().add(dir.clone().normalize().multiplyScalar(8));
      hiLeaf.push(...leafBall(4.6, { x: tip.x, y: tip.y + 1.2, z: tip.z, tint: leaf, seed: k + 80, flat: 0.45, crown }));
    }
    hiLeaf.push(...leafBall(5.5, { x: 0, y: 33, z: 0, tint: leaf, seed: 99, flat: 0.4, crown }));
    const loTrunk = new THREE.CylinderGeometry(0.8, 1.6, 30, 6);
    scaleUV(loTrunk, 3, 30 / TILE);
    return {
      hi: finish({ bark: hiBark, leaf: hiLeaf }),
      lo: finish({
        bark: [bark(loTrunk.translate(0, 15, 0), tone)],
        leaf: [canopyCard('canopyA', 10, { y: 32, tint: leaf, center: crown }), canopyCard('canopyB', 8.5, { y: 30.5, ry: 1.1, rx: 0.3, tint: leaf, center: crown })],
      }),
      height: 36,
    };
  },

  banana() {
    const leaf = 0x58942c;
    const hi = [paint(limb(0.12, 0.2, 2.6, 8, V(0, 0, 0), V(0, 1, 0)), 0x6c7a3a)];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + (k % 2) * 0.3;
      const g = new THREE.SphereGeometry(1, 10, 4);
      g.scale(0.32, 0.025, 1.35);
      g.translate(0, 0, 1.25);
      transform(g, { rx: -0.45 + (k % 3) * 0.25, ry: a, y: 2.4 + (k % 3) * 0.25 });
      hi.push(paint(g, leaf, { ao: 0.2, seed: k }));
    }
    return {
      hi: finish({ plain: hi }),
      lo: finish({ plain: [paint(cluster(1.8, 0, { x: 0, y: 2.6, z: 0, sy: 0.5 }), leaf)] }),
      height: 3.4,
    };
  },

  blackTree() {
    const leaf = 0x1f2c2c, tone = 0x4a4440;
    const hiBark = [], hiLeaf = [];
    let p = V(0, 0, 0);
    const rnd = mulberry32(5);
    const crown = V(0, 14, 0);
    for (let k = 0; k < 5; k++) {
      const dir = V((rnd() - 0.5) * 0.5, 1, (rnd() - 0.5) * 0.5);
      hiBark.push(bark(limb(0.38 - k * 0.06, 0.45 - k * 0.06, 3.2, 8, p, dir), tone, 0.3));
      p = p.clone().add(dir.normalize().multiplyScalar(3.1));
      if (k >= 2) {
        const a = rnd() * Math.PI * 2;
        const bd = V(Math.cos(a), 0.4 + rnd() * 0.4, Math.sin(a));
        hiBark.push(bark(limb(0.05, 0.14, 4, 5, p, bd), tone));
        const tip = p.clone().add(bd.normalize().multiplyScalar(4));
        hiLeaf.push(...leafBall(2.4, { x: tip.x, y: tip.y, z: tip.z, tint: leaf, seed: k + 100, strength: 0.85, crown }));
      }
    }
    hiLeaf.push(...leafBall(3.0, { x: p.x, y: p.y + 1, z: p.z, tint: leaf, seed: 120, strength: 0.85, crown }));
    const loTrunk = new THREE.CylinderGeometry(0.2, 0.45, 15, 5);
    scaleUV(loTrunk, 1, 15 / TILE);
    return {
      hi: finish({ bark: hiBark, leaf: hiLeaf }),
      lo: finish({ bark: [bark(loTrunk.translate(0, 7.5, 0), tone)], leaf: leafBall(4.4, { x: p.x, y: 15, z: p.z, tint: leaf, seed: 7, strength: 0.85, crown }) }),
      height: 18,
    };
  },

  deadTree() {
    const tone = 0xb8b0a8;
    const hi = [bark(limb(0.15, 0.4, 9, 7, V(0, 0, 0), V(0.1, 1, 0)), tone)];
    const rnd = mulberry32(9);
    for (let k = 0; k < 7; k++) {
      const y = 3 + k * 0.9;
      const a = rnd() * Math.PI * 2;
      hi.push(bark(limb(0.02, 0.1, 2 + rnd() * 2.5, 4, V((0.1 * y) / 9, y, 0), V(Math.cos(a), 0.5 + rnd() * 0.6, Math.sin(a))), tone));
    }
    const lo = new THREE.CylinderGeometry(0.12, 0.38, 9, 4);
    scaleUV(lo, 1, 9 / TILE);
    return { hi: finish({ bark: hi }), lo: finish({ bark: [bark(lo.translate(0, 4.5, 0), tone)] }), height: 10 };
  },

  rock() {
    const c = 0xb7b2a8;
    const g = new THREE.IcosahedronGeometry(1, 2);
    lumpy(g, 0.35, 1.1, 3);
    g.scale(1.3, 0.75, 1);
    g.translate(0, 0.25, 0);
    const lo = new THREE.IcosahedronGeometry(1, 0);
    lo.scale(1.3, 0.7, 1);
    lo.translate(0, 0.25, 0);
    return { hi: finish({ rock: [paint(g, c, { ao: 0.45 })] }), lo: finish({ rock: [paint(lo, c, { ao: 0.4 })] }), height: 1.2 };
  },
};

/**
 * Cria (uma vez) as geometrias de todas as espécies. Com `oaks` (modelos
 * carregados), as espécies de MODEL_SPECIES viram uma lista de variantes.
 */
export function createTreeGeometries(oaks = null) {
  const out = {};
  for (const [type, build] of Object.entries(builders)) out[type] = build();
  if (oaks) {
    for (const [type, spec] of Object.entries(MODEL_SPECIES)) {
      if (spec.family === 'acacia' && !oaks.hasAcacia) continue;
      out[type] = spec.variants.map((v) => modelSpecies(oaks.parts[v], v, spec, out[type]));
    }
  }
  return out;
}

/** Junta listas de geometria, cada uma com seu índice de material. */
function finishGroups(entries) {
  const geos = [], mats = [];
  for (const [list, mat] of entries) {
    if (!list.length) continue;
    geos.push(mergeGeometries(list.map(prep), false));
    mats.push(mat);
  }
  const merged = mergeGeometries(geos, true);
  merged.groups.forEach((gr, i) => { gr.materialIndex = mats[i]; });
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/**
 * Uma variante de modelo 3D. Carvalho: LOD1 perto, billboard longe.
 * Acácia: modelo perto; longe, os cartões da acácia procedural (`proc`)
 * esticados até a altura do modelo.
 */
function modelSpecies(part, name, spec, proc) {
  if (spec.family === 'acacia') return acaciaSpecies(part, spec, proc);
  const k = spec.scale;
  const tint = new THREE.Color(spec.tint);
  const colorize = (geo, ao) => {
    const g = geo.clone().scale(k, k, k);
    return paint(g, tint, { ao, vary: 0.04 });
  };
  const barkGeo = colorize(part.bark, 0.35);
  const height = (part.leaf ?? part.bark).boundingBox?.max.y ?? 20;
  const hi = [[[barkGeo], MAT.oakBark]];
  if (spec.leaves !== 'none') hi.push([[colorize(part.leaf, 0.45)], spec.leaves === 'winter' ? MAT.oakWinter : MAT.oakLeaf]);
  let lo;
  if (spec.leaves === 'none') lo = finishGroups([[[barkGeo.clone()], MAT.oakBark]]);
  else {
    const bb = colorize(part.billboard, 0.3);
    bb.computeBoundingBox();
    crownNormals(bb, new THREE.Vector3(0, bb.boundingBox.max.y * 0.6, 0), 0.5);
    lo = finishGroups([[[bb], MAT_BILLBOARD + OAK_VARIANTS.indexOf(name)]]);
  }
  return { hi: finishGroups(hi), lo, height: height * k };
}

/**
 * O modelo da acácia tem poucas folhas: completa a copa com cartões de foto
 * (guarda-chuva) onde o modelo já tem folhas. Agrupa os vértices das folhas
 * numa grade XZ e põe um cartão no topo de cada célula ocupada.
 */
function acaciaCanopy(leafGeo, { tint, cell, radius, minVerts, tilt }) {
  const pos = leafGeo.attributes.position;
  const cells = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    const c = cells.get(key) ?? { n: 0, x: 0, z: 0, top: -Infinity };
    c.n++; c.x += x; c.z += z; c.top = Math.max(c.top, y);
    cells.set(key, c);
  }
  leafGeo.computeBoundingBox();
  const bb = leafGeo.boundingBox;
  const crown = V((bb.min.x + bb.max.x) / 2, bb.min.y + (bb.max.y - bb.min.y) * 0.3, (bb.min.z + bb.max.z) / 2);
  const rnd = mulberry32(pos.count);
  const out = [];
  for (const c of cells.values()) {
    if (c.n < minVerts) continue;
    const x = c.x / c.n, z = c.z / c.n;
    const r = radius * (0.85 + rnd() * 0.35);
    const name = rnd() < 0.5 ? 'canopyA' : 'canopyB';
    out.push(canopyCard(name, r, { x, y: c.top - 0.15, z, ry: rnd() * 6.28, rx: (rnd() - 0.5) * 0.25, tint, center: crown }));
    // Cartão inclinado: de longe, na altura dos olhos, a copa não some de lado.
    out.push(canopyCard(name === 'canopyA' ? 'canopyB' : 'canopyA', r * 0.8, {
      x, y: c.top - 0.35, z, ry: rnd() * 6.28, rx: tilt * (0.8 + rnd() * 0.4), tint, center: crown,
    }));
  }
  return out;
}

function acaciaSpecies(part, spec, proc) {
  const k = spec.scale;
  const tint = new THREE.Color(spec.tint);
  const colorize = (geo, ao) => paint(geo.clone().scale(k, k, k), tint, { ao, vary: 0.05 });
  const hi = [[[colorize(part.bark, 0.35)], MAT_ACACIA_BARK]];
  if (part.leaf && spec.leaves !== 'none') {
    const leaf = colorize(part.leaf, 0.4);
    hi.push([[leaf], MAT_ACACIA_LEAF]);
    if (spec.canopy) hi.push([acaciaCanopy(leaf, spec.canopy), MAT.leaf]);
  }
  const hiGeo = finishGroups(hi);
  const height = hiGeo.boundingBox.max.y;
  const lo = proc.lo.clone();
  lo.computeBoundingBox();
  const s = height / lo.boundingBox.max.y;
  lo.scale(s, s, s);
  // Acácia sem folhas: longe fica só o tronco do modelo (sem copa de cartões).
  return { hi: hiGeo, lo: part.leaf ? lo : finishGroups([[[colorize(part.bark, 0.35)], MAT_ACACIA_BARK]]), height };
}

const WIND = /* glsl */ `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
  #else
    vec3 ip = vec3(0.0);
  #endif
  #ifndef WIND_SCALE
    #define WIND_SCALE 1.0
  #endif
  float sway = max(position.y - 1.2, 0.0) * WIND_SCALE;
  float ph = uTime * 1.25 + ip.x * 0.045 + ip.z * 0.06;
  transformed.x += (sin(ph) * 0.010 + sin(ph * 2.9 + position.z * 0.8) * 0.004) * sway;
  transformed.z += (cos(ph * 0.83) * 0.008 + sin(ph * 3.3 + position.x * 0.8) * 0.003) * sway;
  #ifdef FOLIAGE_FLUTTER
    float fl = sin(uTime * 4.7 + position.x * 2.3 + position.z * 1.9 + ip.x) * 0.035;
    transformed.y += fl * min(sway, 1.0);
  #endif`;

function withWind(material, timeUniform, foliage = false) {
  if (foliage) material.defines = { ...material.defines, FOLIAGE_FLUTTER: '' };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', WIND);
    if (foliage) {
      // Cartões dupla-face: as normais da copa valem dos dois lados (sem lado preto)
      // e um pouco de luz atravessa as folhas (translucidez).
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.06;');
    }
  };
  return material;
}

/**
 * Materiais das plantas (índices = grupos de `finish`): casca, folhagem em
 * foto, liso e rocha. Todos com balanço de vento no vertex shader.
 *
 * @example
 *   const mats = createVegetationMaterials(timeUniform, photos);
 *   new THREE.InstancedMesh(geos.acacia.hi, mats, count);
 */
export function createVegetationMaterials(timeUniform, photos, oaks = null) {
  const barkMat = withWind(new THREE.MeshStandardMaterial({
    vertexColors: true, map: photos.bark, normalMap: photos.barkNormal,
    normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.92, metalness: 0,
  }), timeUniform);
  const leafMat = withWind(new THREE.MeshStandardMaterial({
    vertexColors: true, map: photos.foliage, alphaTest: 0.42, alphaToCoverage: true,
    side: THREE.DoubleSide, roughness: 0.82, metalness: 0,
  }), timeUniform, true);
  const plainMat = withWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }), timeUniform);
  const rockMat = new THREE.MeshStandardMaterial({
    vertexColors: true, normalMap: photos.groundNormal, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.9, metalness: 0,
  });
  const mats = [barkMat, leafMat, plainMat, rockMat];
  if (oaks) {
    const t = oaks.tex;
    mats.push(withWind(new THREE.MeshStandardMaterial({
      vertexColors: true, map: t.bark, normalMap: t.barkNormal, roughness: 0.9, metalness: 0,
    }), timeUniform));
    for (const map of [t.leaves, t.leavesWinter]) {
      mats.push(withWind(new THREE.MeshStandardMaterial({
        vertexColors: true, map, normalMap: t.leavesNormal, alphaTest: 0.4, alphaToCoverage: true,
        side: THREE.DoubleSide, roughness: 0.8, metalness: 0,
      }), timeUniform, true));
    }
    for (const name of OAK_VARIANTS) {
      mats.push(withWind(new THREE.MeshStandardMaterial({
        vertexColors: true, map: t.billboards[name], alphaTest: 0.4, alphaToCoverage: true,
        side: THREE.DoubleSide, roughness: 0.85, metalness: 0,
      }), timeUniform, true));
    }
    if (oaks.hasAcacia) {
      mats.push(withWind(new THREE.MeshStandardMaterial({
        vertexColors: true, map: t.acaciaBark, normalMap: photos.barkNormal, roughness: 0.92, metalness: 0,
      }), timeUniform));
      mats.push(withWind(new THREE.MeshStandardMaterial({
        vertexColors: true, map: t.acaciaLeaves, alphaTest: ACACIA_FILES.leafAlphaCutoff, alphaToCoverage: true,
        side: THREE.DoubleSide, roughness: 0.8, metalness: 0,
      }), timeUniform, true));
    }
  }
  return mats;
}

// ------------------------------------------------------------ árvore anciã

/**
 * Árvore gigante única (marco do mapa): tronco com raízes tabulares e
 * sapopemas, sete galhos mestres que se abrem em leque, cipós e uma copa
 * larga de cartões de folhagem em foto.
 * Grupos: 0 casca, 1 folhagem (use com `createGiantTreeMaterials`).
 * @param {number} height altura total (m)
 * @param {number} seed
 * @returns {{ geometry: THREE.BufferGeometry, trunkRadius: number }}
 * @example
 *   const { geometry } = createGiantTree(64, 1);
 *   scene.add(new THREE.Mesh(geometry, createGiantTreeMaterials(time, photos)));
 */
export function createGiantTree(height, seed = 1) {
  const s = height / 64;
  const rnd = mulberry32(seed * 97 + 5);
  const tone = 0xcfc2ae, leaf = 0x3f6e2a, vine = 0x5d6e3c;
  const barkParts = [], leafParts = [];
  const crown = V(0, height * 0.74, 0);

  // Tronco: cilindro deformado — alarga na base, 8 sapopemas, nós e torção.
  const trunkH = height * 0.48, R = 5.2 * s;
  const trunk = new THREE.CylinderGeometry(1, 1, trunkH, 40, 16);
  scaleUV(trunk, Math.round((2 * Math.PI * R * 1.6) / TILE), trunkH / TILE);
  trunk.translate(0, trunkH / 2, 0);
  const p = trunk.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x) + v.y * 0.012;
    const flare = 1 + 1.7 * Math.exp(-v.y / (6 * s));
    const lobes = 1 + 0.55 * Math.pow(Math.max(0, Math.cos(a * 8)), 3) * Math.exp(-v.y / (9 * s));
    const taper = 1 - 0.38 * (v.y / trunkH);
    const knot = 1 + 0.07 * noise.n2(a * 3 + seed, v.y * 0.12);
    const r = R * flare * lobes * taper * knot;
    p.setXYZ(i, Math.cos(a) * r, v.y - 0.6, Math.sin(a) * r);
  }
  trunk.computeVertexNormals();
  barkParts.push(bark(trunk, tone, 0.55));

  // Raízes superficiais que correm pelo chão.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + rnd() * 0.3;
    const from = V(Math.cos(a) * R * 1.8, 0.4, Math.sin(a) * R * 1.8);
    barkParts.push(bark(limb(0.25 * s, 0.9 * s, (10 + rnd() * 8) * s, 7, from, V(Math.cos(a), -0.12, Math.sin(a))), tone, 0.6));
  }

  // Galhos mestres e secundários, com bolas de folhagem nas pontas.
  const main = 9;
  for (let k = 0; k < main; k++) {
    const a = (k / main) * Math.PI * 2 + rnd() * 0.4;
    const from = V(Math.cos(a) * R * 0.35, trunkH * (0.8 + rnd() * 0.18), Math.sin(a) * R * 0.35);
    const dir = V(Math.cos(a), 0.45 + rnd() * 0.4, Math.sin(a)).normalize();
    const len = height * (0.36 + rnd() * 0.1);
    barkParts.push(bark(limb(0.7 * s, 2.3 * s, len, 12, from, dir), tone, 0.3));
    const tip = from.clone().addScaledVector(dir, len);
    for (let j = 0; j < 3; j++) {
      const at = from.clone().addScaledVector(dir, len * (0.55 + j * 0.2));
      const b = a + (j - 1) * 0.7;
      const d2 = V(Math.cos(b), 0.35 + rnd() * 0.5, Math.sin(b)).normalize();
      const l2 = height * (0.15 + rnd() * 0.07);
      barkParts.push(bark(limb(0.22 * s, 0.7 * s, l2, 6, at, d2), tone, 0.2));
      const t2 = at.clone().addScaledVector(d2, l2);
      leafParts.push(...leafBall(height * 0.13, { x: t2.x, y: t2.y + 1.5 * s, z: t2.z, tint: leaf, seed: seed * 31 + k * 7 + j, flat: 0.15, crown }));
      // Cipó pendurado do meio do galho.
      if (rnd() < 0.6) {
        const vl = (8 + rnd() * 14) * s;
        barkParts.push(paint(limb(0.05 * s, 0.07 * s, vl, 4, at, V(rnd() * 0.1, -1, rnd() * 0.1)), vine, { ao: 0.2 }));
      }
    }
    leafParts.push(...leafBall(height * 0.15, { x: tip.x, y: tip.y + 2 * s, z: tip.z, tint: leaf, seed: seed * 13 + k, flat: 0.15, crown }));
  }
  // Preenchimento: a copa vira uma abóbada contínua (elipsoide achatado).
  // Abóbada: pontos num elipsoide achatado (raio 0,55 H, espessura 0,3 H).
  const CR = height * 0.55;
  for (let k = 0; k < 90; k++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * CR;
    const dome = Math.sqrt(Math.max(0, 1 - (rr / CR) ** 2));
    const y = height * 0.66 + height * 0.26 * dome * (0.4 + rnd() * 0.6);
    leafParts.push(...leafBall(height * (0.1 + rnd() * 0.05), {
      x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, tint: k % 3 ? leaf : 0x4a7a30, seed: seed * 7 + k + 300, flat: 0.25, crown,
    }));
  }
  return { geometry: finish({ bark: barkParts, leaf: leafParts }), trunkRadius: R * 2.5 };
}

/**
 * Materiais da árvore anciã: os mesmos da vegetação (casca e folhas em
 * foto), com balanço de vento bem menor (um gigante não balança como um arbusto).
 */
export function createGiantTreeMaterials(timeUniform, photos) {
  const giant = (m) => { m.defines = { ...m.defines, WIND_SCALE: '0.06' }; return m; };
  const barkMat = giant(withWind(new THREE.MeshStandardMaterial({
    vertexColors: true, map: photos.bark, normalMap: photos.barkNormal,
    normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.92, metalness: 0,
  }), timeUniform));
  const leafMat = giant(withWind(new THREE.MeshStandardMaterial({
    vertexColors: true, map: photos.foliage, alphaTest: 0.42, alphaToCoverage: true,
    side: THREE.DoubleSide, roughness: 0.82, metalness: 0,
  }), timeUniform, true));
  return [barkMat, leafMat];
}
