import * as THREE from 'three';

/**
 * Braço direito visto em 1ª pessoa (preso à câmera, no canto inferior
 * direito). Fica parado balançando de leve e estica para a frente no soco.
 *
 * @example
 *   const arm = new FirstPersonArm({ skin: 0x6b4430, sleeve: 0xc8a050 });
 *   camera.add(arm.root);          // a câmera precisa estar na cena
 *   arm.punch(0.32);               // anima um soco
 *   arm.update(dt, speed);         // todo quadro
 */
export class FirstPersonArm {
  constructor({ skin = 0x6b4430, sleeve = 0xc8a050 } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'first-person-arm';
    this.rest = new THREE.Vector3(0.24, -0.27, -0.42);
    this.root.position.copy(this.rest);
    this.root.rotation.set(0.18, 0.28, 0);

    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.85 });
    // Antebraço deitado apontando para -Z (para dentro da tela).
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 4, 10).rotateX(Math.PI / 2), sleeveMat);
    forearm.position.z = 0.12;
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.043, 0.06, 10).rotateX(Math.PI / 2), skinMat);
    wrist.position.z = -0.07;
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.1), skinMat);
    fist.position.z = -0.14;
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.04, 3, 6).rotateX(Math.PI / 2), skinMat);
    thumb.position.set(-0.05, 0.01, -0.12);
    for (const m of [forearm, wrist, fist, thumb]) {
      m.frustumCulled = false;
      this.root.add(m);
    }

    this.punchT = 0;
    this.punchDuration = 0.3;
    this.phase = 0;
  }

  /** Começa a animação de soco. */
  punch(duration = 0.3) {
    this.punchDuration = duration;
    this.punchT = 1;
  }

  /**
   * @param {number} dt
   * @param {number} speed velocidade do jogador (m/s), para o balanço ao andar
   * @param {boolean} [sprinting] correndo: bombeia o braço mais rápido e mais alto
   */
  update(dt, speed = 0, sprinting = false) {
    this.phase += dt * (speed > 0.2 ? (sprinting ? 11 : 9) : 1.5);
    const bob = speed > 0.2 ? (sprinting ? 0.03 : 0.014) : 0.003;
    let reach = 0;
    if (this.punchT > 0) {
      this.punchT = Math.max(0, this.punchT - dt / this.punchDuration);
      const p = 1 - this.punchT;
      reach = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
    }
    this.root.position.set(
      this.rest.x - 0.13 * reach,
      this.rest.y + Math.sin(this.phase * 2) * bob + 0.09 * reach,
      this.rest.z - 0.3 * reach,
    );
    this.root.rotation.y = 0.28 - 0.3 * reach;
  }
}
