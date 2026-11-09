import { smoothstep, clamp } from './Noise.js';

/**
 * Relevo extra desenhado a partir do mapa (cordilheiras e mesas).
 * Funções puras: recebem as feições já em metros e um gerador de ruído,
 * então podem ser testadas sem o resto do mundo.
 */

/**
 * Converte a lista `RELIEF` (u, v) para metros e pré-calcula a caixa de
 * cada feição (para pular rápido os pontos longe dela).
 * @param {object[]} list `RELIEF`
 * @param {(u: number, v: number) => { x: number, z: number }} toWorld
 * @example prepareRelief(RELIEF, uvToWorld)
 */
export function prepareRelief(list, toWorld) {
  return list.map((f) => {
    if (f.type === 'range') {
      const pts = f.points.map(([u, v]) => toWorld(u, v));
      const pad = f.width;
      return {
        ...f, pts,
        minX: Math.min(...pts.map((p) => p.x)) - pad, maxX: Math.max(...pts.map((p) => p.x)) + pad,
        minZ: Math.min(...pts.map((p) => p.z)) - pad, maxZ: Math.max(...pts.map((p) => p.z)) + pad,
      };
    }
    const c = toWorld(f.u, f.v);
    const pad = f.radius * 1.8;
    return { ...f, x: c.x, z: c.z, minX: c.x - pad, maxX: c.x + pad, minZ: c.z - pad, maxZ: c.z + pad };
  });
}

/** Distância de (x, z) até uma polilinha [{x, z}, …]. */
export function distanceToPolyline(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1), 0, 1);
    const px = a.x + abx * t - x, pz = a.z + abz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return Math.sqrt(best);
}

/**
 * Perfil de uma mesa (0-1) em função da distância ao centro.
 * Topo plano até `radius - 6`, paredão até `radius + 10`, talude até 1,7 × radius.
 * @example mesaProfile(0, 80) // 1
 * @example mesaProfile(200, 80) // 0
 */
export function mesaProfile(r, radius) {
  const cliff = smoothstep(radius + 10, radius - 6, r);
  const talus = smoothstep(radius * 1.7, radius, r);
  return 0.84 * cliff + 0.16 * talus;
}

/**
 * Perfil transversal de uma cordilheira (0-1): 1 na crista, 0 a `width` m.
 * @example rangeProfile(0, 200) // 1
 */
export function rangeProfile(d, width) {
  if (d >= width) return 0;
  const t = 1 - d / width;
  return t * t * (3 - 2 * t);
}

/**
 * Metros a somar ao terreno em (x, z).
 * @param {object[]} features saída de `prepareRelief`
 * @param {{ fbm: Function, ridged: Function }} noise
 */
export function reliefAt(features, noise, x, z) {
  let add = 0;
  for (const f of features) {
    if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
    const o = f.seed * 17.3;
    if (f.type === 'range') {
      const d = distanceToPolyline(f.pts, x, z) + 40 * noise.fbm(x / 160 + o, z / 160, 3);
      const p = rangeProfile(Math.max(0, d), f.width);
      if (p <= 0) continue;
      // Picos e vales ao longo da serra; a crista nunca some por completo.
      const peaks = 0.35 + 0.85 * noise.ridged(x / 240 + o, z / 240 - o, 5);
      add += f.height * Math.pow(p, 1.2) * peaks;
    } else {
      const dx = x - f.x, dz = z - f.z;
      const ang = Math.atan2(dz, dx);
      // Borda recortada (fbm no ângulo) para a mesa não parecer um cilindro.
      const wobble = f.radius * 0.18 * noise.fbm(Math.cos(ang) * 1.6 + o, Math.sin(ang) * 1.6, 3);
      const r = Math.hypot(dx, dz) + wobble + 6 * noise.fbm(x / 25, z / 25, 2);
      const p = mesaProfile(r, f.radius);
      if (p <= 0) continue;
      // Estratos: degraus suaves nas encostas.
      const strata = 1 + 0.03 * Math.sin(p * 40);
      add += f.height * p * strata;
    }
  }
  return add;
}
