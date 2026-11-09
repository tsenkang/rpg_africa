import { yieldToBrowser } from '../core/yieldToBrowser.js';
import * as THREE from 'three';
import { WORLD } from '../config/worldConfig.js';
import { BIOMES } from '../config/biomes.js';
import { smoothstep, clamp } from './Noise.js';
import { GROUND_PHOTO, PHOTO_TEXTURES } from '../config/photoAssets.js';

const NB = BIOMES.length;

const ROCK_COLORS = {
  savana: 0x8e7f6a, taiga: 0x77756f, deserto: 0xb08a5c, kalahari: 0x8a4a2a,
  tropical: 0x5d5a4e, equatorial: 0x56554a, preta: 0x2f3233,
};
const SHORE_COLORS = {
  savana: 0xbda77a, taiga: 0x6f6a5a, deserto: 0xd8bb88, kalahari: 0xc08a5a,
  tropical: 0x5f5236, equatorial: 0x4f4430, preta: 0x2f2c26,
};

/**
 * Terreno 3D do continente.
 * Guarda a grade de alturas e de pesos de bioma (para consultas rápidas
 * de física, vegetação e ambientação) e constrói a malha com cores por
 * vértice + textura de detalhe em escala real.
 */
export class Terrain {
  constructor(generator) {
    this.gen = generator;
    this.nx = WORLD.segmentsX;
    this.nz = WORLD.segmentsZ;
    this.dx = WORLD.width / this.nx;
    this.dz = WORLD.depth / this.nz;
    this.cols = this.nx + 1;
    this.rows = this.nz + 1;
    this.heights = new Float32Array(this.cols * this.rows);
    this.weights = new Float32Array(this.cols * this.rows * NB);
    this.mesh = null;
  }

  /** Calcula alturas e biomas. Cede o thread a cada bloco para a tela de loading. */
  async generate(onProgress) {
    const w = new Float32Array(NB);
    const W2 = WORLD.width / 2, D2 = WORLD.depth / 2;
    for (let j = 0; j < this.rows; j++) {
      const z = -D2 + j * this.dz;
      for (let i = 0; i < this.cols; i++) {
        const x = -W2 + i * this.dx;
        const idx = j * this.cols + i;
        this.gen.biomeWeights(x, z, w);
        this.weights.set(w, idx * NB);
        this.heights[idx] = this.gen.height(x, z, w);
      }
      if (j % 12 === 0) {
        onProgress?.(j / this.rows);
        await yieldToBrowser();
      }
    }
  }

  /**
   * Gera a malha. `paints` = formas pintadas no chão (ruas, praças, campos):
   * { x, z, radius, shapes: [{ type:'segment'|'disc', ..., color, strength }] }
   */
  buildMesh(textures, paints = [], photos = null) {
    const { cols, rows } = this;
    const count = cols * rows;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const detail = new Float32Array(count);
    const photoStrength = BIOMES.map((b) => GROUND_PHOTO.strength[b.id] ?? 1);
    const uvs = new Float32Array(count * 2);
    const W2 = WORLD.width / 2, D2 = WORLD.depth / 2;
    const n = this.gen.noise;

    const pal = BIOMES.map((b) => ({
      base: new THREE.Color(b.ground.base),
      alt: new THREE.Color(b.ground.alt),
      dry: new THREE.Color(b.ground.dry),
      rock: new THREE.Color(ROCK_COLORS[b.id]),
      shore: new THREE.Color(SHORE_COLORS[b.id]),
    }));
    const snow = new THREE.Color(0xf1f4f7);
    const underwater = new THREE.Color(0x3b4536);
    const c = new THREE.Color();
    const tmp = new THREE.Color();
    const shore = new THREE.Color();
    const rock = new THREE.Color();

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        const x = -W2 + i * this.dx;
        const z = -D2 + j * this.dz;
        const h = this.heights[idx];
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = h;
        positions[idx * 3 + 2] = z;
        const tile = photos ? GROUND_PHOTO.tileMeters : 7;
        uvs[idx * 2] = x / tile;
        uvs[idx * 2 + 1] = z / tile;

        const macro = n.fbm(x / 110, z / 110, 3) * 0.5 + 0.5;
        const patch = n.fbm(x / 28 + 50, z / 28, 2) * 0.5 + 0.5;
        c.setRGB(0, 0, 0);
        shore.setRGB(0, 0, 0);
        rock.setRGB(0, 0, 0);
        const wo = idx * NB;
        let photoAmt = 0;
        for (let b = 0; b < NB; b++) {
          const wb = this.weights[wo + b];
          if (wb === 0) continue;
          photoAmt += photoStrength[b] * wb;
          const p = pal[b];
          tmp.copy(p.base).lerp(p.alt, macro).lerp(p.dry, smoothstep(0.55, 0.85, patch) * 0.6);
          c.r += tmp.r * wb; c.g += tmp.g * wb; c.b += tmp.b * wb;
          shore.r += p.shore.r * wb; shore.g += p.shore.g * wb; shore.b += p.shore.b * wb;
          rock.r += p.rock.r * wb; rock.g += p.rock.g * wb; rock.b += p.rock.b * wb;
        }

        const slope = this.slopeAtIndex(i, j);
        c.lerp(rock, smoothstep(0.5, 0.95, slope));
        c.lerp(shore, smoothstep(2.2, 0.8, h) * (h > -1 ? 1 : 0.6));
        if (h < 0) c.lerp(underwater, smoothstep(0, -6, h) * 0.85);
        const snowAmt = smoothstep(135, 175, h + 18 * macro) * (1 - smoothstep(0.9, 1.3, slope) * 0.7);
        if (snowAmt > 0) c.lerp(snow, snowAmt);
        photoAmt *= 1 - snowAmt * 0.85;

        for (const p of paints) {
          const ddx = x - p.x, ddz = z - p.z;
          if (ddx * ddx + ddz * ddz > p.radius * p.radius) continue;
          for (const s of p.shapes) {
            const a = paintAmount(s, x, z);
            if (a > 0) {
              c.lerp(s.colorObj ??= new THREE.Color(s.color), a * (s.strength ?? 1) * (0.85 + 0.15 * patch));
              photoAmt = Math.max(photoAmt, a * 0.8); // ruas de terra: cascalho e folhas da foto
            }
          }
        }

        colors[idx * 3] = c.r;
        colors[idx * 3 + 1] = c.g;
        colors[idx * 3 + 2] = c.b;
        detail[idx] = photoAmt;
      }
    }

    const indices = new Uint32Array(this.nx * this.nz * 6);
    let k = 0;
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const a = j * cols + i, b = a + 1, d = a + cols, e = d + 1;
        indices[k++] = a; indices[k++] = d; indices[k++] = b;
        indices[k++] = b; indices[k++] = d; indices[k++] = e;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('detail', new THREE.BufferAttribute(detail, 1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const material = photos ? createPhotoGroundMaterial(photos) : new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: textures.groundDetail,
      normalMap: textures.groundNormal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.96,
      metalness: 0,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    return this.mesh;
  }

  slopeAtIndex(i, j) {
    const h = this.heights, c = this.cols;
    const i0 = Math.max(0, i - 1), i1 = Math.min(this.nx, i + 1);
    const j0 = Math.max(0, j - 1), j1 = Math.min(this.nz, j + 1);
    const sx = (h[j * c + i1] - h[j * c + i0]) / ((i1 - i0) * this.dx);
    const sz = (h[j1 * c + i] - h[j0 * c + i]) / ((j1 - j0) * this.dz);
    return Math.sqrt(sx * sx + sz * sz);
  }

  /** Altura interpolada em qualquer ponto (m). */
  heightAt(x, z) {
    const gx = clamp((x + WORLD.width / 2) / this.dx, 0, this.nx - 0.0001);
    const gz = clamp((z + WORLD.depth / 2) / this.dz, 0, this.nz - 0.0001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const tx = gx - i, tz = gz - j;
    const c = this.cols, h = this.heights;
    const a = h[j * c + i], b = h[j * c + i + 1];
    const d = h[(j + 1) * c + i], e = h[(j + 1) * c + i + 1];
    // Mesma triangulação da malha (diagonal b-d) → o pé não afunda.
    if (tx + tz <= 1) return a + (b - a) * tx + (d - a) * tz;
    return e + (d - e) * (1 - tx) + (b - e) * (1 - tz);
  }

  /** Inclinação (tangente) aproximada no ponto. */
  slopeAt(x, z) {
    const e = 2;
    const sx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const sz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.sqrt(sx * sx + sz * sz);
  }

  /** Copia os pesos de bioma do vértice mais próximo para `out`. */
  weightsAt(x, z, out) {
    const i = Math.round(clamp((x + WORLD.width / 2) / this.dx, 0, this.nx));
    const j = Math.round(clamp((z + WORLD.depth / 2) / this.dz, 0, this.nz));
    const o = (j * this.cols + i) * NB;
    for (let b = 0; b < NB; b++) out[b] = this.weights[o + b];
    return out;
  }

  dominantBiome(x, z) {
    const w = this.weightsAt(x, z, new Float32Array(NB));
    let best = 0;
    for (let b = 1; b < NB; b++) if (w[b] > w[best]) best = b;
    return best;
  }
}

/** Caixa (x/z) fora da qual a forma não pinta nada — calculada uma vez. */
function paintBounds(s) {
  if (s.type === 'disc') return [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r];
  if (s.type === 'segment') {
    const m = s.width / 2 + 1.5;
    return [Math.min(s.ax, s.bx) - m, Math.min(s.az, s.bz) - m, Math.max(s.ax, s.bx) + m, Math.max(s.az, s.bz) + m];
  }
  if (s.type === 'rect') {
    const m = Math.hypot(s.hw, s.hd) + 1.5;
    return [s.x - m, s.z - m, s.x + m, s.z + m];
  }
  return [-Infinity, -Infinity, Infinity, Infinity];
}

function paintAmount(s, x, z) {
  const b = (s.bounds ??= paintBounds(s));
  if (x < b[0] || z < b[1] || x > b[2] || z > b[3]) return 0;
  if (s.type === 'disc') {
    const d = Math.hypot(x - s.x, z - s.z);
    return smoothstep(s.r, s.r - (s.soft ?? 3), d);
  }
  if (s.type === 'segment') {
    const abx = s.bx - s.ax, abz = s.bz - s.az;
    const t = clamp(((x - s.ax) * abx + (z - s.az) * abz) / (abx * abx + abz * abz), 0, 1);
    const d = Math.hypot(s.ax + abx * t - x, s.az + abz * t - z);
    return smoothstep(s.width / 2 + 1.5, s.width / 2 - 1, d);
  }
  if (s.type === 'rect') {
    // Mesma convenção de CollisionWorld/Builders (rotação Y do Three.js).
    const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
    const lx = (x - s.x) * cos - (z - s.z) * sin;
    const lz = (x - s.x) * sin + (z - s.z) * cos;
    const ex = Math.abs(lx) - s.hw, ez = Math.abs(lz) - s.hd;
    return smoothstep(1.5, -1, Math.max(ex, ez));
  }
  return 0;
}

/**
 * Chão fotográfico: a foto vira "detalhe" (dividida pela cor média) sobre a
 * cor do bioma. Duas amostras em escalas e ângulos diferentes, misturadas
 * por um padrão lento, escondem a repetição do ladrilho.
 */
function createPhotoGroundMaterial(photos) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: photos.ground,
    normalMap: photos.groundNormal,
    normalScale: new THREE.Vector2(GROUND_PHOTO.normalScale, GROUND_PHOTO.normalScale),
    roughness: 0.94,
    metalness: 0,
  });
  const mean = PHOTO_TEXTURES.ground.mean;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundMean = { value: new THREE.Vector3(...mean) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float detail;\nvarying float vDetail;\nvarying vec3 vWorldXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetail = detail;\nvWorldXZ = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGroundMean;\nvarying float vDetail;\nvarying vec3 vWorldXZ;')
      .replace('#include <map_fragment>', /* glsl */ `
        vec2 uvA = vMapUv;
        vec2 uvB = mat2(0.81, -0.59, 0.59, 0.81) * uvA * 0.43 + vec2(0.37, 0.71);
        float blendAB = smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(vWorldXZ.x * 0.031 + sin(vWorldXZ.z * 0.027) * 2.3));
        vec3 photo = mix(texture2D(map, uvA).rgb, texture2D(map, uvB).rgb, blendAB);
        vec3 detailCol = photo / uGroundMean;
        // Longe, a foto vira só uma leve variação (sem padrão repetido).
        float far = smoothstep(60.0, 260.0, length(vViewPosition));
        detailCol = mix(detailCol, mix(vec3(1.0), detailCol, 0.35), far);
        diffuseColor.rgb *= mix(vec3(1.0), detailCol, vDetail);
      `);
  };
  return material;
}
