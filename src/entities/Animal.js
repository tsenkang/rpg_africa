import * as THREE from 'three';
import { AnimalBrain } from './AnimalBrain.js';
import { AnimalBody } from './AnimalBody.js';
import { WORLD } from '../config/worldConfig.js';

const _to = new THREE.Vector3();

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
    this.home = new THREE.Vector3(x, 0, z);
    this.wanderTarget = new THREE.Vector3(x, 0, z);
    this.health = spec.health;
    this.speed = 0;
    this.stateTime = 0;
    this.deadTime = 0;
    this._lastState = this.brain.state;
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
    const { state, strike } = this.brain.tick(dt, dist);
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
        heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
        break;
      default:
        break;
    }

    if (heading !== null) {
      const cur = this.root.rotation.y;
      const diff = Math.atan2(Math.sin(heading - cur), Math.cos(heading - cur));
      this.root.rotation.y = cur + diff * Math.min(1, dt * (speed > spec.walk * 2 ? 6 : 3));
    }
    if (speed > 0) {
      const yaw = this.root.rotation.y;
      let nx = p.x + Math.sin(yaw) * speed * dt;
      let nz = p.z + Math.cos(yaw) * speed * dt;
      // Quem não nada contorna a água (desvia para o lado; se não der, para).
      if (!spec.swims && state !== 'fly' && this.isWater(nx, nz)) {
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
      if (this.spec.swims || !this.isWater(x, z)) {
        this.wanderTarget.set(x, 0, z);
        return;
      }
    }
    this.wanderTarget.copy(this.root.position);
  }
}
