import * as THREE from 'three';
import { BIOMES } from '../config/biomes.js';
import { WEATHER, WEATHER_CYCLE, PARANORMAL_FOG, LANTERN, VILLAGE_SHELTER } from '../config/weather.js';
import {
  createParticleState, seedParticles, stepParticles, stepSplashes,
  nearestCreatureDistance, paranormalTarget, lightningEnvelope,
} from '../systems/WeatherSim.js';
import { WeatherScheduler } from '../systems/WeatherClock.js';
import { mulberry32 } from '../world/Noise.js';

const SHAPES = { dot: 0, flake: 1, leaf: 2, streak: 3, puff: 4, splash: 5 };
const OVERLAYS = ['sand', 'frost', 'rain', 'heat', 'ash'];
const { lerp, smoothstep } = THREE.MathUtils;

/**
 * Clima dinâmico por bioma + névoa paranormal.
 *
 * ORDEM NO LOOP (Game.update):
 *   gameClock.update(dt)
 *   environment.setHour(gameClock.hour); environment.update(…)   // tempo bom + dia/noite
 *   weather.update(dt, { …, hourIndex: gameClock.hourIndex })      // clima por cima
 *   debuffs ← weather.climates                                      // efeitos no jogador
 *   postfx.render(scene, camera, weather.bloomStrength)
 *
 * CLIMA ALEATÓRIO: o WeatherScheduler sorteia a cada hora do jogo o estado de
 * cada bioma (limpo / nublado / tempestade). A intensidade vai até o novo
 * estado numa rampa de 5–10 s — névoa, partículas, vento e luz acompanham.
 * Intensidade efetiva no jogador = peso do bioma × nível sorteado × abrigo.
 *
 * PARTÍCULAS: uma THREE.Points por camada, presa numa caixa que segue a
 * câmera; a partícula que sai da caixa (chão) volta pelo outro lado (céu) —
 * nada é criado durante o jogo. Cada partícula tem tamanho, opacidade e
 * rotação próprios; riscos (chuva/areia) se alinham à direção real do
 * movimento na tela. Camadas com `minLevel` (paredes de poeira/neve) só
 * aparecem na tempestade.
 *
 * @example
 * const weather = new WeatherManager({ scene, environment, renderer, groundAt });
 * weather.creatures.push(fantasma.root);
 * weather.update(dt, { time, camera, player: pos, weights, underground: false, shelter, hourIndex });
 */
export class WeatherManager {
  /**
   * @param {object} o
   * @param {THREE.Scene} o.scene
   * @param {import('../world/Environment.js').Environment} o.environment
   * @param {THREE.WebGLRenderer} o.renderer
   * @param {() => number} [o.rng] sorteio 0..1 das partículas (injetável)
   * @param {{ thunder(delay:number, strength:number): void }} [o.audio] trovões (opcional)
   * @param {(x:number, z:number) => number} [o.groundAt] chão (respingos)
   */
  constructor({ scene, environment, renderer, rng = Math.random, audio = null, groundAt = () => 0 }) {
    this.scene = scene;
    this.env = environment;
    this.renderer = renderer;
    this.rng = rng;
    this.audio = audio;
    this.groundAt = groundAt;

    /**
     * Criaturas paranormais. Coloque aqui qualquer objeto com `.position`
     * (Object3D) ou `{x, z}` (+ `reach` opcional). `active/alive: false` ignora.
     */
    this.creatures = [];
    this.paranormal = 0;
    this.bloomStrength = 0;
    this.overcast = 0;
    /** Vinhetas de tela (0..1) — a UI aplica como opacidade de overlays CSS. */
    this.overlays = Object.fromEntries(OVERLAYS.map((k) => [k, 0]));
    this.flash = 0;
    /** Clima no jogador para os debuffs: [{ debuff, intensity }] por bioma. */
    this.climates = BIOMES.map((b) => ({ debuff: WEATHER[b.id]?.debuff ?? null, intensity: 0 }));
    /** Para o HUD: nome do estado do clima dominante e a intensidade. */
    this.status = { name: '', state: 'limpo', level: 0 };

    this.density = 1;
    this.biomes = BIOMES.map((b) => WEATHER[b.id] ?? null);
    this.scheduler = new WeatherScheduler(this.biomes, WEATHER_CYCLE, mulberry32(WEATHER_CYCLE.seed));
    this.place = new Float32Array(BIOMES.length); // peso do bioma no jogador (suavizado)
    this.eff = new Float32Array(BIOMES.length); // place × nível × abrigo
    this.group = new THREE.Group();
    this.group.name = 'weather';
    scene.add(this.group);

    this._scale = { value: 1 };
    this._time = { value: 0 };
    this._size = new THREE.Vector2();
    this._v = new THREE.Vector3();
    this.layers = [];
    this.biomes.forEach((cfg, bi) => cfg?.particles.forEach((spec) => this.layers.push(this.createLayer(spec, bi))));
    this.splashes = this.biomes.map((cfg, bi) => (cfg?.splashes ? this.createSplashes(cfg.splashes, bi) : null)).filter(Boolean);

    this.looks = this.biomes.map((cfg) => cfg && {
      ...cfg.look, fogColor: new THREE.Color(cfg.look.fogColor), sunTint: new THREE.Color(cfg.look.sunTint),
    });
    this.paraColor = new THREE.Color(PARANORMAL_FOG.fogColor);
    this.flashColor = new THREE.Color(0xdfe8ff);
    this._fog = new THREE.Color();
    this._sun = new THREE.Color();
    this._tmp = new THREE.Color();

    // Lanterna: sempre na cena (intensidade 0 = apagada) — sem recompilar shaders.
    this.lantern = new THREE.PointLight(LANTERN.color, 0, LANTERN.distance, LANTERN.decay);
    scene.add(this.lantern);

    this.flashT = Infinity;
    this.flashPower = 0;
    this.sunFlash = 0;
    this.nextStrike = 3;
    this.bolt = this.createBolt();
  }

  // ---------------------------------------------------------------- criação

  /** Camada de partículas: geometria fixa (pool) + material de pontos. */
  createLayer(spec, biomeIndex) {
    const state = createParticleState(spec, spec.count, this.rng);
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(state.pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aSeed', new THREE.BufferAttribute(state.seed, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(state.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(state.alpha, 1));
    geo.setAttribute('aAge', new THREE.BufferAttribute(new Float32Array(spec.count), 1)); // 0 = sem idade
    const material = this.pointsMaterial(spec, SHAPES[spec.shape] ?? 0);
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false; // a caixa sempre envolve a câmera
    points.visible = false;
    points.renderOrder = spec.shape === 'puff' ? 1 : 2;
    points.name = `weather-${BIOMES[biomeIndex].id}-${spec.shape}`;
    this.group.add(points);
    return { spec, biome: biomeIndex, state, points, posAttr, opacity: spec.opacity };
  }

  pointsMaterial(spec, shape) {
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uColor: { value: new THREE.Color(spec.color) },
        uOpacity: { value: 0 },
        uSize: { value: spec.size },
        uShape: { value: shape },
        uSpin: { value: spec.spin ?? 0 },
        uAngle: { value: 0 }, // direção do risco na tela
      }]),
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, fog: true,
      blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    material.uniforms.uScale = this._scale;
    material.uniforms.uTime = this._time;
    return material;
  }

  /** Respingos de chuva no chão (pool fixo, anéis que abrem e somem). */
  createSplashes(cfg, biomeIndex) {
    const n = cfg.count;
    const s = { pos: new Float32Array(n * 3), age: new Float32Array(n).fill(-1), count: n };
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(s.pos, 3).setUsage(THREE.DynamicDrawUsage);
    const ageAttr = new THREE.BufferAttribute(s.age, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aAge', ageAttr);
    const seed = new Float32Array(n).map(() => this.rng());
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    const points = new THREE.Points(geo, this.pointsMaterial({ ...cfg, spin: 0 }, SHAPES.splash));
    points.frustumCulled = false;
    points.visible = false;
    points.renderOrder = 2;
    this.group.add(points);
    return { cfg, biome: biomeIndex, s, points, posAttr, ageAttr };
  }

  /** Raio: faixa de triângulos em zigue-zague (geometria reaproveitada). */
  createBolt() {
    const N = 22;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 2.3, 2.8), toneMapped: false, fog: false,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.userData.N = N;
    this.group.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- API

  /** Nível gráfico: multiplica a quantidade de partículas. */
  setQuality({ weatherDensity }) {
    this.density = weatherDensity;
    for (const l of this.layers) l.state.active = Math.max(1, Math.floor(l.state.capacity * weatherDensity));
  }

  /**
   * Força o clima de um bioma (console / testes), com a transição normal.
   * @param {string} biomeId ex.: 'deserto'
   * @param {'limpo'|'nublado'|'tempestade'} state
   * @example game.weather.force('deserto', 'tempestade')
   */
  force(biomeId, state = 'tempestade', hours = 2) {
    this.scheduler.force(BIOMES.findIndex((b) => b.id === biomeId), state, hours);
  }

  /**
   * Chamar uma vez por quadro, depois de `environment.update()`.
   * @param {number} dt s
   * @param {object} o
   * @param {number} o.time tempo do jogo (s)
   * @param {THREE.PerspectiveCamera} o.camera
   * @param {THREE.Vector3} o.player posição do jogador
   * @param {Float32Array} o.weights pesos de bioma na posição do jogador
   * @param {boolean} o.underground masmorras: sem clima, só névoa paranormal
   * @param {number} [o.shelter] 0..1 dentro de uma vila
   * @param {number} [o.hourIndex] GameClock.hourIndex (sorteio a cada hora)
   */
  update(dt, { time, camera, player, weights, underground, shelter = 0, hourIndex = 0, indoor = false }) {
    /** Dentro de casa: sem chuva/neve/areia caindo na sala nem vinheta na tela. */
    this.indoor = indoor;
    this._time.value = time;
    this.renderer.getDrawingBufferSize(this._size);
    this._scale.value = this._size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.scheduler.update(dt, hourIndex);

    const k = 1 - Math.exp(-dt * 2);
    const roof = 1 - shelter * VILLAGE_SHELTER.strength;
    let dom = 0;
    for (let i = 0; i < this.place.length; i++) {
      this.place[i] = lerp(this.place[i], underground || !this.biomes[i] ? 0 : weights[i], k);
      this.eff[i] = this.place[i] * roof * this.scheduler.level(i);
      this.climates[i].intensity = this.eff[i];
      if (this.place[i] > this.place[dom]) dom = i;
    }
    const st = this.scheduler.state(dom);
    this.status.state = st;
    this.status.level = this.scheduler.level(dom);
    this.status.name = underground ? 'Subsolo' : this.biomes[dom]?.states[st] ?? '';

    camera.updateMatrixWorld();
    this.updateParticles(dt, time, camera, roof);
    this.updateSplashes(dt, camera.position, roof);
    this.applyLook(dt, time, player, camera, underground);
  }

  // ---------------------------------------------------------------- partículas

  /** Vento atual do bioma (sobe com a intensidade da tempestade). */
  windOf(bi, time, out) {
    const w = this.biomes[bi].wind;
    const gust = 1 + w.gust * (0.5 + 0.5 * Math.sin(time * Math.PI * 2 / w.gustPeriod));
    const storm = 1 + ((w.storm ?? 1) - 1) * this.scheduler.level(bi);
    out.x = w.x * gust * storm;
    out.z = w.z * gust * storm;
    return out;
  }

  updateParticles(dt, time, camera, roof) {
    const center = camera.position, wind = this._v;
    for (const l of this.layers) {
      const level = this.scheduler.level(l.biome);
      const gate = l.spec.minLevel ? smoothstep(level, l.spec.minLevel - 0.1, l.spec.minLevel + 0.2) : 1;
      const w = this.place[l.biome] * roof * level * gate;
      if (w < 0.01 || this.indoor) { l.points.visible = false; continue; }
      this.windOf(l.biome, time, wind);
      if (!l.state.seeded) seedParticles(l.state, center, this.rng);
      stepParticles(l.state, dt, center, wind.x, wind.z, time, this.rng);
      // Menos partículas E mais transparentes conforme a intensidade.
      l.points.geometry.setDrawRange(0, Math.ceil(l.state.active * Math.min(1, w * 1.3)));
      const u = l.points.material.uniforms;
      u.uOpacity.value = l.opacity * Math.sqrt(w);
      if (l.spec.shape === 'streak') u.uAngle.value = this.screenAngle(camera, wind.x, -l.spec.fall, wind.z);
      l.posAttr.addUpdateRange(0, l.state.active * 3);
      l.posAttr.needsUpdate = true;
      l.points.visible = true;
    }
  }

  /** Ângulo na tela (rad, 0 = vertical) do vetor de movimento (vx, vy, vz). */
  screenAngle(camera, vx, vy, vz) {
    const e = camera.matrixWorldInverse.elements;
    // Só a rotação da view (direção não sofre translação).
    const sx = e[0] * vx + e[4] * vy + e[8] * vz;
    const sy = e[1] * vx + e[5] * vy + e[9] * vz;
    return Math.atan2(sx, -sy);
  }

  updateSplashes(dt, center, roof) {
    for (const sp of this.splashes) {
      const level = this.scheduler.level(sp.biome);
      const w = this.place[sp.biome] * roof * level;
      const active = w < 0.05 || this.indoor ? 0 : Math.floor(sp.cfg.count * this.density * Math.min(1, w * 1.2));
      if (!active && !sp.points.visible) continue;
      stepSplashes(sp.s, dt, center, sp.cfg, active, this.groundAt, this.rng);
      sp.points.material.uniforms.uOpacity.value = sp.cfg.opacity * Math.sqrt(w);
      sp.posAttr.needsUpdate = true;
      sp.ageAttr.needsUpdate = true;
      sp.points.visible = active > 0;
    }
  }

  // ---------------------------------------------------------------- luz

  /** Neblina, sol, luz ambiente, céu, relâmpagos, lanterna e vinhetas. */
  applyLook(dt, time, player, camera, underground) {
    const env = this.env, fog = this.scene.fog;
    const out = this._fog.copy(fog.color);
    const sun = this._sun.copy(env.sun.color);
    let density = fog.density;
    let sum = 0, colorMix = 0, sunMix = 0, dSum = 0;
    let sunMul = 1, hemiMul = 1, expMul = 1, bloom = 0, lantern = 0, skyToFog = 0, lightningW = 0, lightningCfg = null;
    for (const k of OVERLAYS) this.overlays[k] = 0;

    for (let i = 0; i < this.eff.length; i++) {
      const w = this.eff[i], look = this.looks[i];
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
      const cfg = this.biomes[i];
      if (cfg.overlay) this.overlays[cfg.overlay] = Math.max(this.overlays[cfg.overlay], smoothstep(w, 0.3, 1));
      if (cfg.lightning && this.scheduler.level(i) >= cfg.lightning.minLevel && w > lightningW) { lightningW = w; lightningCfg = cfg.lightning; }
    }
    if (sum > 0) {
      density = lerp(density, dSum / sum, Math.min(1, sum));
      this.blendColor(out, 'fogColor', 'fogColorMix', colorMix);
      this.blendColor(sun, 'sunTint', 'sunTintMix', sunMix);
    }

    // Névoa paranormal: alvo pela distância, lerp lento = suspense.
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

    // Relâmpagos: clarão na luz ambiente E na direcional, raio no céu, trovão.
    let flash = 0;
    if (lightningCfg && lightningW > 0.2 && !underground) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) this.strike(lightningCfg, lightningW, camera);
    }
    this.flashT += dt;
    if (this.flashT < 2) flash = lightningEnvelope(this.flashT) * this.flashPower;
    this.flash = Math.min(1, flash / 3);
    this.bolt.visible = flash > 0.25;

    // Aplica (o Environment reescreve tudo no próximo quadro: nada acumula).
    fog.density = density;
    fog.color.copy(out);
    env.sun.color.copy(sun);
    env.sun.intensity = env.sun.intensity * sunMul + flash * this.sunFlash;
    if (flash > 0) env.sun.color.lerp(this.flashColor, Math.min(1, flash * 0.5));
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
    this.overcast = Math.min(1, skyToFog);
    if (underground || this.indoor) for (const k of OVERLAYS) this.overlays[k] = 0;

    // Lanterna: climas escuros, névoa paranormal e a noite.
    this.lantern.position.set(player.x, player.y + LANTERN.height, player.z);
    this.lantern.intensity = LANTERN.intensity * Math.min(1, lantern + p * 0.6 + (underground ? 0 : env.night * 0.9));
  }

  /** Média ponderada de uma cor dos looks, puxada pela soma dos "mix". */
  blendColor(target, colorKey, mixKey, mixSum) {
    if (mixSum <= 0) return;
    this._tmp.setRGB(0, 0, 0);
    for (let i = 0; i < this.eff.length; i++) {
      const w = this.eff[i], look = this.looks[i];
      if (w < 0.001 || !look) continue;
      const m = w * look[mixKey];
      this._tmp.r += look[colorKey].r * m; this._tmp.g += look[colorKey].g * m; this._tmp.b += look[colorKey].b * m;
    }
    target.lerp(this._tmp.multiplyScalar(1 / mixSum), Math.min(1, mixSum));
  }

  /** Relâmpago: clarão, raio visível no céu à frente e trovão atrasado. */
  strike(cfg, strength, camera) {
    this.flashT = 0;
    this.flashPower = cfg.flash * (0.6 + this.rng() * 0.4);
    this.sunFlash = cfg.sunFlash * strength;
    this.nextStrike = cfg.every[0] + this.rng() * (cfg.every[1] - cfg.every[0]);
    const dist = cfg.distance[0] + this.rng() * (cfg.distance[1] - cfg.distance[0]);
    this.placeBolt(camera, dist);
    const delay = cfg.thunderDelay[0] + (dist - cfg.distance[0]) / (cfg.distance[1] - cfg.distance[0]) * (cfg.thunderDelay[1] - cfg.thunderDelay[0]);
    this.audio?.thunder(delay, strength * (1 - dist / (cfg.distance[1] * 1.6)));
  }

  /** Monta o zigue-zague do raio entre o céu e o chão, de frente para a câmera. */
  placeBolt(camera, dist) {
    const fwd = camera.getWorldDirection(this._v);
    const yaw = Math.atan2(fwd.x, fwd.z) + (this.rng() - 0.5) * 1.6;
    const bx = camera.position.x + Math.sin(yaw) * dist, bz = camera.position.z + Math.cos(yaw) * dist;
    const by = this.groundAt(bx, bz), top = by + 320 + this.rng() * 120;
    const N = this.bolt.userData.N, pos = this.bolt.geometry.attributes.position;
    // Largura perpendicular à linha câmera→raio (no plano horizontal).
    const px = Math.cos(yaw), pz = -Math.sin(yaw), width = 2.4;
    let ox = 0, oz = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      if (i > 0 && i < N) { ox += (this.rng() - 0.5) * 22; oz += (this.rng() - 0.5) * 22; }
      const x = bx + ox * (1 - t * 0.5), z = bz + oz * (1 - t * 0.5), y = top + (by - top) * t;
      const half = width * (1 - t * 0.6) / 2;
      pos.setXYZ(i * 2, x - px * half, y, z - pz * half);
      pos.setXYZ(i * 2 + 1, x + px * half, y, z + pz * half);
    }
    pos.needsUpdate = true;
  }
}

const VERT = /* glsl */ `
  uniform float uSize;
  uniform float uScale;
  attribute float aSeed;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aAge;
  varying float vSeed;
  varying float vAlpha;
  varying float vNear;
  varying float vAge;
  #include <fog_pars_vertex>
  void main() {
    vSeed = aSeed;
    vAlpha = aAlpha;
    vAge = aAge;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float grow = aAge > 0.0 ? 0.4 + aAge : 1.0; // respingo abre com a idade
    gl_PointSize = clamp(uSize * aSize * grow * uScale * (0.75 + 0.5 * aSeed) / -mvPosition.z, 0.0, 256.0);
    gl_Position = projectionMatrix * mvPosition;
    // Partícula colada na câmera vira borrão: some suavemente.
    vNear = smoothstep(0.8, 3.0, -mvPosition.z);
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uSpin;
  uniform float uAngle;
  uniform int uShape;
  varying float vSeed;
  varying float vAlpha;
  varying float vNear;
  varying float vAge;
  #include <fog_pars_fragment>

  vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c) * p; }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p.y = -p.y;
    // Cada partícula gira no seu ritmo e sentido.
    float spin = vSeed * 6.2831 + uTime * uSpin * (vSeed - 0.5) * 2.0;
    float a;
    if (uShape == 0) {          // poeira / cinza / brasa
      a = 1.0 - smoothstep(0.3, 1.0, length(p));
    } else if (uShape == 1) {   // floco: miolo macio + 6 braços sutis girando
      vec2 q = rot(p, spin);
      float r = length(q), ang = atan(q.y, q.x);
      float arms = 0.55 + 0.45 * pow(abs(cos(ang * 3.0)), 6.0);
      a = 1.0 - smoothstep(0.1, 0.95 * arms, r);
    } else if (uShape == 2) {   // folha seca girando
      vec2 q = rot(p, spin);
      a = 1.0 - smoothstep(0.7, 1.0, length(vec2(q.x * 2.4, q.y)));
    } else if (uShape == 3) {   // risco alinhado ao movimento (chuva / areia)
      vec2 q = rot(p, -uAngle);
      a = (1.0 - smoothstep(0.04, 0.14, abs(q.x))) * (1.0 - smoothstep(0.35, 1.0, abs(q.y)));
      a *= 0.65 + 0.35 * (q.y * 0.5 + 0.5); // cabeça mais forte que a cauda
    } else if (uShape == 4) {   // nuvem macia (parede de poeira/neve/névoa)
      vec2 q = rot(p, spin);
      float n = noise(q * 2.2 + vSeed * 17.0) * 0.6 + noise(q * 4.7 - vSeed * 9.0) * 0.4;
      a = (1.0 - smoothstep(0.2, 1.0, length(p))) * smoothstep(0.25, 0.75, n);
    } else {                    // respingo: anel que abre e some
      if (vAge < 0.0) discard;
      float r = length(vec2(p.x, p.y * 2.2));
      float ring = 1.0 - smoothstep(0.0, 0.18, abs(r - (0.25 + vAge * 0.7)));
      a = ring * (1.0 - vAge);
    }
    a *= uOpacity * vAlpha * vNear;
    if (a < 0.008) discard;
    gl_FragColor = vec4(uColor * (0.82 + 0.36 * vSeed), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
