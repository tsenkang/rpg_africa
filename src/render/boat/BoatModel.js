import * as THREE from 'three';
import { BOAT } from '../../config/boat.js';

/**
 * Lagosteiro "Downeast" procedural (Etapa A3), no espírito do `BoatModel.js` do Tidewater:
 * casco por cavernas (V no fundo, bojo, costado com abertura), fundo vermelho antiincrustante,
 * faixa azul na linha d'água, costado branco, convés de madeira, casa do leme com janelas,
 * mastro com radar, escapamento e armadilhas de lagosta na popa.
 *
 * Referencial: +Z proa, +Y cima, +X bombordo; y = 0 linha d'água de projeto.
 *
 * @example
 *   const model = buildBoatModel();
 *   scene.add(model.group);
 *   model.setRudder(angle); model.setProp(spin);
 */
export function buildBoatModel(cfg = BOAT) {
  const group = new THREE.Group();
  group.name = 'barco';
  const L = cfg.length, zs = -3.9, zb = zs + L;
  const sheerY = (t) => 0.95 + 0.55 * t * t;
  const hb = (t) => {
    if (t <= 0.42) return 1.5 * (0.9 + 0.1 * (t / 0.42));
    const u = (t - 0.42) / 0.58;
    return 1.5 * Math.pow(Math.max(0, 1 - u * u), 0.75);
  };
  const keelY = (t) => {
    const base = -0.5 + 0.06 * (1 - Math.min(1, t / 0.3));
    const s = THREE.MathUtils.smoothstep(t, 0.62, 1);
    return THREE.MathUtils.lerp(base, sheerY(1) - 0.05, Math.pow(s, 1.6));
  };
  // forma da caverna: fração da boca e fração da altura (quilha → borda)
  const SEC = [[0, 0], [0.32, 0.07], [0.62, 0.18], [0.84, 0.36], [0.97, 0.62], [1.0, 0.86], [0.98, 1.0]];
  const NS = 48;
  const pos = [], col = [], idx = [];
  const red = new THREE.Color(0x8e2a22), blue = new THREE.Color(0x1d3f6e), white = new THREE.Color(0xeeeae0), rub = new THREE.Color(0x5b3a24);
  const colorAt = (y, frac) => (frac > 0.96 ? rub : y < 0.04 ? red : y < 0.16 ? blue : white);
  const ring = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, z = zs + t * L, b = hb(t), k = keelY(t), S = sheerY(t);
    // proa: a roda de proa avança um pouco acima da água
    const rake = THREE.MathUtils.smoothstep(t, 0.85, 1) * 0.35;
    const row = [];
    for (let side = -1; side <= 1; side += 2) {
      for (let j = 0; j < SEC.length; j++) {
        const jj = side < 0 ? SEC.length - 1 - j : j;
        const [fx, fy] = SEC[jj];
        const y = k + (S - k) * fy;
        row.push(pos.length / 3);
        pos.push(side * b * fx, y, z + rake * fy);
        const c = colorAt(y, fy);
        col.push(c.r, c.g, c.b);
      }
    }
    ring.push(row);
  }
  const W = ring[0].length;
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < W - 1; j++) {
      if (j === SEC.length - 1) continue; // emenda das duas bordas (fica aberta: é o convés)
      const a = ring[i][j], b2 = ring[i][j + 1], c = ring[i + 1][j], d = ring[i + 1][j + 1];
      idx.push(a, c, b2, b2, c, d);
    }
  }
  // espelho de popa (leque a partir do centro)
  const tc = pos.length / 3;
  pos.push(0, (keelY(0) + sheerY(0)) / 2, zs); col.push(white.r, white.g, white.b);
  for (let j = 0; j < W - 1; j++) idx.push(tc, ring[0][j], ring[0][j + 1]);
  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hullGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  hullGeo.setIndex(idx);
  hullGeo.computeVertexNormals();
  const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true; hull.receiveShadow = true;
  group.add(hull);

  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const wood = mat(0x9a7350, { roughness: 0.8 }), paint = mat(0xf1eee6, { roughness: 0.4 }), dark = mat(0x23313a, { roughness: 0.15, metalness: 0.2 });
  const trim = mat(0x1d3f6e), metal = mat(0x8a9094, { metalness: 0.6, roughness: 0.35 }), orange = mat(0xd9641c);
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; group.add(o); return o; };

  // convés: placas entre as bordas, um pouco abaixo da borda
  const deckShape = new THREE.Shape();
  const N2 = 24;
  for (let i = 0; i <= N2; i++) { const t = (i / N2) * 0.97; deckShape[i ? 'lineTo' : 'moveTo'](hb(t) * 0.94, zs + t * L); }
  for (let i = N2; i >= 0; i--) { const t = (i / N2) * 0.97; deckShape.lineTo(-hb(t) * 0.94, zs + t * L); }
  const deckGeo = new THREE.ShapeGeometry(deckShape);
  deckGeo.rotateX(Math.PI / 2); // (x, y) da forma → (x, z) do barco
  add(deckGeo, new THREE.MeshStandardMaterial({ color: 0x9a7350, roughness: 0.8, side: THREE.DoubleSide }), 0, 0.72, 0);

  // casa do leme
  const hz0 = -0.5, hz1 = 1.5, hw = 1.05, hy0 = 0.72, hh = 1.85;
  add(new THREE.BoxGeometry(hw * 2, hh, hz1 - hz0), paint, 0, hy0 + hh / 2, (hz0 + hz1) / 2);
  // janelas (laterais e frente) e porta aberta atrás
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.6, 1.4), dark, s * (hw + 0.005), hy0 + 1.35, (hz0 + hz1) / 2 + 0.1);
  add(new THREE.BoxGeometry(hw * 1.8, 0.6, 0.02), dark, 0, hy0 + 1.35, hz1 + 0.006);
  add(new THREE.BoxGeometry(0.9, 1.5, 0.02), dark, 0.35, hy0 + 0.8, hz0 - 0.006);
  // teto com aba
  add(new THREE.BoxGeometry(hw * 2 + 0.2, 0.08, hz1 - hz0 + 0.6), paint, 0, hy0 + hh + 0.04, (hz0 + hz1) / 2 - 0.2);
  add(new THREE.BoxGeometry(hw * 2 + 0.22, 0.05, 0.05), trim, 0, hy0 + hh, hz1 + 0.12);
  // proa: cabine baixa à frente
  add(new THREE.BoxGeometry(1.6, 0.35, 1.3), paint, 0, 0.95, 2.3);
  // mastro, radar e antena
  add(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 8), metal, 0, hy0 + hh + 0.6, 0.6);
  const radar = add(new THREE.BoxGeometry(0.9, 0.12, 0.12), mat(0xf4f4f4), 0, hy0 + hh + 1.25, 0.6);
  add(new THREE.CylinderGeometry(0.012, 0.012, 2.2, 6), metal, 0.6, hy0 + hh + 1.1, 0.1);
  // escapamento
  add(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 10), metal, -0.75, hy0 + hh + 0.3, -0.3);
  // borda (régua) em volta do convés aberto da popa
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.08, 3.2), wood, s * 1.38, 1.1, -2.2);
  // armadilhas de lagosta e boias
  const trap = new THREE.BoxGeometry(0.9, 0.42, 0.6);
  const trapMat = mat(0x3f6b4a, { roughness: 0.9 });
  [[0.45, -2.6], [-0.45, -2.6], [0.45, -3.25]].forEach(([x, z], i) => add(trap, trapMat, x, 0.93 + (i === 2 ? 0 : 0), z));
  add(new THREE.BoxGeometry(0.9, 0.42, 0.6), trapMat, 0.45, 1.35, -2.6);
  for (const [x, z] of [[-0.8, -3.4], [-0.6, -3.5]]) add(new THREE.CapsuleGeometry(0.1, 0.25, 4, 8), orange, x, 0.95, z, 0.3);
  // leme e hélice (animados)
  const rudder = add(new THREE.BoxGeometry(0.04, 0.55, 0.42), mat(0x2a2a2a), 0, -0.45, -3.75);
  rudder.geometry.translate(0, 0, -0.18);
  const prop = add(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 3), mat(0xb08a3a, { metalness: 0.8, roughness: 0.3 }), 0, -0.55, -3.45);
  prop.rotation.x = Math.PI / 2;

  return {
    group,
    radar,
    setRudder(a) { rudder.rotation.y = a; },
    spin(dt, rpm, time) { prop.rotation.y += rpm * dt * 40; radar.rotation.y = time * 2.5; },
  };
}
