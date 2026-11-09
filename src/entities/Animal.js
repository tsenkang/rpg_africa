import * as THREE from 'three';
import { AnimalBrain } from './AnimalBrain.js';
import { AnimalBody } from './AnimalBody.js';
import { WORLD } from '../config/worldConfig.js';

const _to = new THREE.Vector3();
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
    this.body = new AnimalBody(spec, model);
    this.root = this.body.root;
    this.root.position.set(x, groundAt(x, z), z);
    this.root.rotation.y = rng() * Math.PI * 2;
    this.addHitbox();
    this.home = new THREE.Vector3(x, 0, z);
    this.leapT = 0; // leopardo: tempo restante do salto
    this.circleA = rng() * Math.PI * 2; // arara: ângulo no círculo
    this.altitude = 0; // arara: altura atual do voo
    this.wanderTarget = new THREE.Vector3(x, 0, z);
    this.health = spec.health;
    this.speed = 0;
    this.stateTime = 0;
    this.deadTime = 0;
    this._lastState = this.brain.state;
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
    /** Raio/altura do corpo (física: corpo cinemático que empurra objetos). */
    this.bodyRadius = Math.max(0.2, Math.min(_size.x, _size.z) * 0.5);
    this.bodyHeight = Math.max(0.3, _size.y);
  }

  get position() {
    return this.root.position;
  }

  get alive() {
    return this.brain.state !== 'dead';
  }

  /** Levou um soco: perde vida, recua um pouco e reage (foge ou ataca). */
  takeHit({ damage, direction }) {
    if (!this.alive) return;
    this.health -= damage;
    this.root.position.x += direction.x * 0.3;
    this.root.position.z += direction.z * 0.3;
    if (this.health <= 0) this.brain.die();
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
   * @returns {{ strike: boolean, state: string }}
   */
  update(dt, playerPos, playerAlive = true) {
    const spec = this.spec;
    const p = this.root.position;
    const dist = playerAlive ? Math.hypot(playerPos.x - p.x, playerPos.z - p.z) : Infinity;
    const fromHome = Math.hypot(playerPos.x - this.home.x, playerPos.z - this.home.z);
    const atHome = Math.hypot(p.x - this.home.x, p.z - this.home.z) < 3;
    const prev = this.brain.state;
    const { state, strike } = this.brain.tick(dt, dist, { fromHome, atHome });
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

    if (heading !== null) {
      const cur = this.root.rotation.y;
      const diff = Math.atan2(Math.sin(heading - cur), Math.cos(heading - cur));
      this.root.rotation.y = cur + diff * Math.min(1, dt * (speed > spec.walk * 2 ? 6 : 3));
    }
    if (speed > 0) {
      const yaw = this.root.rotation.y;
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
    this.speed = speed;
    if (state !== 'burrow') {
      const g = this.groundAt(p.x, p.z);
      p.y = spec.swims && g < WORLD.waterLevel - spec.size * 0.6 ? WORLD.waterLevel - spec.size * 0.6 : g;
      // Arara: sobe/desce suave até a altura do voo; leopardo: arco do salto.
      const [h0, h1] = spec.soarHeight ?? [0, 0];
      const targetAlt = state === 'circle' ? (dist < spec.sense * 2 ? h1 : h0) : 0;
      this.altitude += (targetAlt - this.altitude) * Math.min(1, dt * 1.2);
      p.y += this.altitude;
      if (this.leapT > 0) p.y += Math.sin((1 - this.leapT / 0.6) * Math.PI) * 1.6 * spec.size;
    }
    if (!this.alive) this.deadTime += dt;
    this.body.update(dt, speed, state, this.stateTime);
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
