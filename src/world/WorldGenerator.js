import { WORLD, uvToWorld, worldToUv } from '../config/worldConfig.js';
import { BIOMES, RIVERS } from '../config/biomes.js';
import { Noise, smoothstep, lerp, clamp } from './Noise.js';
import { RELIEF } from '../config/landmarks.js';
import { prepareRelief, reliefAt } from './Relief.js';

const BIOME_COUNT = BIOMES.length;

/**
 * Gerador procedural do continente.
 *
 * Responsável por duas funções puras (determinísticas pela seed):
 *  - biomeWeights(x, z): quanto cada bioma "pesa" num ponto (soma = 1);
 *  - height(x, z): altura do terreno em metros (0 = nível da água).
 *
 * O formato segue a imagem de referência: lago central com ilha,
 * montanhas nevadas ao norte, deserto a nordeste, florestas a leste/sudeste,
 * Kalahari ao sul, floresta tropical a oeste e savana a noroeste.
 */
export class WorldGenerator {
  constructor(referenceMap) {
    this.noise = new Noise(WORLD.seed);
    this.ref = referenceMap;

    this.seeds = BIOMES.map((b) => b.seeds.map(([u, v]) => uvToWorld(u, v)));

    const lc = uvToWorld(WORLD.lake.u, WORLD.lake.v);
    this.lake = { x: lc.x, z: lc.z, R: WORLD.lake.radius, Ri: WORLD.lake.islandRadius };

    this.rivers = RIVERS.map((r) => {
      const pts = r.points.map(([u, v]) => uvToWorld(u, v));
      const valley = 70 + r.width;
      const pad = valley + r.width;
      return {
        width: r.width,
        valley,
        pts,
        minX: Math.min(...pts.map((p) => p.x)) - pad,
        maxX: Math.max(...pts.map((p) => p.x)) + pad,
        minZ: Math.min(...pts.map((p) => p.z)) - pad,
        maxZ: Math.max(...pts.map((p) => p.z)) + pad,
      };
    });

    /** Cordilheiras e mesas desenhadas a partir do mapa. */
    this.relief = prepareRelief(RELIEF, uvToWorld);

    /** Zonas aplainadas (vilas, plantações). */
    this.flatZones = [];
    this._w = new Float32Array(BIOME_COUNT);
  }

  /**
   * Registra uma área plana. Se `height` não for informado, usa a altura
   * natural do centro (mínimo 3 m acima da água).
   */
  addFlatZone({ x, z, radius, blend = 40, height }) {
    const h = height ?? clamp(this.height(x, z, null, true), 3, 60);
    this.flatZones.push({ x, z, radius, blend, height: h });
    return h;
  }

  /** Preenche `out` (Float32Array de 7) com os pesos dos biomas. */
  biomeWeights(x, z, out = this._w) {
    const n = this.noise;
    // Distorção de domínio: bordas orgânicas entre biomas.
    const wx = x + 170 * n.fbm(x / 800 + 11.3, z / 800 - 4.1, 3);
    const wz = z + 170 * n.fbm(x / 800 - 7.7, z / 800 + 19.2, 3);

    if (this.ref?.hasBiomeMask) {
      out.fill(0);
      const offs = [[0, 0], [24, 0], [-24, 0], [0, 24], [0, -24]];
      for (const [ox, oz] of offs) {
        const { u, v } = worldToUv(wx + ox, wz + oz);
        out[this.ref.sampleBiome(u, v)] += 1 / offs.length;
      }
      return out;
    }

    let dmin = Infinity;
    for (let i = 0; i < BIOME_COUNT; i++) {
      let d = Infinity;
      for (const s of this.seeds[i]) {
        const dx = wx - s.x, dz = wz - s.z;
        const dd = dx * dx + dz * dz;
        if (dd < d) d = dd;
      }
      out[i] = Math.sqrt(d);
      if (out[i] < dmin) dmin = out[i];
    }
    let sum = 0;
    for (let i = 0; i < BIOME_COUNT; i++) {
      const w = Math.exp(-(out[i] - dmin) / 55);
      out[i] = w < 0.004 ? 0 : w;
      sum += out[i];
    }
    for (let i = 0; i < BIOME_COUNT; i++) out[i] /= sum;
    return out;
  }

  /** Relevo característico de cada bioma (m). */
  biomeProfile(i, x, z) {
    const n = this.noise;
    switch (BIOMES[i].id) {
      case 'savana': {
        const k = n.ridged(x / 230 + 3.1, z / 230 - 1.7, 3);
        return 5 + 7 * n.fbm(x / 420, z / 420, 4) + 1.5 * n.fbm(x / 60, z / 60, 2)
          + Math.max(0, k - 0.52) * 85; // kopjes (afloramentos rochosos)
      }
      case 'taiga': {
        const v = z / WORLD.depth + 0.5;
        const north = smoothstep(0.42, 0.0, v);
        return 14 + 25 * n.fbm(x / 400, z / 400, 3)
          + (40 + 280 * north) * n.ridged(x / 520 + 7.3, z / 520 + 2.2, 6);
      }
      case 'deserto': {
        const d = Math.abs(Math.sin((x * 0.8 + z * 0.6) / 38 + 3 * n.fbm(x / 300, z / 300, 2)));
        return 6 + 14 * Math.pow(d, 1.6) * (0.6 + 0.4 * n.fbm(x / 500, z / 500, 2))
          + 10 * n.fbm(x / 650 + 3, z / 650, 3);
      }
      case 'kalahari': {
        const d = Math.abs(Math.sin((x * 0.95 + z * 0.3) / 30 + 2.5 * n.fbm(x / 250, z / 250, 2)));
        return 5 + 6 * Math.pow(d, 1.4) + 5 * n.fbm(x / 500 - 5, z / 500, 3);
      }
      case 'tropical':
        return 7 + 20 * (n.fbm(x / 320, z / 320, 4) * 0.5 + 0.5) + 3 * n.fbm(x / 70, z / 70, 2);
      case 'equatorial':
        return 6 + 14 * (n.fbm(x / 380 + 9, z / 380, 4) * 0.5 + 0.5) + 2.5 * n.fbm(x / 60, z / 60, 2);
      case 'preta':
        return 10 + 30 * (n.fbm(x / 260, z / 260, 5) * 0.5 + 0.5)
          + 22 * n.ridged(x / 300 - 4, z / 300 + 8, 4);
      default:
        return 5;
    }
  }

  /**
   * Altura final do terreno.
   * @param {Float32Array|null} weights pesos já calculados (opcional)
   * @param {boolean} skipFlat ignora zonas aplainadas (usado para achar a base de uma vila)
   */
  height(x, z, weights = null, skipFlat = false) {
    const n = this.noise;
    const w = weights ?? this.biomeWeights(x, z);

    let h = 0;
    for (let i = 0; i < BIOME_COUNT; i++) {
      if (w[i] > 0.01) h += w[i] * this.biomeProfile(i, x, z);
    }

    if (this.ref?.hasHeightmap) {
      const { u, v } = worldToUv(x, z);
      h = this.ref.sampleHeight(u, v) + 0.25 * (h - 10);
    } else {
      h = this.applyLake(x, z, h);
      h = this.applyCoast(x, z, h);
    }

    h += reliefAt(this.relief, n, x, z);
    h += 0.35 * n.fbm(x / 14, z / 14, 2); // micro-relevo

    if (!skipFlat) {
      for (const f of this.flatZones) {
        const dx = x - f.x, dz = z - f.z;
        const d2 = dx * dx + dz * dz;
        const outer = f.radius + f.blend;
        if (d2 < outer * outer) {
          const t = smoothstep(f.radius, outer, Math.sqrt(d2));
          h = lerp(f.height + 0.12 * n.fbm(x / 9, z / 9, 2), h, t);
        }
      }
    }

    if (!this.ref?.hasHeightmap) h = this.applyRivers(x, z, h);
    return h;
  }

  applyLake(x, z, h) {
    const n = this.noise;
    const { R, Ri } = this.lake;
    const dx = x - this.lake.x, dz = z - this.lake.z;
    const r = Math.sqrt(dx * dx + dz * dz);
    const rn = r + 45 * n.fbm(x / 240 + 5, z / 240 - 3, 3);

    // Perto do lago o terreno vira uma planície baixa.
    const land = smoothstep(R + 10, R + 320, rn);
    h = 2.2 + (h - 2.2) * land;

    if (rn < R + 50) {
      const rIsl = r + 14 * n.fbm(x / 90, z / 90, 2);
      let lakeH;
      if (rIsl < Ri) lakeH = 3.2 + 1.2 * (1 - (rIsl / Ri) ** 2);
      else lakeH = lerp(3.2, -9, smoothstep(Ri, Ri + 40, rIsl))
        - 4 * (n.fbm(x / 200, z / 200, 2) * 0.5 + 0.5) * smoothstep(Ri + 40, Ri + 140, rIsl);
      lakeH = lerp(lakeH, 1.6, smoothstep(R - 70, R + 10, rn));
      h = lerp(h, lakeH, 1 - smoothstep(R - 10, R + 50, rn));
    }
    return h;
  }

  applyCoast(x, z, h) {
    const n = this.noise;
    const W2 = WORLD.width / 2, D2 = WORLD.depth / 2;
    const u = x / WORLD.width + 0.5;
    // No centro-norte as montanhas vão até a borda do mapa.
    const northPush = smoothstep(0.26, 0.1, Math.abs(u - 0.5)) * 500;
    const d = Math.min(x + W2, W2 - x, z + D2 + northPush, D2 - z);
    const coast = 60 + 150 * (n.fbm(x / 500 + 40, z / 500 - 20, 3) * 0.5 + 0.5);
    h = lerp(1.4, h, smoothstep(coast, coast + 260, d)); // praias suaves
    return lerp(-24 + 6 * n.fbm(x / 300, z / 300, 2), h, smoothstep(coast - 60, coast + 70, d));
  }

  applyRivers(x, z, h) {
    for (const r of this.rivers) {
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      const d = this.distanceToPolyline(r.pts, x, z);
      const half = r.width / 2;
      if (d > half + r.valley) continue;
      const bed = -2.8;
      const hr = d < half
        ? bed + (d / half) ** 2 * (-0.2 - bed)
        : lerp(0.5, h, smoothstep(half, half + r.valley, d));
      if (hr < h) h = hr;
    }
    return h;
  }

  /** Distância mínima de (x,z) até uma polilinha. */
  distanceToPolyline(pts, x, z) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
      const px = a.x + abx * t - x, pz = a.z + abz * t - z;
      const d = px * px + pz * pz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** Distância até o rio mais próximo (para palmeiras de oásis etc.). */
  distanceToRiver(x, z) {
    let best = Infinity;
    for (const r of this.rivers) best = Math.min(best, this.distanceToPolyline(r.pts, x, z));
    return best;
  }
}
