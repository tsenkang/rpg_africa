import * as THREE from 'three';
import { ANIMATION } from '../config/animation.js';

/**
 * AutoRig — transforma um modelo 3D ESTÁTICO (malha rígida, sem ossos) num
 * modelo com esqueleto (`THREE.SkinnedMesh` + `THREE.Skeleton`), no momento do
 * carregamento. Assim leão, zebra, onça, capivara, jacaré… dobram pernas,
 * coluna, pescoço e cauda de verdade, em vez de o corpo inteiro só quicar.
 *
 * Como funciona (o modelo já vem normalizado: em pé, frente +Z, chão em y=0):
 *  1. Amostra a superfície (vértices, centros e meios das arestas dos triângulos).
 *  2. Acha as patas: amostras perto do chão agrupadas por quadrante (k-means).
 *  3. Mede a barriga (topo das pernas), a linha da coluna, a cabeça (ponta da
 *     frente) e a cauda (o que sobra atrás do quadril).
 *  4. Cria os ossos (raiz → pelve → meio → peito → pescoço → cabeça → mandíbula;
 *     pelve → cauda[3]; quadril/ombro → perna → canela; caixa torácica).
 *  5. Pesa cada vértice: pernas por região (perna mais próxima, joelho com
 *     transição suave), resto por 1/distância^p até o segmento de cada osso,
 *     4 influências no máximo, somando 1.
 *
 * Todos os ossos nascem sem rotação (orientação = do modelo): girar o osso
 * em X dobra no plano sagital, em Y vira para os lados, em Z rola.
 *
 * @example
 *   const rigged = autoRig(normalizado, { kind: 'quadruped' });
 *   rigged.object.userData.rig; // nomes dos ossos (resolvidos por instância)
 *
 * @param {THREE.Object3D} holder modelo normalizado (`AnimalModels.normalize`)
 * @param {{ kind?: 'quadruped'|'biped'|'bird'|'scorpion', lateralLegs?: boolean, spineBones?: number,
 *   tailBones?: number, jaw?: boolean, tail?: boolean }} [opts]
 * @returns {{ object: THREE.Group, rig: object } | null} null se não achou pernas/corpo
 */
export function autoRig(holder, opts = {}) {
  const cfg = { ...ANIMATION.autoRig, ...(opts.tuning ?? {}) };
  const kind = opts.kind ?? 'quadruped';
  holder.updateMatrixWorld(true);

  // ---- 1. Geometrias "assadas" no espaço do modelo + amostras da superfície.
  const parts = [];
  holder.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry?.attributes?.position) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color' && k !== 'uv1') g.deleteAttribute(k);
    parts.push({ geometry: g, material: o.material, name: o.name });
  });
  if (!parts.length) return null;
  const S = sampleSurface(parts.map((p) => p.geometry));
  const box = boundsOf(S);
  const H = box.max.y, L = box.max.z - box.min.z, W = box.max.x - box.min.x;
  if (H <= 0 || L <= 0) return null;
  const size = Math.max(L, H);

  // ---- 2. Esqueleto (pontos no espaço do modelo).
  const A = kind === 'scorpion' ? analyzeScorpion(S, box, cfg) : analyzeLegged(S, box, cfg, kind, opts);
  if (!A) return null;

  // ---- 3. Ossos.
  const bones = [];
  const byName = new Map();
  const make = (name, pos, parent) => {
    const b = new THREE.Bone();
    b.name = `ar_${name}`;
    b.userData.world = pos.clone();
    if (parent) {
      b.position.copy(pos).sub(parent.userData.world);
      parent.add(b);
    } else b.position.copy(pos);
    bones.push(b);
    byName.set(name, b);
    return b;
  };
  const root = make('root', new THREE.Vector3(0, 0, A.spine[0].z), null);
  /** Segmentos para a pesagem: [osso, início, fim]. */
  const segs = [];
  const spineBones = [];
  let parent = root;
  A.spine.forEach((p, i) => {
    const b = make(`spine${i}`, p, parent);
    spineBones.push(b);
    parent = b;
    const end = A.spine[i + 1] ?? A.neckBase ?? p.clone().add(new THREE.Vector3(0, 0, L * 0.12));
    segs.push([b, p, end]);
  });
  const pelvis = spineBones[0], chest = spineBones[spineBones.length - 1];
  const midIdx = Math.floor((spineBones.length - 1) / 2);
  const ribs = make('ribs', A.ribs, spineBones[midIdx]);

  let neck = null, head = null, jaw = null;
  if (A.neckBase && A.headPivot) {
    neck = make('neck', A.neckBase, chest);
    segs.push([neck, A.neckBase, A.headPivot]);
    head = make('head', A.headPivot, neck);
    segs.push([head, A.headPivot, A.headTip]);
    if (opts.jaw !== false && A.jawPivot) jaw = make('jaw', A.jawPivot, head);
  }
  const tail = [];
  if (opts.tail !== false && A.tail?.length) {
    let tp = pelvis;
    A.tail.forEach((p, i) => {
      const b = make(`tail${i}`, p, tp);
      tail.push(b);
      tp = b;
      segs.push([b, p, A.tail[i + 1] ?? A.tailTip]);
    });
  }
  const legs = A.legs.map((l, i) => {
    const upper = make(`leg${i}`, l.hip, l.front ? chest : pelvis);
    const lower = make(`shin${i}`, l.knee, upper);
    return { ...l, upper, lower };
  });
  const extra = (A.extra ?? []).map((e) => {
    const b = make(e.name, e.pivot, e.parent === 'chest' ? chest : e.parent === 'pelvis' ? pelvis : (byName.get(e.parent) ?? chest));
    segs.push([b, e.pivot, e.end]);
    return { ...e, bone: b };
  });
  // Cadeias extras (cauda do escorpião): cada elo segue o anterior.
  for (const ch of A.chains ?? []) {
    let cp = byName.get(ch.parent) ?? pelvis;
    ch.points.forEach((p, i) => {
      const b = make(`${ch.name}${i}`, p, cp);
      cp = b;
      segs.push([b, p, ch.points[i + 1] ?? ch.tip]);
    });
  }

  // ---- 4. Pesos e malhas com esqueleto.
  const boneIndex = new Map(bones.map((b, i) => [b, i]));
  const regions = new Map(extra.filter((e) => e.region).map((e) => [e.bone, e.region]));
  const out = new THREE.Group();
  out.name = 'autorig';
  out.add(root);
  const meshes = parts.map(({ geometry, material, name }) => {
    weighGeometry(geometry, { A, segs, legs, ribs, jaw, head, spineBones, boneIndex, cfg, H, size, regions });
    const m = new THREE.SkinnedMesh(geometry, material);
    m.name = name || 'autorig-mesh';
    m.castShadow = true;
    out.add(m);
    return m;
  });
  out.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const m of meshes) {
    m.bind(skeleton);
    m.computeBoundingSphere();
    m.boundingSphere.radius *= 1.35; // folga para patas/cauda em movimento
  }
  for (const b of bones) delete b.userData.world;

  const n = (b) => b?.name ?? null;
  const rig = {
    kind,
    root: n(root),
    spine: spineBones.map(n),
    ribs: n(ribs),
    neck: n(neck),
    head: n(head),
    jaw: n(jaw),
    tail: tail.map(n),
    legs: legs.map((l) => ({ upper: n(l.upper), lower: n(l.lower), front: l.front, side: l.side, len: l.len, knee: l.kneeH })),
    extra: extra.map((e) => ({ role: e.role, bone: n(e.bone), side: e.side ?? 0, index: e.index ?? 0 })),
    chains: (A.chains ?? []).map((c) => ({ name: c.name, bones: c.points.map((_, i) => `ar_${c.name}${i}`) })),
    dims: { L, H, W, legTop: A.legTop, torsoH: A.torsoH },
  };
  out.userData.rig = rig;
  return { object: out, rig };
}

// =========================================================== amostragem
/** Pontos da superfície: vértices + centro + meios das arestas de cada triângulo. */
function sampleSurface(geometries) {
  const pts = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const g of geometries) {
    const pos = g.attributes.position, idx = g.index;
    const tri = idx ? idx.count / 3 : pos.count / 3;
    const step = Math.max(1, Math.floor(tri / 12000)); // malhas grandes: amostra parcial
    for (let t = 0; t < tri; t += step) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
        (a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3,
        (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2,
        (b.x + c.x) / 2, (b.y + c.y) / 2, (b.z + c.z) / 2,
        (a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
    }
  }
  return Float32Array.from(pts);
}

function boundsOf(S) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < S.length; i += 3) {
    min.x = Math.min(min.x, S[i]); min.y = Math.min(min.y, S[i + 1]); min.z = Math.min(min.z, S[i + 2]);
    max.x = Math.max(max.x, S[i]); max.y = Math.max(max.y, S[i + 1]); max.z = Math.max(max.z, S[i + 2]);
  }
  return { min, max };
}

/** Índices das amostras que passam no filtro. */
function select(S, fn) {
  const out = [];
  for (let i = 0; i < S.length; i += 3) if (fn(S[i], S[i + 1], S[i + 2])) out.push(i);
  return out;
}

const quantile = (arr, q) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};

const centroid = (S, ids) => {
  const v = new THREE.Vector3();
  for (const i of ids) v.x += S[i], v.y += S[i + 1], v.z += S[i + 2];
  return ids.length ? v.multiplyScalar(1 / ids.length) : v;
};

// =========================================================== quadrúpedes / bípedes / aves
function analyzeLegged(S, box, cfg, kind, opts) {
  const H = box.max.y, L = box.max.z - box.min.z, W = box.max.x - box.min.x;
  const nLegs = kind === 'quadruped' ? 4 : 2;
  const halfW = W / 2;

  // Pés: amostras baixas (bichos de patas abertas — jacaré — só as laterais).
  let low = select(S, (x, y) => y < cfg.footBand * H && (!opts.lateralLegs || Math.abs(x) > halfW * 0.45));
  if (low.length < 8) low = select(S, (x, y) => y < cfg.footBand * H * 2);
  if (low.length < 8) return null;
  // Frente/trás pelos VÃOS em z: agrupa as amostras dos pés e fica com os 2
  // grupos maiores (patas da frente e de trás). Grupos pequenos — ponta da
  // cauda encostada no chão, focinho rente ao solo — ficam de fora.
  let zMid = quantile(low.map((i) => S[i + 2]), 0.5);
  if (nLegs === 4) {
    const sorted = [...low].sort((a, b) => S[a + 2] - S[b + 2]);
    const runs = [[sorted[0]]];
    for (let k = 1; k < sorted.length; k++) {
      if (S[sorted[k] + 2] - S[sorted[k - 1] + 2] > L * 0.04) runs.push([]);
      runs[runs.length - 1].push(sorted[k]);
    }
    if (runs.length >= 2) {
      const [a, b] = [...runs].sort((x, y) => y.length - x.length).slice(0, 2).sort((x, y) => S[x[0] + 2] - S[y[0] + 2]);
      zMid = (S[a[a.length - 1] + 2] + S[b[0] + 2]) / 2;
      const keep = new Set([...a, ...b]);
      low = low.filter((i) => keep.has(i));
    }
  }
  // k-means (3 iterações) a partir dos quadrantes.
  let cents = nLegs === 4
    ? [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => ({ x: sx * halfW * 0.4, z: zMid + sz * L * 0.25, sx, sz }))
    : [-1, 1].map((sx) => ({ x: sx * halfW * 0.4, z: zMid, sx, sz: 0 }));
  let groups = [];
  for (let it = 0; it < 4; it++) {
    groups = cents.map(() => []);
    for (const i of low) {
      const x = S[i], z = S[i + 2];
      // Mantém o lado e a frente/trás de cada quadrante (sem trocar patas).
      let best = -1, bd = Infinity;
      cents.forEach((c, k) => {
        if (Math.sign(x || 1e-9) !== c.sx) return;
        if (nLegs === 4 && Math.sign((z - zMid) || 1e-9) !== c.sz) return;
        const d = (x - c.x) ** 2 + (z - c.z) ** 2;
        if (d < bd) { bd = d; best = k; }
      });
      if (best >= 0) groups[best].push(i);
    }
    cents = cents.map((c, k) => (groups[k].length ? { ...c, x: centroid(S, groups[k]).x, z: centroid(S, groups[k]).z } : c));
  }
  if (groups.some((g) => g.length < 3)) return null;

  const front = nLegs === 4 ? cents.filter((c) => c.sz > 0) : cents;
  const back = nLegs === 4 ? cents.filter((c) => c.sz < 0) : cents;
  const zFrontLegs = front.reduce((s, c) => s + c.z, 0) / front.length;
  const zBackLegs = back.reduce((s, c) => s + c.z, 0) / back.length;

  // Barriga = topo das pernas: o ponto mais baixo do tronco entre as patas.
  const span = Math.max(zFrontLegs - zBackLegs, L * 0.1);
  let mid = nLegs === 4
    ? select(S, (x, y, z) => Math.abs(x) < W * 0.2 && z > zBackLegs + span * 0.25 && z < zFrontLegs - span * 0.25 && y > cfg.footBand * H)
    : select(S, (x, y) => Math.abs(x) < W * 0.08 && y > cfg.footBand * H);
  let legTop = mid.length ? quantile(mid.map((i) => S[i + 1]), 0.02) : H * 0.45;
  legTop = Math.min(Math.max(legTop, H * 0.12), H * 0.75);

  // Tronco no meio do corpo: espessura e linha da coluna.
  const zBodyMid = nLegs === 4 ? (zFrontLegs + zBackLegs) / 2 : zMid;
  const slice = (z0, w) => select(S, (x, y, z) => Math.abs(z - z0) < w && y >= legTop - 1e-4);
  const ms = slice(zBodyMid, L * 0.06);
  const torsoTop = ms.length ? quantile(ms.map((i) => S[i + 1]), 0.97) : Math.min(H, legTop * 1.8);
  const torsoH = Math.max(torsoTop - legTop, H * 0.08);
  const spineY = (z0) => {
    const s = slice(z0, L * 0.06).map((i) => S[i + 1]).filter((y) => y <= torsoTop + torsoH * 0.15);
    return s.length ? legTop + (quantile(s, 0.5) - legTop) * 0.5 + torsoH * 0.28 : legTop + torsoH * 0.55;
  };

  // Coluna: da pelve (patas de trás) ao peito (patas da frente). Bípedes:
  // pelve sobre as pernas, peito na frente do corpo.
  let zPelvis = zBackLegs, zChest = zFrontLegs;
  if (nLegs === 2) {
    const torso = select(S, (x, y) => y > legTop && y < torsoTop);
    const tz = torso.map((i) => S[i + 2]);
    zPelvis = Math.min(zMid, quantile(tz, 0.5));
    zChest = quantile(tz, 0.85);
  }
  const nSpine = Math.max(2, opts.spineBones ?? (kind === 'quadruped' ? 3 : 2));
  const spine = [];
  for (let i = 0; i < nSpine; i++) {
    const z = zPelvis + (zChest - zPelvis) * (i / (nSpine - 1));
    spine.push(new THREE.Vector3(0, spineY(z), z));
  }
  const ribs = new THREE.Vector3(0, legTop + torsoH * 0.35, (zPelvis + zChest) / 2 + (zChest - zPelvis) * 0.12);

  // Cabeça: o pedaço mais à frente acima das pernas.
  const ahead = select(S, (x, y, z) => z > zChest + L * 0.04 && y > legTop + torsoH * 0.1);
  let neckBase = null, headPivot = null, headTip = null, jawPivot = null, headCenter = null;
  if (ahead.length > 12) {
    const zMax = quantile(ahead.map((i) => S[i + 2]), 0.995);
    const front3 = ahead.filter((i) => S[i + 2] > zMax - (zMax - zChest) * 0.32);
    headCenter = centroid(S, front3);
    headCenter.x = 0;
    const hy = front3.map((i) => S[i + 1]);
    const headH = Math.max(quantile(hy, 0.95) - quantile(hy, 0.05), H * 0.05);
    neckBase = new THREE.Vector3(0, spine[spine.length - 1].y + torsoH * 0.22, zChest + (zMax - zChest) * 0.08);
    headPivot = neckBase.clone().lerp(headCenter, kind === 'biped' || kind === 'bird' ? 0.82 : 0.6);
    headTip = new THREE.Vector3(0, headCenter.y, zMax);
    jawPivot = headPivot.clone().lerp(headCenter, 0.35);
    jawPivot.y = headCenter.y - headH * 0.12;
  }

  // Pernas.
  const legs = cents.map((c, k) => {
    const g = groups[k];
    const r = quantile(g.map((i) => Math.hypot(S[i] - c.x, S[i + 2] - c.z)), 0.9);
    // Eixo da perna: do pé até o centro da perna logo abaixo da barriga.
    const up = select(S, (x, y, z) => Math.abs(y - legTop * 0.82) < H * 0.04 && Math.hypot(x - c.x, z - c.z) < Math.max(r * 2.5, L * 0.08));
    const top = up.length ? centroid(S, up) : new THREE.Vector3(c.x, legTop, c.z);
    const isFront = nLegs === 4 ? c.sz > 0 : false;
    const kneeH = legTop * cfg.kneeAt * (isFront ? 1.05 : 0.95);
    const spineAt = isFront ? spine[spine.length - 1] : spine[0];
    const hip = new THREE.Vector3(top.x * 0.85, legTop + (spineAt.y - legTop) * 0.55, top.z);
    const knee = new THREE.Vector3(c.x + (top.x - c.x) * (kneeH / legTop), kneeH, c.z + (top.z - c.z) * (kneeH / legTop));
    return {
      front: isFront, side: c.sx, foot: new THREE.Vector3(c.x, 0, c.z), top, hip, knee, kneeH,
      radius: Math.min(Math.max(r * 1.7, Math.max(L, H) * 0.035), Math.max(L, H) * 0.1),
      len: hip.y,
    };
  });

  // Cauda: o que está atrás do quadril, acima do jarrete, perto do meio.
  let tail = null, tailTip = null;
  if (opts.tail !== false) {
    const zRear = Math.min(zPelvis, zBackLegs) - L * 0.05;
    const T = select(S, (x, y, z) => z < zRear && y > legTop * 0.3 && Math.abs(x) < W * 0.28
      && !legs.some((l) => !l.front && y < legTop && Math.hypot(x - l.foot.x, z - l.foot.z) < l.radius * 1.4));
    if (T.length > 20) {
      const P = spine[0];
      const d = T.map((i) => Math.hypot(S[i] - P.x, S[i + 1] - P.y, S[i + 2] - P.z));
      const dMin = quantile(d, 0.08), dMax = quantile(d, 0.995);
      if (dMax - dMin > Math.max(L, H) * 0.1) {
        const band = (a, b) => T.filter((_, j) => d[j] >= dMin + (dMax - dMin) * a && d[j] <= dMin + (dMax - dMin) * b);
        const nT = Math.max(2, opts.tailBones ?? 3);
        tail = [];
        for (let i = 0; i < nT; i++) {
          const ids = band(i / nT - (i ? 0.04 : 0), i / nT + 0.08);
          tail.push(ids.length ? centroid(S, ids).setX(0) : P.clone());
        }
        const tipIds = band(0.94, 1.01);
        tailTip = tipIds.length ? centroid(S, tipIds).setX(0) : tail[tail.length - 1].clone();
        // Base da cauda nunca dentro do quadril: começa na traseira.
        tail[0].z = Math.min(tail[0].z, zRear + L * 0.02);
      }
    }
  }

  // Asas (aves): placas laterais acima da coluna, presas no ombro.
  const extra = [];
  if (kind === 'bird') {
    for (const sx of [-1, 1]) {
      const wing = select(S, (x, y, z) => x * sx > halfW * 0.38 && y > legTop + torsoH * 0.2 && z < zChest + L * 0.1);
      if (wing.length < 6) continue;
      const c = centroid(S, wing);
      const pivot = new THREE.Vector3(sx * halfW * 0.3, c.y, zChest - L * 0.05);
      const end = new THREE.Vector3(sx * Math.max(Math.abs(c.x) * 1.6, halfW), c.y, c.z - L * 0.1);
      extra.push({ name: `wing${sx > 0 ? 'R' : 'L'}`, role: 'wing', side: sx, pivot, end, parent: 'chest', region: (x, y, z) => x * sx > halfW * 0.34 && y > legTop + torsoH * 0.1 });
    }
  }

  return { kind, legTop, torsoH, torsoTop, spine, ribs, neckBase, headPivot, headTip, headCenter, jawPivot, tail, tailTip, legs, extra, lateral: !!opts.lateralLegs, halfW };
}

// =========================================================== escorpião
function analyzeScorpion(S, box, cfg) {
  const H = box.max.y, L = box.max.z - box.min.z, W = box.max.x - box.min.x;
  const zC = (box.max.z + box.min.z) / 2;
  // Corpo: amostras centrais baixas; ferrão/cauda: tudo alto atrás do centro.
  const bodyIds = select(S, (x, y, z) => Math.abs(x) < W * 0.18 && Math.abs(z - zC) < L * 0.2);
  if (bodyIds.length < 10) return null;
  const bodyY = quantile(bodyIds.map((i) => S[i + 1]), 0.5);
  const bodyTop = quantile(bodyIds.map((i) => S[i + 1]), 0.9);
  const torsoH = Math.max(bodyTop - quantile(bodyIds.map((i) => S[i + 1]), 0.05), H * 0.1);
  const legTop = Math.max(bodyY - torsoH * 0.5, H * 0.05);
  const zBack = zC - L * 0.18, zFront = zC + L * 0.18;
  const spine = [new THREE.Vector3(0, bodyY, zBack), new THREE.Vector3(0, bodyY, zC), new THREE.Vector3(0, bodyY, zFront)];
  const ribs = new THREE.Vector3(0, bodyY, zC);

  // Cauda: amostras atrás do corpo ou acima dele (arco sobre as costas).
  const T = select(S, (x, y, z) => Math.abs(x) < W * 0.2 && (z < zBack - L * 0.04 || y > bodyTop + torsoH * 0.4));
  const chains = [];
  if (T.length > 10) {
    // Ordena pela distância ao longo do arco: aproximação pela distância à base.
    const base = new THREE.Vector3(0, bodyY, zBack - L * 0.06);
    const d = T.map((i) => Math.hypot(S[i] - base.x, S[i + 1] - base.y, S[i + 2] - base.z));
    const dMin = quantile(d, 0.02), dMax = quantile(d, 0.995);
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const ids = T.filter((_, j) => d[j] >= dMin + (dMax - dMin) * (k / 4) && d[j] <= dMin + (dMax - dMin) * ((k + 1) / 4));
      pts.push(ids.length ? centroid(S, ids).setX(0) : base.clone());
    }
    pts[0] = base;
    const tipIds = T.filter((_, j) => d[j] > dMin + (dMax - dMin) * 0.92);
    chains.push({ name: 'sting', parent: 'spine0', points: pts, tip: tipIds.length ? centroid(S, tipIds).setX(0) : pts[3].clone() });
  }

  const extra = [];
  // Pinças: o que está à frente do corpo, de cada lado.
  for (const sx of [-1, 1]) {
    const ids = select(S, (x, y, z) => z > zFront + L * 0.02 && x * sx > -W * 0.02);
    if (ids.length < 6) continue;
    const c = centroid(S, ids);
    const pivot = new THREE.Vector3(sx * W * 0.08, bodyY, zFront);
    extra.push({ name: `claw${sx > 0 ? 'R' : 'L'}`, role: 'claw', side: sx, pivot, end: c, parent: 'chest' });
  }
  // Patas: laterais do corpo, 4 faixas por lado.
  const zMin = zBack - L * 0.05, zMax = zFront + L * 0.02;
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const z0 = zMin + (zMax - zMin) * (k / 4), z1 = zMin + (zMax - zMin) * ((k + 1) / 4);
      const ids = select(S, (x, y, z) => x * sx > W * 0.14 && z >= z0 && z < z1 && y < bodyTop);
      if (ids.length < 4) continue;
      const c = centroid(S, ids);
      const pivot = new THREE.Vector3(sx * W * 0.1, bodyY, (z0 + z1) / 2);
      extra.push({ name: `leg${sx > 0 ? 'R' : 'L'}${k}`, role: 'insectLeg', side: sx, index: k, pivot, end: c, parent: 'spine1' });
    }
  }
  return { kind: 'scorpion', legTop, torsoH, torsoTop: bodyTop, spine, ribs, neckBase: null, headPivot: null, legs: [], extra, chains };
}

// =========================================================== pesos
const _p = new THREE.Vector3(), _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
function segDist(p, a, b) {
  _ab.subVectors(b, a);
  _ap.subVectors(p, a);
  const len2 = _ab.lengthSq();
  const t = len2 > 1e-12 ? Math.min(1, Math.max(0, _ap.dot(_ab) / len2)) : 0;
  return _ap.addScaledVector(_ab, -t).length();
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Escreve skinIndex/skinWeight (4 influências) em `geometry`. */
function weighGeometry(geometry, ctx) {
  const { A, segs, legs, ribs, jaw, head, spineBones, boneIndex, cfg, H, size, regions } = ctx;
  const pos = geometry.attributes.position;
  const n = pos.count;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const blend = cfg.legBlend * H;
  const eps = (size * 0.004) ** cfg.weightPower;
  const w = new Map();
  const add = (bone, v) => { if (bone && v > 0) w.set(bone, (w.get(bone) ?? 0) + v); };
  const pelvis = spineBones[0], chest = spineBones[spineBones.length - 1], mid = spineBones[Math.floor((spineBones.length - 1) / 2)];

  for (let v = 0; v < n; v++) {
    _p.fromBufferAttribute(pos, v);
    w.clear();
    // Região de perna (por perto do eixo da pata mais próxima).
    let legShare = 0, leg = null;
    if (legs.length && _p.y < A.legTop + blend) {
      let bd = Infinity;
      for (const l of legs) {
        const t = Math.min(1, Math.max(0, _p.y / Math.max(l.top.y, 1e-4)));
        const ax = l.foot.x + (l.top.x - l.foot.x) * t, az = l.foot.z + (l.top.z - l.foot.z) * t;
        // Patas abertas para o lado (jacaré): só vale do lado da pata, longe da
        // linha do meio — senão o focinho/barriga, rentes ao chão, viram "perna".
        if (A.lateral && (Math.sign(_p.x) !== l.side || Math.abs(_p.x) < A.halfW * 0.38)) continue;
        const d = Math.hypot(_p.x - ax, _p.z - az) / l.radius;
        if (d < bd) { bd = d; leg = l; }
      }
      if (bd < 1.8) legShare = 1 - smooth(A.legTop - blend, A.legTop + blend, _p.y);
      else leg = null;
    }
    if (leg && legShare > 0) {
      const kb = H * 0.05;
      const upperT = smooth(leg.kneeH - kb, leg.kneeH + kb, _p.y);
      add(leg.lower, legShare * (1 - upperT));
      add(leg.upper, legShare * upperT);
    }
    const bodyShare = 1 - legShare;
    if (bodyShare > 0) {
      // Ossos do corpo por proximidade (1/d^p).
      const raw = [];
      let sum = 0;
      for (const [bone, a, b] of segs) {
        const d = segDist(_p, a, b);
        const r = 1 / (d ** cfg.weightPower + eps);
        raw.push([bone, r]);
        sum += r;
      }
      // Regiões exclusivas (asas, pinças): vértice fora da região não pega o osso.
      for (const item of raw) {
        const region = regions.get(item[0]);
        if (region && !region(_p.x, _p.y, _p.z)) { sum -= item[1]; item[1] = 0; }
      }
      if (sum <= 0) { sum = 1; raw.push([mid, 1]); }
      // Perto da barriga, a parte "corpo" de uma pata puxa para o osso do qual ela sai.
      if (leg) {
        const anchor = leg.front ? chest : pelvis;
        const k = sum * 0.6;
        raw.push([anchor, k]);
        sum += k;
      }
      for (const [bone, r] of raw) add(bone, bodyShare * (r / sum));
    }
    // Caixa torácica: parte do peso do meio/peito na barriga e costelas vai para `ribs`.
    if (ribs && A.torsoH) {
      const lowT = smooth(A.legTop + A.torsoH * 0.95, A.legTop + A.torsoH * 0.35, _p.y);
      const zSpan = Math.abs(A.spine[A.spine.length - 1].z - A.spine[0].z) || 1;
      const zT = 1 - smooth(zSpan * 0.35, zSpan * 0.6, Math.abs(_p.z - ribs.userData.world.z));
      const k = cfg.ribsShare * lowT * zT;
      for (const bone of [mid, chest]) {
        const cur = w.get(bone) ?? 0;
        if (cur > 0) { w.set(bone, cur * (1 - k)); add(ribs, cur * k); }
      }
    }
    // Mandíbula: parte de baixo/à frente da cabeça.
    if (jaw && head) {
      const hw = w.get(head) ?? 0;
      if (hw > 0) {
        const jp = jaw.userData.world;
        const tip = A.headTip;
        const reach = Math.max(tip.z - jp.z, 1e-3);
        const k = smooth(jp.y + reach * 0.08, jp.y - reach * 0.12, _p.y) * smooth(jp.z - reach * 0.05, jp.z + reach * 0.25, _p.z);
        if (k > 0) { w.set(head, hw * (1 - k)); add(jaw, hw * k); }
      }
    }
    // 4 maiores, normalizados.
    const top = [...w.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const tot = top.reduce((s, [, x]) => s + x, 0) || 1;
    for (let k = 0; k < 4; k++) {
      skinIndex[v * 4 + k] = top[k] ? boneIndex.get(top[k][0]) : 0;
      skinWeight[v * 4 + k] = top[k] ? top[k][1] / tot : 0;
    }
    if (!top.length) skinWeight[v * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
}
