import * as THREE from 'three';
import { CAMERA } from '../config/camera.js';
import { approach } from '../entities/Locomotion.js';

/**
 * Câmera do jogador com dois modos, ambos girados pelo mouse (cursor
 * travado com ALT) ou por ← → / Q R:
 *
 *  - 'third' (3ª pessoa): atrás e acima do personagem, orbitando as costas;
 *    roda do mouse aproxima/afasta; nunca entra no chão.
 *  - 'first' (1ª pessoa): na altura dos olhos; olha para cima/baixo.
 *
 * Correndo (Shift) o FOV abre suavemente (`config.sprintFov`) e a câmera
 * balança mais rápido e mais forte (head bobbing, `config.bob`).
 *
 * O ângulo horizontal (`yaw`) é o mesmo nos dois modos, então trocar de modo
 * (`toggleMode`) mantém a direção para onde se anda. É o equivalente ao
 * PointerLockControls do Three.js, mas também serve para a 3ª pessoa.
 *
 * @example
 *   const rig = new CameraRig(camera, { groundAt });
 *   rig.update(dt, player.position, input, { flying, underground });
 *   rig.toggleMode(); // 1ª ↔ 3ª pessoa
 */
export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {{ groundAt?: (x: number, z: number, feetY?: number) => number, config?: typeof CAMERA }} [deps]
   *   `groundAt` recebe a altura do pé do jogador (piso do andar dele).
   */
  constructor(camera, { groundAt = null, config = CAMERA } = {}) {
    this.camera = camera;
    this.groundAt = groundAt;
    this.config = config;
    this.mode = config.startMode;
    this.yaw = Math.PI; // olhando para -Z (norte)
    this.pitch = config.third.pitch; // 3ª pessoa
    this.firstPitch = 0; // 1ª pessoa (positivo = olhando para baixo)
    this.distance = config.third.distance;
    this.targetDistance = config.third.distance;
    this.minDistance = config.third.minDistance;
    this.maxDistance = config.third.maxDistance;
    this.sensitivity = config.sensitivity;
    this.keyTurnSpeed = config.keyTurnSpeed;
    this.focus = new THREE.Vector3();
    this.kickAmount = 0; // rad, decai sozinho (tranco do soco)
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.first = true;
    this.listeners = [];
    this.fov = config.fov;
    this.camera.fov = config.fov;
    this.camera.updateProjectionMatrix();
    this.bobPhase = 0; // ciclo de passos (rad)
    this.bobStrength = 0; // 0 parado → 1 andando (suavizado)
    this.bobOffset = new THREE.Vector3(); // deslocamento do balanço neste quadro
    this._right = new THREE.Vector3();
    /**
     * Recuo permitido (opcional): `(focus, cam) => fração 0..1` do caminho
     * foco → câmera livre de paredes. Ex.: `InteriorManager.cameraReach`.
     * @type {((focus: THREE.Vector3, cam: THREE.Vector3) => number) | null}
     */
    this.reach = null;
    this.clipDistance = this.distance; // distância real (após o recuo)
    this.clipped = false;
  }

  get isFirstPerson() {
    return this.mode === 'first';
  }

  /** Chama `fn(mode)` quando o modo muda. */
  onModeChange(fn) {
    this.listeners.push(fn);
  }

  /** Define o modo ('first' | 'third'). A direção horizontal é mantida. */
  setMode(mode) {
    if (mode !== 'first' && mode !== 'third') throw new Error(`Modo de câmera inválido: ${mode}`);
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'first') this.firstPitch = 0; // começa olhando reto
    this.snap();
    for (const fn of this.listeners) fn(mode);
  }

  /** Alterna 1ª ↔ 3ª pessoa. */
  toggleMode() {
    this.setMode(this.isFirstPerson ? 'third' : 'first');
  }

  /** Tranco rápido para baixo (feedback de ataque). */
  kick(amount) {
    this.kickAmount = Math.max(this.kickAmount, amount);
  }

  /** Direção "para frente" no chão (para o movimento do jogador). */
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Lê mouse e teclado (girar, inclinar, zoom). */
  applyInput(dt, input) {
    const t = this.config.third;
    this.yaw -= input.mouseDX * this.sensitivity;
    let turn = 0;
    if (input.isDown('ArrowLeft') || input.isDown('KeyQ')) turn += 1;
    if (input.isDown('ArrowRight') || input.isDown('KeyR')) turn -= 1;
    this.yaw += turn * this.keyTurnSpeed * dt;
    const tilt = (input.isDown('PageUp') ? dt : 0) - (input.isDown('PageDown') ? dt : 0);
    if (this.isFirstPerson) {
      const max = this.config.first.maxPitch;
      this.firstPitch = THREE.MathUtils.clamp(this.firstPitch + input.mouseDY * this.sensitivity - tilt, -max, max);
    } else {
      this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * this.sensitivity + tilt, t.minPitch, t.maxPitch);
      this.targetDistance *= 1 + input.wheel * 0.12;
    }
  }

  /**
   * Posiciona a câmera.
   * @param {number} dt
   * @param {THREE.Vector3} target pés do personagem
   * @param {object|null} input `Input` (null = não lê controles, ex.: diálogo aberto)
   * @param {{ flying?: boolean, underground?: boolean, sprinting?: boolean, speed?: number, grounded?: boolean }} [state]
   *   `speed` (m/s) e `sprinting` alimentam o balanço e o FOV.
   */
  update(dt, target, input, { flying = false, underground = false, sprinting = false, speed = 0, grounded = true } = {}) {
    if (input) this.applyInput(dt, input);
    this.updateFov(dt, sprinting && !flying);
    this.updateBob(dt, speed, sprinting, grounded && !flying);
    if (this.isFirstPerson) this.updateFirst(target);
    else this.updateThird(dt, target, flying, underground);
    if (this.kickAmount > 0) {
      this.camera.rotateX(-this.kickAmount);
      this.kickAmount = Math.max(0, this.kickAmount - dt * 0.9);
    }
    this.first = false;
  }

  /** FOV abre ao correr e fecha ao parar, sempre suave (lerp por tempo). */
  updateFov(dt, sprinting) {
    const target = sprinting ? this.config.sprintFov : this.config.fov;
    if (Math.abs(this.fov - target) < 0.01) return;
    this.fov = approach(this.fov, target, this.config.fovLerp, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Head bobbing: dois quiques por passo (um por pé) e um leve vaivém lateral.
   * Correndo, frequência e amplitude sobem. O resultado fica em `bobOffset`
   * (metros, eixo x = lateral da câmera).
   */
  updateBob(dt, speed, sprinting, grounded) {
    const b = this.isFirstPerson ? this.config.bob.first : this.config.bob.third;
    const moving = speed > 0.2 && grounded;
    const freq = sprinting ? b.runFreq : b.walkFreq;
    const amp = sprinting ? b.runAmp : b.walkAmp;
    this.bobStrength = approach(this.bobStrength, moving ? 1 : 0, moving ? 10 : 6, dt);
    if (moving) this.bobPhase += dt * freq * Math.PI * 2;
    else this.bobPhase = approach(this.bobPhase, Math.round(this.bobPhase / Math.PI) * Math.PI, 8, dt); // volta ao centro
    const a = amp * this.bobStrength;
    this.bobOffset.set(Math.sin(this.bobPhase) * a * b.sideRatio, -Math.abs(Math.sin(this.bobPhase)) * a, 0);
  }

  updateFirst(target) {
    const f = this.config.first;
    const cp = Math.cos(this.firstPitch);
    const dir = this._look.set(Math.sin(this.yaw) * cp, -Math.sin(this.firstPitch), Math.cos(this.yaw) * cp);
    const right = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.set(
      target.x + Math.sin(this.yaw) * f.forwardOffset,
      target.y + f.eyeHeight,
      target.z + Math.cos(this.yaw) * f.forwardOffset,
    ).addScaledVector(right, this.bobOffset.x);
    this.camera.position.y += this.bobOffset.y;
    this.camera.lookAt(dir.add(this.camera.position));
    this.focus.set(target.x, target.y + this.config.third.focusHeight, target.z);
  }

  updateThird(dt, target, flying, underground) {
    const t = this.config.third;
    this.maxDistance = flying ? t.flyMaxDistance : underground ? t.undergroundMaxDistance : t.maxDistance;
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance, this.minDistance, this.maxDistance);
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 8);

    const focusTarget = this._desired.set(target.x, target.y + t.focusHeight, target.z);
    if (this.first) this.focus.copy(focusTarget);
    this.focus.lerp(focusTarget, 1 - Math.exp(-14 * dt));

    const cp = Math.cos(this.pitch);
    const cam = this.camera.position;
    cam.set(
      this.focus.x - Math.sin(this.yaw) * cp * this.distance,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z - Math.cos(this.yaw) * cp * this.distance,
    );
    if (this.groundAt) {
      // Pé do jogador como referência: só conta o piso/plataforma do andar dele
      // (senão, no térreo de um sobrado, a câmera subia para cima da laje).
      const g = this.groundAt(cam.x, cam.z, target.y) + 0.4;
      if (cam.y < g) cam.y = g;
    }
    // Dentro de casa: a câmera recua até a parede/teto/divisória (sem atravessar),
    // encurta na hora e volta a se afastar suavemente — nada de pulos na porta.
    const reach = this.reach ? this.reach(this.focus, cam) : 1;
    const full = Math.max(cam.distanceTo(this.focus), 1e-6);
    const want = full * reach;
    if (this.first || want <= this.clipDistance || !this.clipped) this.clipDistance = want;
    else this.clipDistance = Math.min(want, approach(this.clipDistance, want, t.interior.returnSpeed, dt));
    this.clipped = reach < 1 || this.clipDistance < want - 0.01;
    if (this.clipDistance < full - 1e-6) cam.sub(this.focus).multiplyScalar(this.clipDistance / full).add(this.focus);
    cam.y += this.bobOffset.y;
    cam.addScaledVector(this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), this.bobOffset.x);
    this.camera.lookAt(this.focus);
  }

  /** Próximo `update` pula direto para a posição certa (sem suavizar). */
  snap() {
    this.first = true;
  }
}
