import * as THREE from 'three';
import { Humanoid } from './Humanoid.js';
import { PLAYER, WORLD } from '../config/worldConfig.js';
import { CLIMB, MOVE_SUBSTEP, SLOPE } from '../config/physics.js';
import { surfaceNormal, isUnwalkable, blockUphill, SlideState } from '../systems/physics/SlopePhysics.js';
import { applyGesture } from './NPCAgent.js';
import { wantsSprint, resolveMoveSpeed } from './Locomotion.js';
import { GAMEPLAY } from '../config/gameplay.js';
import { swimVerticalSpeed } from './Swimming.js';

/**
 * Personagem do jogador (1,80 m). Anda relativo à câmera, corre (Shift →
 * `sprinting`, velocidade × `PLAYER.sprintMultiplier`),
 * pula (Espaço), nada em água funda e colide com prédios/muros.
 * F = viagem rápida (multiplica a velocidade, para testar o mapa grande).
 *
 * Dependências injetadas: groundAt(x, z, pésY), collisions, state (PlayerState).
 * `pésY` deixa o chão ter vários andares (plataformas, pontes, escadas).
 */
export class Player {
  constructor({ groundAt, collisions, state, isUnderground, ladders = null, terrainAt = null }) {
    this.groundAt = groundAt;
    /** Só o relevo (sem pisos/pontes): normal da superfície e limite de 45°. */
    this.terrainAt = terrainAt;
    /** Limite de inclinação: normal sob os pés, escorregão e perda de aderência. */
    this.slope = { normal: { x: 0, y: 1, z: 0 }, steep: false, slipping: false, pushing: false, angle: 0 };
    this.slide = new SlideState();
    this._block = { dx: 0, dz: 0, uphill: false };
    this._skidT = 0;
    this._t = 0;
    /** Gancho: derrapou (correndo contra encosta íngreme ou começou a escorregar). */
    this.onSkid = null;
    /** Escadas de mão (Ladders): W anda contra ela → sobe. */
    this.ladders = ladders;
    this.climbing = null;
    /** Opcional: `{ canSprint(): boolean }` (Survival) — sem stamina, não corre. */
    this.stamina = null;
    this.collisions = collisions;
    this.state = state;
    this.isUnderground = isUnderground;
    this.model = new Humanoid({ height: PLAYER.height, skin: 0x6b4430, shirt: 0xc8a050, pants: 0x3a3a44, hat: null, build: 1.05 });
    this.root = this.model.root;
    this.position = this.root.position;
    this.velocity = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, 0, -1);
    this.grounded = true;
    this.swimming = false;
    this.fastTravel = false;
    this.flying = false;
    this.speed = 0;
    /** true enquanto corre (Shift + movendo). Lido pela câmera (FOV, balanço). */
    this.sprinting = false;
    /** Na água (nadando). A física de nado fica toda em `updateSwimming`. */
    this.swimming = false;
    /** Cabeça debaixo d'água (fôlego cai; tela azulada). */
    this.submerged = false;
    this._move = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    /** Chão sob um ponto, na altura atual dos pés (IK dos pés / inclinação na rampa). */
    this._ground = (x, z) => this.groundAt(x, z, this.position.y + 0.3);
  }

  teleport(x, z, facing = 0, y) {
    this.position.set(x, y ?? this.groundAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.slide?.reset();
    this.root.rotation.y = facing;
    this.facing.set(Math.sin(facing), 0, Math.cos(facing));
  }

  /**
   * Um quadro de controle do jogador.
   * @param {number} dt
   * @param {import('../core/Input.js').Input} input
   * @param {import('../core/CameraRig.js').CameraRig} camera direção do movimento (e inclinação, nadando em 1ª pessoa)
   */
  update(dt, input, camera) {
    const fwd = camera.forward(this._fwd);
    const right = this._right.set(-fwd.z, 0, fwd.x);
    const move = this._move.set(0, 0, 0);
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) move.add(fwd);
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) move.sub(fwd);
    if (input.isDown('KeyD')) move.add(right);
    if (input.isDown('KeyA')) move.sub(right);
    if (input.pressed('KeyF')) this.fastTravel = !this.fastTravel;
    if (input.pressed('KeyV') && !this.isUnderground()) {
      this.flying = !this.flying;
      this.velocity.set(0, 0, 0);
    }
    if (this.flying && this.isUnderground()) this.flying = false;
    if (this.flying) return this.updateFlying(dt, input, move);
    if (this.climbing) return this.updateClimbing(dt, input);
    // Agarra a escada: W (para frente) andando contra ela.
    if (this.ladders && (input.isDown('KeyW') || input.isDown('ArrowUp')) && move.lengthSq() > 0) {
      const dir = { x: move.x, z: move.z }, len = Math.hypot(dir.x, dir.z) || 1;
      dir.x /= len; dir.z /= len;
      const l = this.ladders.find(this.position, dir, CLIMB);
      if (l) return this.startClimbing(l);
    }

    const ground = this.groundAt(this.position.x, this.position.z, this.position.y);
    const underground = this.isUnderground();
    const surfaceY = WORLD.waterLevel - GAMEPLAY.swimming.surfaceDepth; // pés boiando na superfície
    // Entra na água quando o fundo fica mais baixo que a altura de boiar.
    this.swimming = !underground && ground < surfaceY - 0.05 && this.position.y <= surfaceY + 0.3;
    if (this.swimming) { this.slide.reset(); return this.updateSwimming(dt, input, move, camera, surfaceY); }
    this.submerged = false;
    this._t += dt;
    this._skidT = Math.max(0, this._skidT - dt);

    // Normal da superfície sob os pés (só no relevo; pisos, pontes e degraus não contam).
    const sl = this.slope;
    const onTerrain = !!this.terrainAt && !underground && Math.abs(ground - this.terrainAt(this.position.x, this.position.z)) < SLOPE.onTerrainEps;
    if (onTerrain) surfaceNormal(this.terrainAt, this.position.x, this.position.z, SLOPE.normalSample, sl.normal);
    else { sl.normal.x = 0; sl.normal.y = 1; sl.normal.z = 0; }
    // Vale também no ar: senão o passo seguinte "subiria" a encosta pelo encaixe no chão.
    sl.steep = onTerrain && isUnwalkable(sl.normal);
    sl.angle = Math.acos(sl.normal.y) * 57.2958;

    let moving = move.lengthSq() > 0;
    // Stamina (Survival): zerada, não corre até recuperar.
    this.sprinting = wantsSprint(input, moving, { swimming: this.swimming }) && (this.stamina?.canSprint() ?? true);
    const speed = resolveMoveSpeed(PLAYER, {
      sprinting: this.sprinting,
      swimming: this.swimming,
      modifier: this.state.modifier('speed'),
      fastTravel: this.fastTravel && !underground,
    });

    if (moving) {
      move.normalize(); // diagonal não é mais rápida
      this.facing.lerp(move, 1 - Math.exp(-12 * dt)).normalize();
      this.root.rotation.y = Math.atan2(this.facing.x, this.facing.z);
    }
    // Encosta > 45°: a parte do passo que sobe é anulada; correr contra ela = perde a aderência.
    let wx = move.x * speed * dt, wz = move.z * speed * dt;
    let pushingUp = false;
    if (sl.steep && moving && !this.fastTravel) {
      const b = blockUphill(wx, wz, sl.normal, this._block);
      wx = b.dx; wz = b.dz; pushingUp = b.uphill;
      if (pushingUp && this.sprinting) {
        this.sprinting = false;
        if (this._skidT <= 0) { this._skidT = SLOPE.skidCooldown; this.onSkid?.(sl.angle); }
      }
    }
    // Escorregamento: gravidade projetada no plano da encosta, até o chão firme.
    const wasSliding = this.slide.sliding;
    const sd = this.fastTravel ? this.slide.update(dt, sl.normal, false) : this.slide.update(dt, sl.normal, sl.steep && this.grounded);
    if (this.slide.sliding && !wasSliding && this._skidT <= 0) { this._skidT = SLOPE.skidCooldown; this.onSkid?.(sl.angle); }
    sl.slipping = this.slide.sliding;
    sl.pushing = pushingUp;
    if (sl.slipping) moving = Math.hypot(wx, wz) > 1e-4;
    // Sub-passos: correndo ou em viagem rápida não atravessa poste/cerca fina.
    const ox = this.position.x, oz = this.position.z;
    const oh = onTerrain ? this.terrainAt(ox, oz) : 0;
    this.collisions.move(this.position, wx + sd.dx, wz + sd.dz, PLAYER.radius, MOVE_SUBSTEP);
    // Trava de degrau: o passo não pode subir mais que tan(45°) × distância + um degrau pequeno.
    if (onTerrain && !this.fastTravel) {
      const d = Math.hypot(this.position.x - ox, this.position.z - oz);
      const rise = this.terrainAt(this.position.x, this.position.z) - Math.max(oh, this.position.y);
      if (rise > d * SLOPE.tanMax + SLOPE.stepHeight) { this.position.x = ox; this.position.z = oz; }
    }

    // Vertical
    const g = this.groundAt(this.position.x, this.position.z, this.position.y);
    if (this.swimming) {
      this.velocity.y = 0;
      this.position.y += (swimLevel - this.position.y) * Math.min(1, dt * 4);
      if (g > this.position.y) this.position.y = g;
      this.grounded = false;
    } else {
      if (this.grounded && !sl.slipping && input.pressed('Space')) { // escorregando não dá impulso
        this.velocity.y = PLAYER.jumpSpeed * this.state.modifier('jump'); // lama/frio: pulo fraco
        this.grounded = false;
      }
      this.velocity.y += PLAYER.gravity * dt;
      this.position.y += this.velocity.y * dt;
      // Desce degraus/encostas sem "voar" (snap até 0,6 m). Escorregando, fica colado à encosta.
      if (this.grounded && (this.position.y - g < 0.6 || sl.slipping) && this.velocity.y <= 0) this.position.y = g;
      if (this.position.y <= g) {
        this.position.y = g;
        this.velocity.y = 0;
        this.grounded = true;
      } else if (this.position.y - g > 0.6) {
        this.grounded = false;
      }
    }

    this.speed = moving && !sl.slipping ? speed : 0;
    this.model.update(dt, Math.min(this.speed, PLAYER.runSpeed), { swimming: this.swimming, sprinting: this.sprinting, grounded: this.grounded, ground: this._ground });
    // Sem aderência: braços abertos, tronco para trás (postura de desequilíbrio).
    if (sl.slipping || pushingUp) applyGesture(this.model, 'balance', this._t);
  }

  /**
   * Vira o personagem para `dir` (no chão) e anima o soco.
   * @param {THREE.Vector3} dir direção do golpe
   */
  startPunch(dir, duration) {
    this.facing.set(dir.x, 0, dir.z).normalize();
    this.root.rotation.y = Math.atan2(this.facing.x, this.facing.z);
    this.model.punch(duration);
  }

  /**
   * 1ª pessoa: o corpo olha sempre para onde a câmera olha.
   * @param {THREE.Vector3} dir direção no chão
   */
  faceDirection(dir) {
    this.facing.set(dir.x, 0, dir.z).normalize();
    this.root.rotation.y = Math.atan2(this.facing.x, this.facing.z);
  }

  /** Ponto de onde sai o soco: altura do ombro, um pouco à frente. */
  punchOrigin(out = new THREE.Vector3()) {
    return out.copy(this.position).addScaledVector(this.facing, 0.15).setY(this.position.y + 1.35);
  }

  /**
   * Física de nado (isolada do andar): sem pulo, metade da velocidade, sem
   * gravidade. Espaço sobe, Ctrl desce; em 1ª pessoa, andar para a frente
   * segue a inclinação da câmera (olhar para baixo = mergulhar). Sem comando
   * vertical, a flutuação traz o corpo de volta à superfície.
   */
  updateSwimming(dt, input, move, camera, surfaceY) {
    const cfg = GAMEPLAY.swimming;
    const speed = PLAYER.walkSpeed * cfg.speedMultiplier * this.state.modifier('speed');
    const moving = move.lengthSq() > 0;
    if (moving) {
      move.normalize();
      this.facing.lerp(move, 1 - Math.exp(-8 * dt)).normalize();
      this.root.rotation.y = Math.atan2(this.facing.x, this.facing.z);
    }
    const forward = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const vy = swimVerticalSpeed(cfg, {
      up: input.isDown('Space'),
      down: input.isDown('ControlLeft') || input.isDown('ControlRight'),
      forward,
      pitch: camera.isFirstPerson ? camera.firstPitch : 0,
      speed,
    });
    // Sub-passos: correndo ou em viagem rápida não atravessa poste/cerca fina.
    this.collisions.move(this.position, move.x * speed * dt, move.z * speed * dt, PLAYER.radius, MOVE_SUBSTEP);
    const floor = this.groundAt(this.position.x, this.position.z, this.position.y);
    this.position.y = Math.min(surfaceY, Math.max(floor, this.position.y + vy * dt));
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.sprinting = false;
    this.submerged = this.position.y < WORLD.waterLevel - cfg.submergedDepth;
    this.speed = moving ? speed : 0;
    this.model.update(dt, this.speed, { swimming: true });
  }

  /** Modo voo (V): sem gravidade/colisão. Espaço sobe, Ctrl desce, Shift acelera. */
  /** Entra no modo escada: sem gravidade, preso ao plano da escada. */
  startClimbing(l) {
    this.climbing = l;
    this.velocity.set(0, 0, 0);
    this.sprinting = false;
    // Vindo de cima, começa um pouco abaixo do topo (descendo).
    if (this.position.y > l.y1 - 0.5) this.position.y = l.y1 - 1.1;
    this.root.rotation.y = Math.atan2(-l.nx, -l.nz); // de frente para a escada
    this.facing.set(-l.nx, 0, -l.nz);
  }

  /**
   * Na escada: W sobe, S desce, Espaço solta. No topo sai para a plataforma
   * (`exit`); no pé, solta no chão. A gravidade volta ao sair.
   */
  updateClimbing(dt, input) {
    const l = this.climbing;
    const up = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    // Fica colado na frente da escada (sem atravessar a estrutura).
    const px = l.x + l.nx * 0.38, pz = l.z + l.nz * 0.38;
    this.position.x += (px - this.position.x) * Math.min(1, dt * 12);
    this.position.z += (pz - this.position.z) * Math.min(1, dt * 12);
    this.position.y += up * CLIMB.speed * dt;
    this.grounded = false;
    if (input.pressed('Space')) {
      this.climbing = null;
      this.position.x += l.nx * CLIMB.detachPush;
      this.position.z += l.nz * CLIMB.detachPush;
      this.velocity.y = 1.5;
    } else if (this.position.y >= l.y1 - 0.05) {
      this.climbing = null; // chegou: sai para a plataforma
      this.position.set(l.exit.x, l.exit.y, l.exit.z);
      this.grounded = true;
    } else if (this.position.y <= l.y0 && up < 0) {
      this.climbing = null;
      this.position.y = Math.max(l.y0, this.groundAt(this.position.x, this.position.z, this.position.y));
      this.grounded = true;
    }
    this.speed = up ? 1.2 : 0;
    this.model.update(dt, Math.abs(up) * 1.2, { swimming: false, sprinting: false, grounded: true });
  }

  updateFlying(dt, input, move) {
    let speed = PLAYER.flySpeed;
    if (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) speed *= PLAYER.flyBoost;
    if (move.lengthSq() > 0) {
      move.normalize();
      this.facing.lerp(move, 1 - Math.exp(-8 * dt)).normalize();
      this.root.rotation.y = Math.atan2(this.facing.x, this.facing.z);
    }
    let up = 0;
    if (input.isDown('Space')) up += 1;
    if (input.isDown('ControlLeft') || input.isDown('ControlRight')) up -= 1;
    this.position.x += move.x * speed * dt;
    this.position.z += move.z * speed * dt;
    this.position.y += up * speed * 0.6 * dt;
    const g = this.groundAt(this.position.x, this.position.z, this.position.y);
    this.position.y = Math.min(PLAYER.flyMaxHeight, Math.max(this.position.y, Math.max(g, WORLD.waterLevel) + 0.3));
    this.swimming = false;
    this.grounded = false;
    this.speed = 0;
    this.sprinting = false;
    this.model.update(dt, 0, { flying: true }); // corpo esticado, braços à frente
  }
}
