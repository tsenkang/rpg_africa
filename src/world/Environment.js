import * as THREE from 'three';
import { BIOMES, UNDERGROUND_AMBIENCE } from '../config/biomes.js';
import { RENDER } from '../config/worldConfig.js';
import { DAY_NIGHT } from '../config/sky.js';
import { celestial, horizonFade } from './SunPath.js';
import { LIGHTING } from '../config/lighting.js';
import { kelvinToRGB, sunKelvin } from '../systems/lighting/ColorTemperature.js';
import { EnvironmentLighting } from '../render/lighting/EnvironmentLighting.js';

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

    // Sol e lua seguem o relógio do jogo (setHour). `sunDir` = de onde vem a
    // luz direcional agora (sol de dia, lua à noite).
    this.hour = 15;
    this.sunDir = new THREE.Vector3();
    this.sunPos = new THREE.Vector3();
    this.moonPos = new THREE.Vector3();
    /** 0 = dia, 1 = noite (com o crepúsculo no meio). */
    this.night = 0;
    this.night_ = {
      moon: new THREE.Color(DAY_NIGHT.night.moonColor), top: new THREE.Color(DAY_NIGHT.night.skyTop),
      horizon: new THREE.Color(DAY_NIGHT.night.skyHorizon), fog: new THREE.Color(DAY_NIGHT.night.fogColor),
      sunset: new THREE.Color(DAY_NIGHT.sunsetTint.color),
    };
    this.updateCelestial();

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
    // L1: luz por imagem do próprio céu (reflexos e luz ambiente PBR) + temperatura de cor
    this.ibl = new EnvironmentLighting(renderer, scene, this.sky.material);
    this._kColor = new THREE.Color();
    this.kelvin = 6000;
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

  /**
   * Hora do dia (do GameClock): move sol e lua.
   * @param {number} hour 0..24
   */
  setHour(hour) {
    this.hour = hour;
  }

  /** Calcula sol/lua, quem ilumina agora e o quanto é noite. */
  updateCelestial() {
    const { sunElevation, moonElevation } = celestial(this.hour, DAY_NIGHT, this.sunPos, this.moonPos);
    this.sunElevation = sunElevation;
    this.night = 1 - horizonFade(sunElevation + DAY_NIGHT.twilight * 0.5, DAY_NIGHT.twilight);
    const sunUp = sunElevation > 0;
    this.sunDir.copy(sunUp ? this.sunPos : this.moonPos);
    // Luz no horizonte é zero dos dois lados: a troca sol↔lua não "pula".
    this.lightFade = horizonFade(sunUp ? sunElevation : moonElevation, DAY_NIGHT.twilight);
    this.isMoon = !sunUp;
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
    this.updateCelestial();
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

    // Dia/noite por cima da ambientação do bioma (no subsolo não há céu).
    const N = DAY_NIGHT.night, n = underground ? 0 : this.night, nn = this.night_;
    this.scene.fog.color.copy(s.fogColor).lerp(nn.fog, n * N.fogMix);
    this.scene.fog.density = s.fogDensity;
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    // com IBL o céu já ilumina por imagem: a hemisférica fica só como complemento
    const iblOn = LIGHTING.ibl.enabled && !underground;
    this.hemi.intensity = s.hemiIntensity * (1 + (N.hemiMul - 1) * n) * (iblOn ? LIGHTING.ibl.hemiKeep : 1);
    // Temperatura de cor (K) pela altura do sol: dourado no horizonte → neutro ao meio-dia;
    // lua azulada. O tom do bioma entra por cima (`LIGHTING.kelvin.mix`).
    const KC = LIGHTING.kelvin;
    this.kelvin = sunKelvin(this.sunElevation, this.isMoon, KC);
    const kc = kelvinToRGB(this.kelvin);
    this._kColor.setRGB(kc.r, kc.g, kc.b, THREE.SRGBColorSpace);
    if (underground) {
      this.sun.color.copy(s.sunColor);
      this.sun.intensity = s.sunIntensity;
    } else if (this.isMoon) {
      this.sun.color.copy(nn.moon).lerp(this._kColor, KC.mix * 0.5);
      this.sun.intensity = s.sunIntensity * N.moonMul * this.lightFade;
    } else {
      this.sun.color.copy(s.sunColor).lerp(this._kColor, KC.mix);
      this.sun.intensity = s.sunIntensity * this.lightFade;
    }
    this.renderer.toneMappingExposure = s.exposure * (1 + (N.exposureMul - 1) * n);

    this.skyUniforms.uTop.value.copy(s.skyTop).lerp(nn.top, n * N.skyMix);
    this.skyUniforms.uHorizon.value.copy(s.skyHorizon).lerp(nn.horizon, n * N.skyMix);
    if (!this.isMoon) this.skyUniforms.uHorizon.value.lerp(nn.sunset, (1 - Math.min(1, Math.max(0, this.sunElevation / 0.25))) * 0.35 * (1 - n));
    this.skyUniforms.uSunColor.value.copy(this.sun.color);
    this.skyUniforms.uSunStrength.value = this.isMoon ? 0.35 : Math.min(1, s.sunIntensity / 2) * this.lightFade;
    this.sky.position.copy(camera.position);
    this.sky.visible = !underground;
    this.ibl.update(dt, this, underground);

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
