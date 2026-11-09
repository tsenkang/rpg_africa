import * as THREE from 'three';

/**
 * Ataques corpo a corpo. Por enquanto só o soco ("Mãos Livres").
 *
 * Alvos são registrados com `register({ name, object, onHit })`. O soco lança
 * `THREE.Raycaster`s do personagem para a frente (um por altura em
 * `punch.rayHeights`: peito e cintura), com alcance curto,
 * contra os objetos registrados e os `obstacles` (casas, muros…). Sobe pelos
 * pais do objeto atingido até achar o alvo registrado.
 *
 * @example
 *   const combat = new Combat({ punch: GAMEPLAY.combat.punch });
 *   combat.register({ name: 'Boneco', object: dummy.root, onHit: (hit) => dummy.hit(hit) });
 *   const r = combat.punch(origin, direction, time);
 *   r.ready && r.hit?.name; // 'Boneco'
 */
export class Combat {
  /**
   * @param {{ punch: { range: number, cooldown: number, damage: number } }} config
   * @param {{ log?: (msg: string) => void }} [deps] onde escrever o aviso de debug
   */
  constructor(config, { log = (msg) => console.log(msg) } = {}) {
    this.config = config;
    this.log = log;
    this.targets = new Map(); // Object3D → alvo
    this.obstacles = [];
    this.raycaster = new THREE.Raycaster();
    this.nextPunchAt = -Infinity;
  }

  /**
   * Registra algo que reage ao soco.
   * @param {{ name: string, object: THREE.Object3D, onHit?: (hit: object) => void, enabled?: () => boolean }} target
   */
  register(target) {
    this.targets.set(target.object, { enabled: () => true, ...target });
    return target;
  }

  unregister(object) {
    this.targets.delete(object);
  }

  /**
   * Objetos que param o soco sem reagir (paredes, casas). O nome mostrado vem
   * de `userData.hitName` (do objeto ou de um pai). Pode ser trocado a qualquer
   * momento: `combat.obstacles = [...]` (ex.: só as vilas perto do jogador).
   */
  addObstacle(object) {
    this.obstacles.push(object);
  }

  /** true se o soco já pode ser dado de novo no instante `time` (s). */
  canPunch(time) {
    return time >= this.nextPunchAt;
  }

  /**
   * Dá um soco.
   * @param {THREE.Vector3} origin ponto de partida (peito do personagem)
   * @param {THREE.Vector3} direction direção do golpe (normalizada aqui)
   * @param {number} time tempo do jogo em segundos (para o intervalo entre socos)
   * @returns {{ ready: boolean, hit: null | { name: string, distance: number, point: THREE.Vector3, direction: THREE.Vector3, damage: number, target: object|null } }}
   *   `ready` = false quando ainda está no intervalo entre socos (nada acontece).
   */
  punch(origin, direction, time) {
    const cfg = this.config.punch;
    if (!this.canPunch(time)) return { ready: false, hit: null };
    this.nextPunchAt = time + cfg.cooldown;

    const dir = direction.clone().normalize();
    this.raycaster.near = 0;
    this.raycaster.far = cfg.range;
    const live = [...this.targets.values()].filter((t) => t.enabled() && t.object.visible);
    const objects = [...live.map((t) => t.object), ...this.obstacles];
    // Um raio por altura (peito, cintura…); vale o acerto mais perto.
    const hits = [];
    for (const dy of cfg.rayHeights ?? [0]) {
      this.raycaster.set(origin.clone().setY(origin.y + dy), dir);
      hits.push(...this.raycaster.intersectObjects(objects, true));
    }
    hits.sort((a, b) => a.distance - b.distance);
    // Ignora o que está escondido e alvos desativados (ex.: NPC de outra área).
    const first = hits.find((h) => isVisible(h.object) && (this.findTarget(h.object)?.enabled() ?? true));

    let hit = null;
    if (first) {
      const target = this.findTarget(first.object);
      hit = {
        name: target?.name ?? first.object.userData.hitName ?? findHitName(first.object) ?? 'Objeto',
        distance: first.distance,
        point: first.point,
        direction: dir,
        damage: cfg.damage,
        target,
      };
      target?.onHit?.(hit);
    }
    this.log(hit ? `Soco desferido! Acertou: ${hit.name} (${hit.distance.toFixed(2)} m)` : 'Soco desferido! Não acertou nada.');
    return { ready: true, hit };
  }

  /**
   * Raio sem dano e sem intervalo: o que está na frente, até `range` metros?
   * Usado pelo clique de "conversar" (NPC com diálogo).
   * @returns {null | { target: object|null, name: string, distance: number }}
   */
  pick(origin, direction, range) {
    const dir = direction.clone().normalize();
    this.raycaster.near = 0;
    this.raycaster.far = range;
    const live = [...this.targets.values()].filter((t) => t.enabled() && t.object.visible);
    const objects = [...live.map((t) => t.object), ...this.obstacles];
    const hits = [];
    for (const dy of this.config.punch.rayHeights ?? [0]) {
      this.raycaster.set(origin.clone().setY(origin.y + dy), dir);
      hits.push(...this.raycaster.intersectObjects(objects, true));
    }
    hits.sort((a, b) => a.distance - b.distance);
    const first = hits.find((h) => isVisible(h.object) && (this.findTarget(h.object)?.enabled() ?? true));
    if (!first) return null;
    const target = this.findTarget(first.object);
    return { target, name: target?.name ?? findHitName(first.object) ?? 'Objeto', distance: first.distance };
  }

  /** Sobe pela hierarquia até achar um alvo registrado. */
  findTarget(object) {
    for (let o = object; o; o = o.parent) {
      const t = this.targets.get(o);
      if (t) return t;
    }
    return null;
  }
}

function isVisible(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function findHitName(object) {
  for (let o = object; o; o = o.parent) if (o.userData.hitName) return o.userData.hitName;
  return null;
}
