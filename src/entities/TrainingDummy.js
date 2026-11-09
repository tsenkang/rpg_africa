import * as THREE from 'three';

/**
 * Boneco de treino: poste com saco de palha. Balança ao levar soco, perde
 * vida e, quando zera, tomba e volta depois de alguns segundos.
 *
 * @example
 *   const dummy = new TrainingDummy({ x, y, z, health: 50, respawnSeconds: 4 });
 *   scene.add(dummy.root);
 *   combat.register({ name: dummy.name, object: dummy.hitbox, onHit: (h) => dummy.hit(h) });
 */
export class TrainingDummy {
  constructor({ x, y, z, facing = 0, health = 50, respawnSeconds = 4, name = 'Boneco de treino' }) {
    this.name = name;
    this.maxHealth = health;
    this.health = health;
    this.respawnSeconds = respawnSeconds;
    this.respawnIn = 0;
    this.root = new THREE.Group();
    this.root.position.set(x, y, z);
    this.root.rotation.y = facing;
    this.root.name = 'training-dummy';

    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.9 });
    const straw = new THREE.MeshStandardMaterial({ color: 0xc9a85a, roughness: 1 });
    const rope = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
    this.strawMaterial = straw;
    const add = (geo, mat, parent, [px, py, pz] = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // Base fixa no chão; o resto (pivô) balança.
    add(new THREE.CylinderGeometry(0.32, 0.38, 0.12, 14), wood, this.root, [0, 0.06, 0]);
    this.pivot = new THREE.Group();
    this.pivot.position.y = 0.12;
    this.root.add(this.pivot);
    add(new THREE.CylinderGeometry(0.05, 0.06, 1.55, 8), wood, this.pivot, [0, 0.78, 0]);
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8).rotateZ(Math.PI / 2), wood, this.pivot, [0, 1.3, 0]);
    add(new THREE.CapsuleGeometry(0.22, 0.55, 4, 12), straw, this.pivot, [0, 1.1, 0]);
    add(new THREE.SphereGeometry(0.15, 12, 10), straw, this.pivot, [0, 1.68, 0]);
    for (const h of [0.86, 1.36]) add(new THREE.TorusGeometry(0.225, 0.018, 6, 18).rotateX(Math.PI / 2), rope, this.pivot, [0, h, 0]);

    /** Malha invisível que o Raycaster atinge (mais fácil de acertar que o corpo fino). */
    this.hitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.7, 10), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.y = 0.95;
    this.root.add(this.hitbox);

    this.sway = new THREE.Vector2(); // inclinação (x, z) em rad
    this.swayVel = new THREE.Vector2();
    this.flash = 0;
  }

  get alive() {
    return this.health > 0;
  }

  /**
   * Levou um soco: perde vida e balança na direção do golpe.
   * @param {{ damage: number, direction: THREE.Vector3 }} hit
   */
  hit({ damage, direction }) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - damage);
    // Direção do golpe no espaço local do boneco.
    const local = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.root.rotation.y);
    this.swayVel.x += local.z * 2.8;
    this.swayVel.y -= local.x * 2.8;
    this.flash = 1;
    if (!this.alive) {
      this.respawnIn = this.respawnSeconds;
      this.fallDir = new THREE.Vector2(local.z, -local.x).normalize();
    }
  }

  update(dt) {
    if (!this.alive) {
      // Tomba e espera para voltar.
      this.sway.lerp(this.fallDir.clone().multiplyScalar(1.45), 1 - Math.exp(-6 * dt));
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) {
        this.health = this.maxHealth;
        this.swayVel.set(0, 0);
      }
    } else {
      // Mola amortecida de volta para o centro.
      this.swayVel.addScaledVector(this.sway, -60 * dt);
      this.swayVel.multiplyScalar(Math.exp(-4 * dt));
      this.sway.addScaledVector(this.swayVel, dt);
    }
    this.pivot.rotation.set(this.sway.x, 0, this.sway.y);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.strawMaterial.emissive.setRGB(0.5 * this.flash, 0.12 * this.flash, 0);
  }
}
