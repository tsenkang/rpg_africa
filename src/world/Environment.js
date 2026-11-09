import * as THREE from 'three';
import { BIOMES, UNDERGROUND_AMBIENCE } from '../config/biomes.js';
import { RENDER } from '../config/worldConfig.js';
import { SUN_CYCLE } from '../config/sky.js';
import { sunDirection } from './SunPath.js';

const KEYS_COLOR = ['fogColor', 'skyTop', 'skyHorizon', 'sunColor', 'hemiSky', 'hemiGround'];
const KEYS_NUM = ['fogDensity', 'sunIntensity', 'hemiIntensity', 'exposure'];

function parseAmbience(a) {
  const o = {};
  for (const k of KEYS_COLOR) o[k] = new THREE.Color(a[k]);
  for (const k of KEYS_NUM) o[k] = a[k];
  return o;
}

/**
 * Céu, sol, luz ambiente e neblina.
 * A cada quadro, mistura a ambientação dos biomas conforme os pesos na
 * posição do jogador e interpola suavemente (sem cortes ao cruzar bordas).
 */
export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.biomeAmb = BIOMES.map((b) => parseAmbience(b.ambience));
    this.undergroundAmb = parseAmbience(UNDERGROUND_AMBIENCE);
    this.state = parseAmbience(BIOMES[0].ambience);
    this.target = parseAmbience(BIOMES[0].ambience);

    // Sol dinâmico: passeia devagar pelo céu (config/sky.js → SUN_CYCLE).
    this.sunTime = SUN_CYCLE.period * 0.85; // começa no fim da tarde, como antes
    this.sunDir = sunDirection(this.sunTime, SUN_CYCLE, new THREE.Vector3());

    scene.fog = new THREE.FogExp2(this.state.fogColor.clone(), this.state.fogDensity);

    this.hemi = new THREE.HemisphereLight(this.state.hemiSky, this.state.hemiGround, 1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(this.state.sunColor, this.state.sunIntensity);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.setShadows({ shadows: true, shadowMapSize: RENDER.shadowMapSize, shadowRange: RENDER.shadowRange });
    scene.add(this.sun, this.sun.target);

    this.sky = this.createSkyDome();
    scene.add(this.sky);
  }

  /**
   * Qualidade das sombras do sol (nível gráfico, tecla G).
   * @param {{ shadows: boolean, shadowMapSize: number, shadowRange: number }} q
   * @example environment.setShadows({ shadows: true, shadowMapSize: 2048, shadowRange: 80 })
   */
  setShadows({ shadows, shadowMapSize, shadowRange }) {
    const sh = this.sun.shadow;
    this.sun.castShadow = shadows;
    this.shadowMapSize = shadowMapSize;
    this.shadowRange = shadowRange;
    if (sh.mapSize.x !== shadowMapSize) {
      sh.mapSize.set(shadowMapSize, shadowMapSize);
      sh.map?.dispose(); // recriado no próximo quadro com o tamanho novo
      sh.map = null;
    }
    const r = shadowRange;
    Object.assign(sh.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 600 });
    sh.camera.updateProjectionMatrix();
  }

  createSkyDome() {
    this.skyUniforms = {
      uTop: { value: this.state.skyTop.clone() },
      uHorizon: { value: this.state.skyHorizon.clone() },
      uSunDir: { value: this.sunDir.clone() },
      uSunColor: { value: this.state.sunColor.clone() },
      uSunStrength: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p; // raio 1000 < far; desenhado antes de tudo e sem escrever profundidade
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uSunDir, uSunColor;
        uniform float uSunStrength;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.55, h), 0.8));
          col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.2, d.y));
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(s, 900.0) * 18.0 + pow(s, 12.0) * 0.18) * uSunStrength;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    return mesh;
  }

  /**
   * @param {Float32Array} weights pesos de bioma na posição do jogador
   * @param {boolean} underground true dentro das masmorras
   */
  update(dt, focus, camera, weights, underground) {
    this.sunTime += dt;
    sunDirection(this.sunTime, SUN_CYCLE, this.sunDir);
    this.skyUniforms.uSunDir.value.copy(this.sunDir);
    const t = this.target;
    if (underground) {
      copyAmb(t, this.undergroundAmb);
    } else {
      for (const k of KEYS_COLOR) t[k].setRGB(0, 0, 0);
      for (const k of KEYS_NUM) t[k] = 0;
      for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        if (!w) continue;
        const a = this.biomeAmb[i];
        for (const k of KEYS_COLOR) {
          t[k].r += a[k].r * w; t[k].g += a[k].g * w; t[k].b += a[k].b * w;
        }
        for (const k of KEYS_NUM) t[k] += a[k] * w;
      }
    }

    const k = underground ? 1 : 1 - Math.exp(-dt * 1.2);
    const s = this.state;
    for (const key of KEYS_COLOR) s[key].lerp(t[key], k);
    for (const key of KEYS_NUM) s[key] += (t[key] - s[key]) * k;

    this.scene.fog.color.copy(s.fogColor);
    this.scene.fog.density = s.fogDensity;
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.sun.color.copy(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.renderer.toneMappingExposure = s.exposure;

    this.skyUniforms.uTop.value.copy(s.skyTop);
    this.skyUniforms.uHorizon.value.copy(s.skyHorizon);
    this.skyUniforms.uSunColor.value.copy(s.sunColor);
    this.skyUniforms.uSunStrength.value = Math.min(1, s.sunIntensity / 2);
    this.sky.position.copy(camera.position);
    this.sky.visible = !underground;

    // Sombra acompanha o jogador, alinhada à grade de texels (sem tremor).
    const texel = (this.shadowRange * 2) / this.shadowMapSize;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(this.sunDir, 300);
    this.sun.target.updateMatrixWorld();
  }
}

function copyAmb(dst, src) {
  for (const k of KEYS_COLOR) dst[k].copy(src[k]);
  for (const k of KEYS_NUM) dst[k] = src[k];
}
