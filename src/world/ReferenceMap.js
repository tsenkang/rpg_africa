import { REFERENCE_MAP } from '../config/worldConfig.js';
import { BIOMES } from '../config/biomes.js';

/**
 * Carrega a imagem de referência do continente (e, opcionalmente, uma
 * heightmap) e permite amostrar pixels por coordenada normalizada (u, v).
 *
 * A imagem NÃO é esticada sobre o terreno. Ela serve para:
 *  1. minimapa / mapa grande;
 *  2. máscara de biomas (REFERENCE_MAP.useAsBiomeMask);
 *  3. heightmap (REFERENCE_MAP.heightmapUrl).
 */
export class ReferenceMap {
  constructor() {
    this.image = null;
    this.colorData = null;
    this.heightData = null;
  }

  static async load(config = REFERENCE_MAP) {
    const ref = new ReferenceMap();
    if (config.imageUrl) {
      ref.image = await loadImage(config.imageUrl).catch(() => null);
      if (ref.image && config.useAsBiomeMask) ref.colorData = readPixels(ref.image);
    }
    if (config.heightmapUrl) {
      const hm = await loadImage(config.heightmapUrl).catch(() => null);
      if (hm) ref.heightData = readPixels(hm);
    }
    return ref;
  }

  get hasBiomeMask() {
    return !!this.colorData;
  }

  get hasHeightmap() {
    return !!this.heightData;
  }

  /** Altura (m) vinda da heightmap, com interpolação bilinear. */
  sampleHeight(u, v) {
    const g = sampleBilinear(this.heightData, u, v, 0) / 255;
    return (g - REFERENCE_MAP.heightmapSeaLevel) * REFERENCE_MAP.heightmapScale;
  }

  /** Índice do bioma cuja maskColor é mais parecida com o pixel. */
  sampleBiome(u, v) {
    const { width, height, data } = this.colorData;
    const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let best = 0, bestD = Infinity;
    BIOMES.forEach((biome, idx) => {
      const c = biome.maskColor;
      const dr = r - ((c >> 16) & 255), dg = g - ((c >> 8) & 255), db = b - (c & 255);
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = idx; }
    });
    return best;
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function readPixels(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function sampleBilinear({ width, height, data }, u, v, channel) {
  const fx = Math.min(width - 1.001, Math.max(0, u * (width - 1)));
  const fy = Math.min(height - 1.001, Math.max(0, v * (height - 1)));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const p = (x, y) => data[(y * width + x) * 4 + channel];
  const a = p(x0, y0) * (1 - tx) + p(x0 + 1, y0) * tx;
  const b = p(x0, y0 + 1) * (1 - tx) + p(x0 + 1, y0 + 1) * tx;
  return a * (1 - ty) + b * ty;
}
