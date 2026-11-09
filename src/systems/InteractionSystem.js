import * as THREE from 'three';

/**
 * Registro de tudo que o jogador pode usar com a tecla E
 * (NPCs, poço, alçapão, portão, relógio…).
 *
 * Um interagível é:
 * { id, label, area, radius, position: Vector3 | () => Vector3, onInteract(game), enabled? }
 */
export class InteractionSystem {
  constructor() {
    this.items = [];
    this.current = null;
    this._v = new THREE.Vector3();
  }

  register(item) {
    this.items.push({ radius: 2.5, area: 'overworld', enabled: true, ...item });
    return item;
  }

  posOf(item) {
    return typeof item.position === 'function' ? item.position() : item.position;
  }

  /** Escolhe o interagível mais próximo (e à frente do jogador). */
  update(playerPos, facing, areaId) {
    let best = null, bestScore = Infinity;
    for (const it of this.items) {
      if (!it.enabled || it.area !== areaId) continue;
      const p = this.posOf(it);
      const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > it.radius || Math.abs(p.y - playerPos.y) > 4) continue;
      const front = d > 0.01 ? (dx * facing.x + dz * facing.z) / d : 1;
      const score = d - front * 0.8;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    this.current = best;
    return best;
  }

  interact(game) {
    this.current?.onInteract(game);
  }
}
