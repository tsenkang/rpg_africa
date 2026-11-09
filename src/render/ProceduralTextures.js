import * as THREE from 'three';
import { mulberry32 } from '../world/Noise.js';

/**
 * Texturas procedurais geradas em <canvas> (sem downloads).
 * Todas são "tileáveis" (repetem sem emenda) e servem de detalhe fino
 * para terreno, paredes, telhados, madeira e pedra.
 *
 * Para trocar por fotos/PBR reais, carregue arquivos de
 * public/assets/textures com THREE.TextureLoader e substitua em Materials.js.
 */

/** Ruído de valor periódico (tileável) em [0,1]. */
function tileNoise(size, cells, seed) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(cells * cells).map(() => rnd());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cells;
    const y0 = Math.floor(gy), ty = gy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const x0 = Math.floor(gx), tx = gx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const g = (i, j) => grid[((j % cells) * cells) + (i % cells)];
      const a = g(x0, y0) * (1 - sx) + g(x0 + 1, y0) * sx;
      const b = g(x0, y0 + 1) * (1 - sx) + g(x0 + 1, y0 + 1) * sx;
      out[y * size + x] = a * (1 - sy) + b * sy;
    }
  }
  return out;
}

/** Soma várias oitavas de tileNoise. */
function fractal(size, baseCells, octaves, seed) {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0, cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const n = tileNoise(size, cells, seed + o * 97);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    norm += amp;
    amp *= 0.5;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function toTexture(canvas, { srgb = true, repeat = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function canvasFromFn(size, fn) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x, y, y * size + x);
      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp255 = (c) => c.map((v) => Math.max(0, Math.min(255, v)));

/** Normal map a partir de um campo de altura tileável. */
function normalMapFromHeight(height, size, strength) {
  const canvas = canvasFromFn(size, (x, y) => {
    const h = (i, j) => height[(((j + size) % size) * size) + ((i + size) % size)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
    const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    return [(-dx / len * 0.5 + 0.5) * 255, (-dy / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255];
  });
  return toTexture(canvas, { srgb: false });
}

export function createTextures() {
  const T = {};
  const S = 256;

  // --- Detalhe do solo (multiplica a cor dos vértices) ---
  {
    const n = fractal(512, 8, 5, 11);
    const pebbles = fractal(512, 64, 2, 23);
    const canvas = canvasFromFn(512, (x, y, i) => {
      let v = 0.72 + 0.32 * n[i];
      if (pebbles[i] > 0.72) v *= 0.82;
      return [v * 255, v * 252, v * 246];
    });
    T.groundDetail = toTexture(canvas);
    const hgt = new Float32Array(512 * 512).map((_, i) => n[i] * 0.7 + pebbles[i] * 0.3);
    T.groundNormal = normalMapFromHeight(hgt, 512, 6);
  }

  // --- Reboco / adobe (parede de barro) ---
  T.plaster = (hex, seed = 3) => {
    const n = fractal(S, 4, 5, seed);
    const stains = fractal(S, 3, 3, seed + 50);
    const base = rgb(hex);
    return toTexture(canvasFromFn(S, (x, y, i) => {
      let c = base.map((v) => v * (0.82 + 0.3 * n[i]));
      if (y > S * 0.85) c = c.map((v) => v * (0.85 + 0.15 * (S - y) / (S * 0.15))); // barra suja
      c = mix(c, base.map((v) => v * 0.7), Math.max(0, stains[i] - 0.6) * 1.5);
      return clamp255(c);
    }));
  };

  // --- Tijolos de barro ---
  T.mudBrick = (hex, seed = 5) => {
    const n = fractal(S, 8, 4, seed);
    const base = rgb(hex);
    return toTexture(canvasFromFn(S, (x, y, i) => {
      const row = Math.floor(y / 21);
      const off = row % 2 ? 24 : 0;
      const mortar = y % 21 < 2 || (x + off) % 48 < 2;
      const v = mortar ? 0.72 : 0.85 + 0.25 * n[i];
      return clamp255(base.map((c) => c * v));
    }));
  };

  // --- Blocos de pedra ---
  T.stone = (hex, seed = 7) => {
    const n = fractal(S, 6, 5, seed);
    const rnd = mulberry32(seed);
    const tints = Array.from({ length: 64 }, () => 0.82 + rnd() * 0.3);
    const base = rgb(hex);
    return toTexture(canvasFromFn(S, (x, y, i) => {
      const row = Math.floor(y / 32);
      const off = row % 2 ? 32 : 0;
      const col = Math.floor((x + off) / 64) % 4;
      const mortar = y % 32 < 3 || (x + off) % 64 < 3;
      const v = mortar ? 0.55 : tints[(row * 4 + col) % 64] * (0.8 + 0.3 * n[i]);
      return clamp255(base.map((c) => c * v));
    }));
  };

  // --- Paralelepípedos / calçamento ---
  T.cobble = (hex, seed = 9) => {
    const rnd = mulberry32(seed);
    const pts = Array.from({ length: 70 }, () => [rnd() * S, rnd() * S, 0.8 + rnd() * 0.3]);
    const n = fractal(S, 8, 3, seed);
    const base = rgb(hex);
    return toTexture(canvasFromFn(S, (x, y, i) => {
      let d1 = Infinity, d2 = Infinity, t = 1;
      for (const [px, py, tint] of pts) {
        let dx = Math.abs(x - px); dx = Math.min(dx, S - dx);
        let dy = Math.abs(y - py); dy = Math.min(dy, S - dy);
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; t = tint; } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const v = edge < 2.5 ? 0.5 : t * (0.85 + 0.2 * n[i]);
      return clamp255(base.map((c) => c * v));
    }));
  };

  // --- Tábuas de madeira ---
  T.wood = (hex, seed = 13) => {
    const grain = fractal(S, 4, 4, seed);
    const rnd = mulberry32(seed);
    const plankTint = Array.from({ length: 16 }, () => 0.8 + rnd() * 0.35);
    const base = rgb(hex);
    return toTexture(canvasFromFn(S, (x, y, i) => {
      const plank = Math.floor(x / 32);
      const gap = x % 32 < 2;
      const g = 0.85 + 0.3 * Math.sin(y * 0.15 + grain[i] * 12) * 0.25 + grain[i] * 0.2;
      const v = gap ? 0.45 : plankTint[plank % 16] * g;
      return clamp255(base.map((c) => c * v));
    }));
  };

  // --- Palha (telhado de capim) ---
  T.thatch = (seed = 17) => {
    const rnd = mulberry32(seed);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#6e5a35';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * S, y = rnd() * S;
      const len = 14 + rnd() * 22;
      const shade = 90 + rnd() * 90;
      ctx.strokeStyle = `rgb(${shade + 40},${shade + 20},${shade * 0.55})`;
      ctx.lineWidth = 1 + rnd();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 4, y + len);
      ctx.stroke();
      if (y + len > S) { ctx.beginPath(); ctx.moveTo(x, y - S); ctx.lineTo(x, y - S + len); ctx.stroke(); }
    }
    return toTexture(canvas);
  };

  // --- Telhas de barro ---
  T.tiles = (hex, seed = 19) => {
    const n = fractal(S, 8, 3, seed);
    const base = rgb(hex);
    return toTexture(canvasFromFn(S, (x, y, i) => {
      const row = Math.floor(y / 24);
      const off = row % 2 ? 16 : 0;
      const ty = (y % 24) / 24;
      const tx = ((x + off) % 32) / 32;
      const curve = 0.7 + 0.4 * Math.sin(tx * Math.PI);
      const v = (ty < 0.12 ? 0.55 : curve) * (0.85 + 0.25 * n[i]);
      return clamp255(base.map((c) => c * v));
    }));
  };

  // --- Chapa ondulada (zinco enferrujado) ---
  T.metal = (seed = 23) => {
    const n = fractal(S, 6, 4, seed);
    const rust = fractal(S, 3, 4, seed + 3);
    return toTexture(canvasFromFn(S, (x, y, i) => {
      const wave = 0.75 + 0.25 * Math.sin((x / S) * Math.PI * 2 * 16);
      const steel = [150, 150, 148].map((c) => c * wave * (0.85 + 0.2 * n[i]));
      const r = Math.max(0, rust[i] - 0.45) * 2;
      return clamp255(mix(steel, [125, 70, 40].map((c) => c * wave), Math.min(1, r)));
    }));
  };

  // --- Tecido listrado das barracas de feira ---
  T.cloth = (hexA, hexB, seed = 29) => {
    const n = fractal(S, 16, 2, seed);
    const a = rgb(hexA), b = rgb(hexB);
    return toTexture(canvasFromFn(S, (x, y, i) => {
      const c = Math.floor(x / 32) % 2 ? a : b;
      return clamp255(c.map((v) => v * (0.88 + 0.15 * n[i])));
    }));
  };

  // --- Mostrador do relógio (UV original) ---
  T.clockFace = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ede3c8';
    ctx.beginPath(); ctx.arc(128, 128, 124, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = '#3a2c18'; ctx.stroke();
    ctx.fillStyle = '#2a2016';
    ctx.font = 'bold 26px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const roman = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    roman.forEach((r, k) => {
      const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.fillText(r, 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
    });
    ctx.lineCap = 'round';
    ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + 40, 128 - 30); ctx.stroke();
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 - 10, 128 - 80); ctx.stroke();
    return toTexture(canvas, { repeat: false });
  };

  // --- Casca de árvore genérica ---
  T.bark = () => {
    const n = fractal(S, 4, 4, 31);
    return toTexture(canvasFromFn(S, (x, y, i) => {
      const v = 0.6 + 0.4 * Math.abs(Math.sin(x * 0.12 + n[i] * 6));
      return [v * 255, v * 250, v * 240];
    }));
  };

  return T;
}
