import * as THREE from 'three';
import { BLEED } from '../config/hunting.js';
import { AnimalBrain } from './AnimalBrain.js';
import { AnimalBody } from './AnimalBody.js';
import { WORLD } from '../config/worldConfig.js';
import { slopeTilt } from './anim/AnimMath.js';
import { SLOPE } from '../config/physics.js';
import { surfaceNormal, isUnwalkable, SlideState, steerAroundSlope } from '../systems/physics/SlopePhysics.js';

const _to = new THREE.Vector3();
const _steer = { x: 0, z: 0, blocked: false };
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
/** Material da hitbox: invisível, mas o Raycaster do soco acerta (não olha `visible`). */
const HITBOX_MAT = new THREE.MeshBasicMaterial({ visible: false });
const HITBOX_GEO = new THREE.BoxGeometry(1, 1, 1);

/**
 * Um animal no mundo: corpo (`AnimalBody`) + IA (`AnimalBrain`) + movimento.
 * Anda sobre o terreno, evita água (menos quem nada, ex.: capivara), foge,
 * persegue e ataca conforme o estado da IA.
 *
 * @example
 *   const a = new Animal({ spec: SPECIES.leao, x, z, groundAt, fauna: FAUNA });
 *   scene.add(a.root);
 *   const { strike } = a.update(dt, player.position, playerAlive);
 */
export class Animal {
  /**
   * @param {{ spec: object, x: number, z: number, groundAt: (x:number,z:number)=>number,
   *   fauna: object, rng?: () => number, group?: number, speciesId?: string, model?: object|null }} opts
   *   `model`: cópia de `AnimalModels.instance()`; null = corpo procedural.
   */
  constructor({ spec, x, z, groundAt, fauna, rng = Math.random, group = 0, speciesId = '', model = null }) {
    this.spec = spec;
    this.speciesId = speciesId;
    this.fauna = fauna;
    this.rng = rng;
    this.group = group;
    this.groundAt = groundAt;
    this.brain = new AnimalBrain(spec, fauna, rng);
    this.body = new AnimalBody(spec, model, speciesId);
    this.root = this.body.root;
    this.root.position.set(x, groundAt(x, z), z);
    this.root.rotation.y = rng() * Math.PI * 2;
    this.addHitbox();
    this.home = new THREE.Vector3(x, 0, z);
    this.leapT = 0; // leopardo: tempo restante do salto
    /** Limite de inclinação: normal sob as patas e escorregão (SLIDING). */
    this.normal = { x: 0, y: 1, z: 0 };
    this.slide = new SlideState();
    this.sliding = false;
    this.circleA = rng() * Math.PI * 2; // arara: ângulo no círculo
    this.altitude = 0; // arara: altura atual do voo
    this.wanderTarget = new THREE.Vector3(x, 0, z);
    this.health = spec.health;
    /** Caça: sangrando (tiro no corpo), mancando (pernas), metros andados desde a última gota. */
    this.bleeding = false;
    this.limpT = 0;
    this.trailAcc = 0;
    this.skinned = false;
    this.speed = 0;
    this.stateTime = 0;
    this.deadTime = 0;
    this._lastState = this.brain.state;
    /** s até o impacto do bote em andamento (-1 = nenhum): o dano sai no impacto. */
    this.pendingStrike = -1;
    this.swimming = false;
    this._yaw = this.root.rotation.y;
    this._tilt = { pitch: 0, roll: 0 };
  }

  /**
   * Caixa invisível do tamanho do corpo (THREE.Box3 do modelo ou do
   * placeholder) — o soco (Raycaster) acerta nela sem depender da malha
   * animada (malha com esqueleto tem caixa errada).
   */
  addHitbox() {
    // Mede de frente (rotação zerada): a caixa vira filha do animal e gira com ele.
    const yaw = this.root.rotation.y;
    this.root.rotation.y = 0;
    this.root.updateMatrixWorld(true);
    _box.setFromObject(this.body.pose, true);
    this.root.rotation.y = yaw;
    if (_box.isEmpty()) return;
    _box.getSize(_size);
    _box.getCenter(_center);
    _center.sub(this.root.position); // centro relativo ao animal (ainda sem giro)
    const hit = new THREE.Mesh(HITBOX_GEO, HITBOX_MAT);
    // Rotacionado com o animal: tamanho local ≈ caixa em pé (+15% de folga).
    hit.scale.set(Math.max(_size.x, 0.3) * 1.15, Math.max(_size.y, 0.3) * 1.15, Math.max(_size.z, 0.3) * 1.15);
    hit.position.copy(_center);
    hit.name = 'hitbox';
    this.root.add(hit);
    this.hitbox = hit;
    hit.userData.animal = this;
    /** Raio/altura do corpo (física: corpo cinemático que empurra objetos). */
    this.bodyRadius = Math.max(0.2, Math.min(_size.x, _size.z) * 0.5);
    this.bodyHeight = Math.max(0.3, _size.y);
    /** Onde as patas tocam o chão (para inclinar o corpo na rampa). */
    this.halfLen = Math.max(0.15, _size.z * 0.38);
    this.halfWid = Math.max(0.1, _size.x * 0.4);
  }

  get position() {
    return this.root.position;
  }

  get alive() {
    return this.brain.state !== 'dead';
  }

  /**
   * Levou um golpe: perde vida, recua um pouco e reage.
   * `zone` (caça): 'head' = abate na hora; 'body' = sangra e foge deixando
   * rastro; 'legs' = manca. Sem zona (soco): foge ou ataca.
   */
  takeHit({ damage, direction, zone = null }) {
    if (!this.alive) return;
    if (zone === 'head') this.health = 0;
    else {
      this.health -= damage;
      if (zone === 'body') this.bleeding = true;
      if (zone === 'legs') this.limpT = BLEED.slowSeconds;
    }
    this.root.position.x += direction.x * 0.3;
    this.root.position.z += direction.z * 0.3;
    if (this.health <= 0) this.brain.die();
    else if (zone === 'body' || zone === 'legs') this.brain.startFleeing(); // ferido de longe: foge
    else this.brain.hurt();
  }

  /** Água funda demais para um animal que não nada? */
  isWater(x, z) {
    return this.groundAt(x, z) < WORLD.waterLevel - 0.15;
  }

  /** Lugar onde o animal não pode ir: água (terrestres) ou terra (aquáticos). */
  blocked(x, z) {
    if (this.spec.aquatic) return !this.isWater(x, z);
    return !this.spec.swims && this.isWater(x, z);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos
   * @param {boolean} playerAlive
   * @returns {{ strike: boolean, state: string }} `strike` = o golpe ACERTA agora
   *   (no meio do impacto da animação, não quando a IA decide atacar)
   */
  update(dt, playerPos, playerAlive = true) {
    const spec = this.spec;
    const p = this.root.position;
    const dist = playerAlive ? Math.hypot(playerPos.x - p.x, playerPos.z - p.z) : Infinity;
    const fromHome = Math.hypot(playerPos.x - this.home.x, playerPos.z - this.home.z);
    const atHome = Math.hypot(p.x - this.home.x, p.z - this.home.z) < 3;
    const prev = this.brain.state;
    const { state, strike: decided } = this.brain.tick(dt, dist, { fromHome, atHome });
    // Antecipação → impacto: a IA decide, a animação começa, o dano sai no impacto.
    let strike = false;
    if (decided) this.pendingStrike = this.body.startAttack();
    if (this.pendingStrike >= 0) {
      this.pendingStrike -= dt;
      if (this.pendingStrike < 0) strike = this.alive && dist <= (spec.attackRange ?? 1.5) * 1.5;
    }
    // Leopardo: o fim da tocaia vira um salto em arco sobre o jogador.
    if (spec.leap && prev === 'stalk' && state === 'chase') this.leapT = 0.6;
    if (state !== this._lastState) {
      this._lastState = state;
      this.stateTime = 0;
      if (state === 'wander') this.pickWanderTarget();
    }
    this.stateTime += dt;

    let speed = 0;
    let heading = null; // direção desejada (ângulo y)
    switch (state) {
      case 'wander': {
        _to.set(this.wanderTarget.x - p.x, 0, this.wanderTarget.z - p.z);
        if (_to.lengthSq() > 0.5) { speed = spec.walk; heading = Math.atan2(_to.x, _to.z); }
        break;
      }
      case 'flee':
      case 'fly':
        speed = state === 'fly' ? spec.run * 0.6 : spec.run;
        heading = Math.atan2(p.x - playerPos.x, p.z - playerPos.z) + Math.sin(this.stateTime * 1.7) * 0.35;
        break;
      case 'stalk':
        speed = spec.stalk ?? spec.walk;
        heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
        break;
      case 'chase':
        speed = spec.run;
        heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
        break;
      case 'attack':
      case 'threat':
        heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
        break;
      case 'home': {
        _to.set(this.home.x - p.x, 0, this.home.z - p.z);
        if (_to.lengthSq() > 4) { speed = spec.run * 0.6; heading = Math.atan2(_to.x, _to.z); }
        break;
      }
      case 'circle': {
        // Arara: círculos sobre o ninho (mais largos se assustada).
        this.circleA += dt * (spec.run * 0.6) / spec.soarRadius;
        const r = spec.soarRadius * (dist < spec.sense * 2 ? 1.6 : 1);
        const tx = this.home.x + Math.cos(this.circleA) * r, tz = this.home.z + Math.sin(this.circleA) * r;
        speed = Math.min(spec.run, Math.hypot(tx - p.x, tz - p.z) / Math.max(dt, 1e-3));
        heading = Math.atan2(tx - p.x, tz - p.z);
        break;
      }
      default:
        break;
    }
    if (this.leapT > 0) { this.leapT -= dt; speed = spec.run * 1.5; }
    if (this.limpT > 0) { this.limpT -= dt; speed *= BLEED.slowFactor; } // tiro nas pernas: manca

    if (heading !== null) {
      const cur = this.root.rotation.y;
      const diff = Math.atan2(Math.sin(heading - cur), Math.cos(heading - cur));
      this.root.rotation.y = cur + diff * Math.min(1, dt * (speed > spec.walk * 2 ? 6 : 3));
    }
    const onFoot = state !== 'fly' && state !== 'circle' && state !== 'burrow' && !spec.aquatic && this.altitude < 0.05;
    if (this.sliding) speed = 0; // escorregando: perdeu o controle das patas
    if (speed > 0) {
      let yaw = this.root.rotation.y;
      // Encosta > 45° à frente: contorna (fuga/caça/passeio) em vez de escalar.
      if (onFoot && this.leapT <= 0) {
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        steerAroundSlope(this.groundAt, p.x, p.z, fx, fz, SLOPE, _steer);
        if (_steer.blocked) { speed = 0; if (state === 'wander') this.pickWanderTarget(); }
        else if (_steer.x !== fx || _steer.z !== fz) { yaw = Math.atan2(_steer.x, _steer.z); this.root.rotation.y = yaw; }
      }
      let nx = p.x + Math.sin(yaw) * speed * dt;
      let nz = p.z + Math.cos(yaw) * speed * dt;
      // Terrestres contornam a água; aquáticos (jacaré) não saem dela.
      if (state !== 'fly' && state !== 'circle' && this.blocked(nx, nz)) {
        const side = this.rng() < 0.5 ? 1 : -1;
        this.root.rotation.y += side * 1.2;
        nx = p.x; nz = p.z; speed = 0;
        if (state === 'wander') this.pickWanderTarget();
      }
      p.x = nx;
      p.z = nz;
    }
    // Pisou (ou foi empurrado) numa encosta > 45°: escorrega até o chão firme.
    if (onFoot && this.alive) {
      surfaceNormal(this.groundAt, p.x, p.z, SLOPE.normalSample, this.normal);
      const d = this.slide.update(dt, this.normal, isUnwalkable(this.normal));
      if (this.slide.sliding && !this.blocked(p.x + d.dx, p.z + d.dz)) { p.x += d.dx; p.z += d.dz; }
      else if (this.slide.sliding) this.slide.reset(); // não escorrega para dentro d'água
      this.sliding = this.slide.sliding;
    } else { this.sliding = false; this.slide.reset(); }
    this.speed = speed;
    this.swimming = false;
    if (state !== 'burrow') {
      const g = this.groundAt(p.x, p.z);
      this.swimming = !!spec.swims && g < WORLD.waterLevel - spec.size * 0.6;
      p.y = this.swimming ? WORLD.waterLevel - spec.size * 0.6 : g;
      // Arara: sobe/desce suave até a altura do voo; leopardo: arco do salto.
      const [h0, h1] = spec.soarHeight ?? [0, 0];
      const targetAlt = state === 'circle' ? (dist < spec.sense * 2 ? h1 : h0) : 0;
      this.altitude += (targetAlt - this.altitude) * Math.min(1, dt * 1.2);
      p.y += this.altitude;
      if (this.leapT > 0) p.y += Math.sin((1 - this.leapT / 0.6) * Math.PI) * 1.6 * spec.size;
    }
    if (!this.alive) this.deadTime += dt;
    // Sangrando: perde vida até cair; continua fugindo; acumula distância para o rastro.
    if (this.bleeding && this.alive) {
      this.health -= BLEED.healthPerSecond * dt;
      this.trailAcc += speed * dt;
      if (this.brain.state === 'flee') this.brain.timer = Math.max(this.brain.timer, 1.5);
      if (this.health <= 0) this.brain.die();
    }
    // Contexto da animação: rampa sob as patas, velocidade da curva, olhar.
    const yaw = this.root.rotation.y;
    const yawRate = Math.atan2(Math.sin(yaw - this._yaw), Math.cos(yaw - this._yaw)) / Math.max(dt, 1e-4);
    this._yaw = yaw;
    const grounded = !this.swimming && this.altitude < 0.05 && state !== 'fly' && state !== 'burrow' && this.leapT <= 0;
    const tilt = grounded ? slopeTilt(this.groundAt, p.x, p.z, yaw, this.halfLen ?? 0.5, this.halfWid ?? 0.25) : this._tilt;
    if (this.sliding && grounded) { // desequilíbrio: o corpo balança de lado e empina enquanto desce
      tilt.roll += Math.sin(this.stateTime * 11) * 0.22;
      tilt.pitch += 0.12;
    }
    const toPlayer = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    const look = Math.atan2(Math.sin(toPlayer - yaw), Math.cos(toPlayer - yaw));
    this.body.update(dt, speed, state, this.stateTime, { swimming: this.swimming, tilt, yawRate, leaping: this.leapT > 0, look });
    return { strike, state };
  }

  pickWanderTarget() {
    const r = this.fauna.wanderRadius;
    for (let i = 0; i < 6; i++) {
      const a = this.rng() * Math.PI * 2, d = r * Math.sqrt(this.rng());
      const x = this.home.x + Math.cos(a) * d, z = this.home.z + Math.sin(a) * d;
      if (!this.blocked(x, z)) {
        this.wanderTarget.set(x, 0, z);
        return;
      }
    }
    this.wanderTarget.copy(this.root.position);
  }
}
