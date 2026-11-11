import * as THREE from 'three';
import { Humanoid } from './Humanoid.js';

/**
 * Personagem não jogável.
 * - Sem `path`: fica parado, respira e vira o rosto para o jogador quando perto.
 * - Com `path` (lista de pontos): caminha de ponto em ponto, pausando às vezes.
 */
export class NPC {
  constructor({ id, name, title = '', look = {}, x, y, z, facing = 0, path = null, speed = 1.3, groundAt, area = 'overworld' }) {
    this.id = id;
    this.name = name;
    this.title = title;
    this.area = area;
    this.model = new Humanoid(look);
    this.root = this.model.root;
    this.root.position.set(x, y, z);
    this.root.rotation.y = facing;
    this.baseFacing = facing;
    this.path = path;
    this.pathIndex = 0;
    this.speed = speed;
    this.pause = Math.random() * 3;
    this.groundAt = groundAt;
    this.talkPoint = new THREE.Vector3();
  }

  get position() {
    return this.root.position;
  }

  /** Ponto usado pelo sistema de interação (altura do peito). */
  interactionPoint() {
    return this.talkPoint.copy(this.root.position).setY(this.root.position.y + 1.2);
  }

  update(dt, playerPos) {
    let speed = 0;
    if (this.path && this.path.length > 1) {
      if (this.pause > 0) {
        this.pause -= dt;
      } else {
        const target = this.path[this.pathIndex];
        const dx = target.x - this.root.position.x, dz = target.z - this.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) {
          this.pathIndex = (this.pathIndex + 1) % this.path.length;
          if (Math.random() < 0.35) this.pause = 1 + Math.random() * 4;
        } else {
          speed = this.speed;
          const step = Math.min(d, speed * dt);
          this.root.position.x += (dx / d) * step;
          this.root.position.z += (dz / d) * step;
          if (this.groundAt) this.root.position.y = this.groundAt(this.root.position.x, this.root.position.z);
          this.turnTo(Math.atan2(dx, dz), dt * 6);
        }
      }
    } else if (playerPos) {
      const dx = playerPos.x - this.root.position.x, dz = playerPos.z - this.root.position.z;
      const near = dx * dx + dz * dz < 36;
      this.turnTo(near ? Math.atan2(dx, dz) : this.baseFacing, dt * 3);
    }
    this.model.update(dt, speed, { ground: this.groundAt });
  }

  /**
   * Levou um golpe: recua `knockback` metros na direção do golpe e anima.
   * @param {{ direction: THREE.Vector3 }} hit
   */
  takeHit(hit, knockback = 0.35) {
    this.root.position.x += hit.direction.x * knockback;
    this.root.position.z += hit.direction.z * knockback;
    if (this.groundAt) this.root.position.y = this.groundAt(this.root.position.x, this.root.position.z);
    this.model.flinch();
    this.pause = Math.max(this.pause, 1.2);
  }

  turnTo(angle, k) {
    const cur = this.root.rotation.y;
    const diff = Math.atan2(Math.sin(angle - cur), Math.cos(angle - cur));
    this.root.rotation.y = cur + diff * Math.min(1, k);
  }
}
