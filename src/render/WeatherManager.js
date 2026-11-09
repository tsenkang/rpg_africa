import * as THREE from 'three';
import { BIOMES } from '../config/biomes.js';
import { WEATHER, PARANORMAL_FOG, LANTERN } from '../config/weather.js';
import {
  createParticleState, seedParticles, stepParticles, cycleIntensity,
  nearestCreatureDistance, paranormalTarget, lightningEnvelope,
} from '../systems/WeatherSim.js';

const SHAPES = { dot: 0, flake: 1, leaf: 2, streakV: 3, streakH: 4 };
const { lerp } = THREE.MathUtils;

/**
 * Clima por bioma + névoa de tensão paranormal.
 *
 * Roda DEPOIS do `Environment.update()` em cada quadro: o Environment
 * calcula a luz/neblina "de tempo bom" do bioma e o WeatherManager aplica
 * por cima o evento climático (neve, areia, chuva, cinzas…) e a névoa
 * paranormal. Como o Environment reescreve tudo a cada quadro, os ajustes
 * não se acumulam.
 *
 * Partículas: uma `THREE.Points` por camada de cada bioma, presa numa caixa
 * que acompanha a câmera. Nada é criado durante o jogo — a partícula que
 * chega no chão volta para o céu (ver `stepParticles`). Camadas de biomas
 * longe do jogador (peso ≈ 0) nem são atualizadas nem desenhadas.
 *
 * @example
 * const weather = new WeatherManager({ scene, environment, renderer, rng: Math.random });
 * weather.creatures.push(fantasma.root); // qualquer coisa com .position
 * // no loop, depois de environment.update(...):
 * weather.update(dt, { time, camera, player: pos, weights, underground: false });
 * postfx.render(scene, camera, weather.bloomStrength);
 */
export class WeatherManager {
  /**
   * @param {object} o
   * @param {THREE.Scene} o.scene
   * @param {import('../world/Environment.js').Environment} o.environment
   * @param {THREE.WebGLRenderer} o.renderer
   * @param {() => number} [o.rng] sorteio 0..1 (injetável)
   * @param {{ thunder(delay:number, strength:number): void }} [o.audio] trovões (opcional)
   */
  constructor({ scene, environment, renderer, rng = Math.random, audio = null }) {
    this.scene = scene;
    this.env = environment;
    this.renderer = renderer;
    this.rng = rng;
    this.audio = audio;

    /**
     * Criaturas paranormais. Coloque aqui qualquer objeto com `.position`
     * (Object3D) ou `{x, z}`. `active: false` ou `alive: false` ignora.
     * @type {Array<object>}
     */
    this.creatures = [];
    /** Intensidade atual da névoa paranormal (0..1, já suavizada). */
    this.paranormal = 0;
    /** Força do bloom pedida pelo clima (o PostFX decide se usa). */
    this.bloomStrength = 0;
    this.overcast = 0;
    /** Força o clima de um bioma (id) ou null = pelo lugar. Útil para testar. */
    this.override = null;

    this.density = 1;
    this.weights = new Float32Array(BIOMES.length);
    this.phases = BIOMES.map((_, i) => i * 0.37);
    this.biomes = BIOMES.map((b) => WEATHER[b.id] ?? null);
    this.group = new THREE.Group();
    this.group.name = 'weather';
    scene.add(this.group);

    this._scale = { value: 1 };
    this._time = { value: 0 };
    this._size = new THREE.Vector2();
    this.layers = [];
    this.biomes.forEach((cfg, bi) => cfg?.particles.forEach((spec) => this.layers.push(this.createLayer(spec, bi))));

    // Cores pré-criadas (zero alocação no update).
    this.looks = this.biomes.map((cfg) => cfg && {
      ...cfg.look,
      fogColor: new THREE.Color(cfg.look.fogColor),
      sunTint: new THREE.Color(cfg.look.sunTint),
    });
    this.paraColor = new THREE.Color(PARANORMAL_FOG.fogColor);
    this._fog = new THREE.Color();
    this._sun = new THREE.Color();
    this._tmp = new THREE.Color();

    // Lanterna: sempre na cena (intensidade 0 quando apagada) para não
    // recompilar os shaders ao acender.
    this.lantern = new THREE.PointLight(LANTERN.color, 0, LANTERN.distance, LANTERN.decay);
    scene.add(this.lantern);

    // Relâmpagos
    this.flashT = Infinity;
    this.flashPower = 0;
    this.nextStrike = 4;
  }

  /** Camada de partículas: geometria fixa (pool) + material de pontos. */
  createLayer(spec, biomeIndex) {
    const state = createParticleState(spec, spec.count, this.rng);
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(state.pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aSeed', new THREE.BufferAttribute(state.seed, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uColor: { value: new THREE.Color(spec.color) },
        uOpacity: { value: 0 },
        uSize: { value: spec.size },
        uShape: { value: SHAPES[spec.shape] ?? 0 },
      }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    material.uniforms.uScale = this._scale; // compartilhados entre camadas
    material.uniforms.uTime = this._time;
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false; // a caixa sempre envolve a câmera
    points.visible = false;
    points.renderOrder = 2;
    points.name = `weather-${BIOMES[biomeIndex].id}-${spec.shape}`;
    this.group.add(points);
    return { spec, biome: biomeIndex, state, points, posAttr, opacity: spec.opacity };
  }

  /**
   * Nível gráfico: multiplica a quantidade de partículas.
   * @param {{ weatherDensity: number }} preset item de GRAPHICS_PRESETS
   */
  setQuality({ weatherDensity }) {
    this.density = weatherDensity;
    for (const l of this.layers) l.state.active = Math.max(1, Math.floor(l.state.capacity * weatherDensity));
  }

  /**
   * Chamar uma vez por quadro, depois de `environment.update()`.
   * @param {number} dt s
   * @param {object} o
   * @param {number} o.time tempo do jogo (s)
   * @param {THREE.Camera} o.camera centro da caixa das partículas
   * @param {THREE.Vector3} o.player posição do jogador (névoa paranormal, lanterna)
   * @param {Float32Array} o.weights pesos de bioma na posição do jogador
   * @param {boolean} o.underground masmorras: sem clima, só névoa paranormal
   */
  update(dt, { time, camera, player, weights, underground }) {
    this._time.value = time;
    this.renderer.getDrawingBufferSize(this._size);
    this._scale.value = this._size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

    // 1) Peso de cada clima: bioma × ciclo do evento, suavizado no tempo.
    const k = 1 - Math.exp(-dt * 0.8);
    const forced = this.override ? BIOMES.findIndex((b) => b.id === this.override) : -1;
    for (let i = 0; i < this.weights.length; i++) {
      const place = forced >= 0 ? (i === forced ? 1 : 0) : weights[i];
      const target = underground || !this.biomes[i] ? 0 : place * cycleIntensity(time, this.biomes[i].cycle, this.phases[i]);
      this.weights[i] = lerp(this.weights[i], target, k);
    }

    this.updateParticles(dt, time, camera.position);
    this.applyLook(dt, time, player, underground);
  }

  updateParticles(dt, time, center) {
    for (const l of this.layers) {
      const w = this.weights[l.biome];
      if (w < 0.01) { l.points.visible = false; continue; }
      const wind = this.biomes[l.biome].wind;
      const gust = 1 + wind.gust * (0.5 + 0.5 * Math.sin(time * Math.PI * 2 / wind.gustPeriod));
      if (!l.state.seeded) seedParticles(l.state, center, this.rng);
      stepParticles(l.state, dt, center, wind.x * gust, wind.z * gust, time, this.rng);
      // Na fronteira do bioma: menos partículas E mais transparentes.
      l.points.geometry.setDrawRange(0, Math.ceil(l.state.active * Math.min(1, w * 1.3)));
      l.points.material.uniforms.uOpacity.value = l.opacity * Math.sqrt(w);
      l.posAttr.addUpdateRange(0, l.state.active * 3);
      l.posAttr.needsUpdate = true;
      l.points.visible = true;
    }
  }

  /** Neblina, sol, luz ambiente, céu, relâmpagos e lanterna. */
  applyLook(dt, time, player, underground) {
    const env = this.env, fog = this.scene.fog;
    const out = this._fog.copy(fog.color);
    const sun = this._sun.copy(env.sun.color);
    let density = fog.density;
    let sum = 0, colorMix = 0, sunMix = 0;
    let sunMul = 1, hemiMul = 1, expMul = 1, bloom = 0, lantern = 0, skyToFog = 0, lightning = 0;
    let dSum = 0;

    // 2) Mistura ponderada dos looks dos climas ativos.
    for (let i = 0; i < this.weights.length; i++) {
      const w = this.weights[i], look = this.looks[i];
      if (w < 0.001 || !look) continue;
      sum += w;
      dSum += w * look.fogDensity;
      colorMix += w * look.fogColorMix;
      sunMix += w * look.sunTintMix;
      sunMul += w * (look.sunMul - 1);
      hemiMul += w * (look.hemiMul - 1);
      expMul += w * (look.exposureMul - 1);
      bloom += w * look.bloom;
      lantern += w * look.lantern;
      skyToFog += w * look.skyToFog;
      if (this.biomes[i].lightning) lightning = Math.max(lightning, w);
    }
    if (sum > 0) {
      density = lerp(density, dSum / sum, Math.min(1, sum));
      // Cor média dos climas, puxada pela soma dos "mix".
      this._tmp.setRGB(0, 0, 0);
      for (let i = 0; i < this.weights.length; i++) {
        const w = this.weights[i], look = this.looks[i];
        if (w < 0.001 || !look) continue;
        this._tmp.r += look.fogColor.r * w * look.fogColorMix;
        this._tmp.g += look.fogColor.g * w * look.fogColorMix;
        this._tmp.b += look.fogColor.b * w * look.fogColorMix;
      }
      if (colorMix > 0) out.lerp(this._tmp.multiplyScalar(1 / colorMix), Math.min(1, colorMix));
      this._tmp.setRGB(0, 0, 0);
      for (let i = 0; i < this.weights.length; i++) {
        const w = this.weights[i], look = this.looks[i];
        if (w < 0.001 || !look) continue;
        this._tmp.r += look.sunTint.r * w * look.sunTintMix;
        this._tmp.g += look.sunTint.g * w * look.sunTintMix;
        this._tmp.b += look.sunTint.b * w * look.sunTintMix;
      }
      if (sunMix > 0) sun.lerp(this._tmp.multiplyScalar(1 / sunMix), Math.min(1, sunMix));
    }

    // 3) Névoa paranormal: alvo pela distância, lerp lento = suspense.
    const target = paranormalTarget(nearestCreatureDistance(player, this.creatures), PARANORMAL_FOG);
    this.paranormal = lerp(this.paranormal, target, 1 - Math.exp(-dt * PARANORMAL_FOG.rate));
    const p = this.paranormal;
    if (p > 0.001) {
      density = lerp(density, PARANORMAL_FOG.fogDensity, p);
      out.lerp(this.paraColor, p);
      sunMul *= lerp(1, PARANORMAL_FOG.sunMul, p);
      hemiMul *= lerp(1, 0.6, p);
      skyToFog = Math.max(skyToFog, p);
    }

    // 4) Relâmpagos (só onde o clima tem; força pelo peso do bioma).
    let flash = 0;
    if (lightning > 0.2 && !underground) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) this.strike(lightning);
      this.flashT += dt;
      flash = lightningEnvelope(this.flashT) * this.flashPower * lightning;
    }

    // 5) Aplica. (O Environment reescreve tudo no próximo quadro.)
    fog.density = density;
    fog.color.copy(out);
    env.sun.color.copy(sun);
    env.sun.intensity *= sunMul;
    env.hemi.intensity = env.hemi.intensity * hemiMul + flash;
    this.renderer.toneMappingExposure *= expMul * (1 + flash * 0.25);
    const sky = env.skyUniforms;
    if (!underground) {
      sky.uTop.value.lerp(out, Math.min(1, skyToFog));
      sky.uHorizon.value.lerp(out, Math.min(1, skyToFog * 1.1));
      sky.uSunStrength.value *= 1 - Math.min(1, skyToFog) * 0.9;
      if (flash > 0) { sky.uTop.value.addScalar(flash * 0.15); sky.uHorizon.value.addScalar(flash * 0.2); }
    }
    this.bloomStrength = underground ? 0 : bloom;
    /** 0..1: quanto o céu está fechado (nuvens escurecem). */
    this.overcast = Math.min(1, skyToFog);

    // 6) Lanterna do jogador nos climas escuros.
    this.lantern.position.set(player.x, player.y + LANTERN.height, player.z);
    this.lantern.intensity = LANTERN.intensity * Math.min(1, lantern + p * 0.6);
  }

  /** Dispara um relâmpago e agenda o trovão. */
  strike(strength) {
    const cfg = this.biomes.find((b) => b?.lightning)?.lightning;
    if (!cfg) return;
    this.flashT = 0;
    this.flashPower = cfg.flash * (0.6 + this.rng() * 0.4);
    this.nextStrike = cfg.every[0] + this.rng() * (cfg.every[1] - cfg.every[0]);
    const delay = cfg.thunderDelay[0] + this.rng() * (cfg.thunderDelay[1] - cfg.thunderDelay[0]);
    this.audio?.thunder(delay, strength * (1 - delay / (cfg.thunderDelay[1] + 1)));
  }
}

const VERT = /* glsl */ `
  uniform float uSize;
  uniform float uScale;
  attribute float aSeed;
  varying float vSeed;
  #include <fog_pars_vertex>
  void main() {
    vSeed = aSeed;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(uSize * uScale * (0.7 + 0.6 * aSeed) / -mvPosition.z, 0.0, 72.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform int uShape;
  varying float vSeed;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float a;
    if (uShape == 0) {          // poeira / cinza / brasa
      a = 1.0 - smoothstep(0.35, 1.0, length(p));
    } else if (uShape == 1) {   // floco de neve
      a = 1.0 - smoothstep(0.15, 0.95, length(p));
    } else if (uShape == 2) {   // folha seca girando
      float ang = vSeed * 6.2831 + uTime * (1.5 + 3.0 * vSeed);
      vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;
      a = 1.0 - smoothstep(0.75, 1.0, length(vec2(q.x * 2.4, q.y)));
    } else if (uShape == 3) {   // gota de chuva (risco vertical)
      a = (1.0 - smoothstep(0.05, 0.16, abs(p.x))) * (1.0 - smoothstep(0.45, 1.0, abs(p.y)));
    } else {                    // grão de areia (risco horizontal)
      a = (1.0 - smoothstep(0.08, 0.24, abs(p.y))) * (1.0 - smoothstep(0.3, 1.0, abs(p.x)));
    }
    a *= uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * (0.8 + 0.4 * vSeed), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
