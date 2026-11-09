import * as THREE from 'three';
import { RENDER } from '../config/worldConfig.js';
import { BIOMES } from '../config/biomes.js';
import { hash2, smoothstep } from './Noise.js';
import { FOLIAGE_SPRITES, PHOTO_TEXTURES, GRASS_DRYNESS } from '../config/photoAssets.js';

const SPACING = 0.85;
const CARDS = 3;

/**
 * Campo de capim em volta do jogador (raio ~60 m), feito de tufos com
 * recorte de FOTO real (verde ou seco, conforme o bioma).
 * As posições vêm de uma grade fixa no mundo (com jitter por hash), então
 * a grama não "anda" quando o jogador se move — só é recalculada nas bordas.
 * Altura, cor e densidade mudam por bioma (capim alto e dourado na savana,
 * rasteiro na taiga, quase nada no deserto…).
 */
export class Grass {
  constructor({ terrain, isGrassBlocked, timeUniform, photos }) {
    this.terrain = terrain;
    this.isBlocked = isGrassBlocked;
    this.max = RENDER.grassMaxInstances;
    this.radius = RENDER.grassRadius;
    this.center = new THREE.Vector2(Infinity, Infinity);

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.92,
      map: photos.foliage,
      alphaTest: 0.45,
      alphaToCoverage: true,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;
      shader.vertexShader = 'uniform float uTime;\nattribute vec2 uvAlt;\nattribute float aDry;\n' + shader.vertexShader.replace(
        '#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = mix(vMapUv, uvAlt, aDry);',
      ).replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float k = position.y * position.y;
        float gust = sin(uTime * 0.7 + ip.x * 0.02 + ip.z * 0.015) * 0.5 + 0.5;
        transformed.x += (sin(uTime * 2.1 + ip.x * 0.35 + ip.z * 0.2) * 0.12 + gust * 0.18) * k;
        transformed.z += cos(uTime * 1.7 + ip.z * 0.3) * 0.08 * k;`,
      );
      // Normais sempre "para cima": a grama não fica preta do lado de trás.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n normal = normalize(vNormal);',
      );
    };

    const geo = createClumpCards();
    this.dry = new THREE.InstancedBufferAttribute(new Float32Array(this.max), 1);
    this.dry.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aDry', this.dry);
    this.mesh = new THREE.InstancedMesh(geo, material, this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'grass';

    this.tips = BIOMES.map((b) => new THREE.Color(b.grass.tip));
    this.dryness = BIOMES.map((b) => GRASS_DRYNESS[b.id] ?? 0.5);
    this.w = new Float32Array(BIOMES.length);
  }

  /**
   * Raio do capim (nível gráfico, tecla G). Refaz o campo no próximo update.
   * @param {number} radius metros; a quantidade de tufos cai com o quadrado
   * @example grass.setRadius(45)
   */
  setRadius(radius) {
    if (radius === this.radius) return;
    this.radius = radius;
    this.center.set(Infinity, Infinity);
  }

  /** Recalcula as instâncias quando o jogador se afasta alguns metros. */
  update(playerPos, enabled = true) {
    this.mesh.visible = enabled;
    if (!enabled) return;
    if (Math.hypot(this.center.x - playerPos.x, this.center.y - playerPos.z) < 5) return;
    this.center.set(playerPos.x, playerPos.z);
    this.rebuild();
  }

  rebuild() {
    const { terrain, radius, w } = this;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    const cx = this.center.x, cz = this.center.y;
    const i0 = Math.floor((cx - radius) / SPACING), i1 = Math.ceil((cx + radius) / SPACING);
    const j0 = Math.floor((cz - radius) / SPACING), j1 = Math.ceil((cz + radius) / SPACING);
    let n = 0;

    for (let j = j0; j <= j1 && n < this.max; j++) {
      for (let i = i0; i <= i1 && n < this.max; i++) {
        const x = (i + hash2(i, j, 1)) * SPACING;
        const z = (j + hash2(i, j, 2)) * SPACING;
        const d = Math.hypot(x - cx, z - cz);
        if (d > radius) continue;

        terrain.weightsAt(x, z, w);
        let density = 0, height = 0, dry = 0;
        col.setRGB(0, 0, 0);
        for (let b = 0; b < w.length; b++) {
          if (!w[b]) continue;
          const g = BIOMES[b].grass;
          density += w[b] * g.density;
          height += w[b] * g.height;
          dry += w[b] * this.dryness[b];
          col.r += this.tips[b].r * w[b]; col.g += this.tips[b].g * w[b]; col.b += this.tips[b].b * w[b];
        }
        const r = hash2(i, j, 3);
        if (r > density) continue;
        const h = terrain.heightAt(x, z);
        if (h < 0.35 || h > 160) continue;
        if (terrain.slopeAt(x, z) > 1.0) continue;
        if (this.isBlocked(x, z)) continue;

        const fade = smoothstep(radius, radius * 0.75, d);
        const sc = height * (0.6 + hash2(i, j, 4) * 0.7) * (0.25 + 0.75 * fade);
        q.setFromAxisAngle(up, hash2(i, j, 5) * Math.PI * 2);
        m.compose(p.set(x, h - 0.03, z), q, s.set(0.8 + r * 0.5, sc, 0.8 + r * 0.5));
        this.mesh.setMatrixAt(n, m);
        // A foto já tem cor: o tom do bioma só puxa a matiz (brilho mantido).
        const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11 || 1;
        const v = 0.85 + hash2(i, j, 6) * 0.3;
        col.setRGB(1 + (col.r / lum - 1) * 0.35, 1 + (col.g / lum - 1) * 0.35, 1 + (col.b / lum - 1) * 0.35).multiplyScalar(v);
        this.mesh.setColorAt(n, col);
        this.dry.setX(n, hash2(i, j, 7) < dry ? 1 : 0);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dry.needsUpdate = true;
  }
}

function spriteRect(name) {
  const size = PHOTO_TEXTURES.foliage.size;
  const [x0, y0, x1, y1] = FOLIAGE_SPRITES[name].rect;
  return { u0: x0 / size, u1: x1 / size, v0: 1 - y1 / size, v1: 1 - y0 / size };
}

/**
 * Tufo de capim: 3 cartões cruzados (altura normalizada = 1). `uv` aponta
 * para o tufo verde da foto e `uvAlt` para o seco; o atributo de instância
 * `aDry` escolhe qual.
 */
function createClumpCards() {
  const green = spriteRect('grassGreen'), dry = spriteRect('grassDry');
  const positions = [], uvs = [], uvAlt = [], colors = [], normals = [];
  const w = 1.15;
  const corners = [[-0.5, 0, 0, 0], [0.5, 0, 1, 0], [0.5, 1, 1, 1], [-0.5, 0, 0, 0], [0.5, 1, 1, 1], [-0.5, 1, 0, 1]];
  for (let k = 0; k < CARDS; k++) {
    const a = (k / CARDS) * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    for (const [x, y, u, v] of corners) {
      positions.push(x * w * c, y, x * w * s);
      uvs.push(green.u0 + u * (green.u1 - green.u0), green.v0 + v * (green.v1 - green.v0));
      uvAlt.push(dry.u0 + u * (dry.u1 - dry.u0), dry.v0 + v * (dry.v1 - dry.v0));
      const shade = 0.55 + 0.45 * y;
      colors.push(shade, shade, shade);
      normals.push(0, 1, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('uvAlt', new THREE.Float32BufferAttribute(uvAlt, 2));
  return geo;
}
