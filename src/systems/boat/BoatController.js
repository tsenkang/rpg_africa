import * as THREE from 'three';
import { BOAT } from '../../config/boat.js';
import { WORLD } from '../../config/worldConfig.js';
import { BoatPhysics } from './BoatPhysics.js';
import { buildBoatModel } from '../../render/boat/BoatModel.js';

/**
 * Barco pilotável no jogo (Etapa A3): física + modelo + água da GPU + controles.
 *
 * - **Água**: cada ponto do casco (e a hélice) tem um slot no `WaterQuery`. Os resultados
 *   chegam 1–3 quadros depois, então os pontos pedidos ficam adiantados pela velocidade
 *   do barco × atraso, e a altura é extrapolada com dh/dt até o passo da física [Tidewater].
 * - **Controles** (pilotando): W/S movem a alavanca (motor acompanha com atraso), A/D o leme,
 *   E sai do barco. Perto do barco: E embarca.
 * - **Sono**: longe do jogador (> 300 m) a física para.
 *
 * @example
 *   const boat = new BoatController(game);
 *   boat.update(dt, input);   // a cada quadro, antes do jogador
 */
export class BoatController {
  /** @param {object} game Game (water, terrain, player, scene, interactions, ui) */
  constructor(game, cfg = BOAT) {
    this.game = game;
    this.cfg = cfg;
    const spot = findMooring(game, cfg);
    this.home = spot;
    this.physics = new BoatPhysics(cfg, spot);
    this.model = buildBoatModel(cfg);
    game.scene.add(this.model.group);
    this.model.group.userData.noCollide = true;
    this.piloting = false;
    this.throttle = 0; // posição da alavanca −1..1
    this.steer = 0;
    // slots de consulta da água: pontos do casco + hélice
    const q = game.water.query;
    this.slots = q ? this.physics.samples.map(() => q.alloc()) : [];
    this.propSlot = q ? q.alloc() : -1;
    this.points = [];
    this._propLocal = new THREE.Vector3(...cfg.engine.position);
    this._p = new THREE.Vector3();
    this._helm = new THREE.Vector3(...cfg.helm);
    this._exit = new THREE.Vector3(...cfg.exit);
    this.latency = 0.05;
    this.water = (x, z) => this.waterAt(x, z);
    this.ground = (x, z) => game.terrain.heightAt(x, z);
    this.board = game.interactions.register({
      id: 'boat', label: 'Pilotar o barco', radius: cfg.controls.boardRadius,
      position: () => this.physics.renderPosition, onInteract: (g) => g.boat.enter(),
    });
    this.hud = makeHud(game.ui?.root ?? document.body);
    this.sync();
  }

  /**
   * Altura e velocidade vertical da água no ponto (o slot mais próximo, extrapolado).
   * Sem oceano FFT: água parada no nível do mundo.
   */
  waterAt(x, z) {
    const q = this.game.water.query;
    if (!q || !q.valid) return { h: WORLD.waterLevel, vy: 0 };
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return { h: WORLD.waterLevel, vy: 0 };
    const slot = best < this.slots.length ? this.slots[best] : this.propSlot;
    const t = this.game.water.ocean.time;
    return { h: q.height(slot, t), vy: Math.max(-4, Math.min(4, q.rates[slot])) };
  }

  /** Pede a altura da água nos pontos onde o casco estará quando a resposta chegar. */
  requestWater() {
    const q = this.game.water.query;
    if (!q) return;
    const ph = this.physics, lead = this.latency;
    ph.samplePoints(this.points);
    this.points.length = this.slots.length;
    this.points[this.slots.length] = ph.toWorld(this._propLocal, this.points[this.slots.length] ?? new THREE.Vector3());
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const slot = i < this.slots.length ? this.slots[i] : this.propSlot;
      q.set(slot, p.x + ph.v.x * lead, p.z + ph.v.z * lead);
    }
  }

  /** Recoloca o barco parado num ponto (ancoragem, testes, socorro). */
  placeAt(x, z, yaw = 0) {
    this.physics = new BoatPhysics(this.cfg, { x, z, yaw });
    this.sync();
  }

  /** Jogador assume o leme. */
  enter() {
    this.piloting = true;
    this.throttle = 0;
    this.board.enabled = false;
    this.game.ui?.toast?.('Pilotando: W/S alavanca · A/D leme · E sai do barco');
  }

  /** Jogador sai: vai para a borda do barco (ou o píer/terra mais próxima). */
  exit() {
    this.piloting = false;
    this.throttle = 0;
    this.steer = 0;
    this.board.enabled = true;
    const p = this.physics.toWorld(this._exit, this._p);
    const pl = this.game.player;
    pl.teleport(p.x, p.z, pl.facing ? Math.atan2(pl.facing.x, pl.facing.z) : 0, Math.max(p.y, this.game.terrain.heightAt(p.x, p.z)));
  }

  /**
   * @param {number} dt
   * @param {object} input Input do jogo (isDown/pressed)
   */
  update(dt, input) {
    const g = this.game, ph = this.physics, c = this.cfg.controls;
    const near = Math.hypot(g.player.position.x - ph.com.x, g.player.position.z - ph.com.z) < 300;
    if (!near && !this.piloting) { this.hud.style.display = 'none'; return; }
    if (this.piloting && input) {
      const up = input.isDown('KeyW') || input.isDown('ArrowUp'), down = input.isDown('KeyS') || input.isDown('ArrowDown');
      this.throttle = Math.max(-1, Math.min(1, this.throttle + (up - down) * c.throttleRate * dt));
      if (!up && !down && Math.abs(this.throttle) < 0.04) this.throttle = 0; // ponto morto
      this.steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) - (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);
      if (input.pressed('KeyE')) { this.exit(); input.consume?.('KeyE'); }
    } else { this.steer = 0; this.throttle = 0; }
    this.requestWater();
    ph.update(dt, { throttle: this.throttle, steer: this.steer }, { water: this.water, ground: this.ground });
    this.sync(dt);
    if (this.piloting) this.placePilot();
    this.updateHud();
  }

  /** Copia a pose interpolada para o modelo. */
  sync(dt = 0) {
    const ph = this.physics, m = this.model;
    m.group.position.copy(ph.renderPosition);
    m.group.quaternion.copy(ph.renderQuaternion);
    m.setRudder(ph.rudder);
    m.spin(dt, ph.rpm, this.game.time ?? 0);
  }

  /** Jogador em pé no leme, acompanhando o balanço. */
  placePilot() {
    const pl = this.game.player, ph = this.physics;
    const p = this._p.copy(this._helm).applyQuaternion(ph.renderQuaternion).add(ph.renderPosition);
    pl.position.copy(p);
    pl.velocity?.set(0, 0, 0);
    const yaw = ph.angles().yaw;
    pl.facing?.set(Math.sin(yaw), 0, Math.cos(yaw));
    if (pl.root) { pl.root.position.copy(p); pl.root.rotation.y = yaw; }
    pl.swimming = false;
    pl.model?.update?.(0, 0);
  }

  updateHud() {
    const ph = this.physics, h = this.hud;
    h.style.display = this.piloting ? '' : 'none';
    if (!this.piloting) return;
    const kn = ph.speed * 1.944;
    const lever = Math.round(this.throttle * 100);
    h.querySelector('.bh-speed').textContent = `${Math.abs(kn).toFixed(1)} nós${ph.speed < -0.05 ? ' (ré)' : ''}`;
    h.querySelector('.bh-lever').textContent = lever === 0 ? 'ponto morto' : `${lever > 0 ? 'frente' : 'ré'} ${Math.abs(lever)}%`;
    h.querySelector('.bh-bar i').style.width = `${Math.abs(lever)}%`;
    h.querySelector('.bh-bar').classList.toggle('rev', lever < 0);
    const a = ph.angles();
    h.querySelector('.bh-att').textContent = `proa ${(a.pitch * 57.3).toFixed(0)}° · banda ${(a.roll * 57.3).toFixed(0)}°${ph.grounded ? ' · encalhado' : ''}`;
  }
}

/** Ponto de água funda (≥ minDepth) mais perto do centro da vila, com terra perto (margem). */
export function findMooring(game, cfg = BOAT) {
  const v = game.villages?.[cfg.mooring.village] ?? { x: 0, z: 0 };
  const T = game.terrain, R = cfg.mooring.searchRadius;
  let best = null, bd = Infinity;
  for (let x = v.x - R; x <= v.x + R; x += 6) {
    for (let z = v.z - R; z <= v.z + R; z += 6) {
      const d = WORLD.waterLevel - T.heightAt(x, z);
      if (d < cfg.mooring.minDepth) continue;
      // folga: água funda num raio de 6 m (cabe o barco)
      let ok = true;
      for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) if (WORLD.waterLevel - T.heightAt(x + dx, z + dz) < 1) ok = false;
      if (!ok) continue;
      const dist = Math.hypot(x - v.x, z - v.z);
      if (dist < bd) { bd = dist; best = { x, z, yaw: Math.atan2(v.x - x, v.z - z) + Math.PI / 2 }; }
    }
  }
  return best ?? { x: v.x, z: v.z + 40, yaw: 0 };
}

function makeHud(root) {
  const el = document.createElement('div');
  el.className = 'boat-hud';
  el.style.display = 'none';
  el.innerHTML = `<div class="bh-speed">0 nós</div><div class="bh-bar"><i></i></div><div class="bh-lever">ponto morto</div><div class="bh-att"></div><div class="bh-keys">W/S alavanca · A/D leme · E sair</div>`;
  if (!document.getElementById('boat-hud-css')) {
    const st = document.createElement('style');
    st.id = 'boat-hud-css';
    st.textContent = `.boat-hud{position:fixed;right:24px;bottom:200px;min-width:220px;padding:10px 14px;border-radius:12px;
background:rgba(20,22,26,.62);color:#f2efe8;font:13px/1.35 Inter,system-ui,sans-serif;text-align:center;backdrop-filter:blur(6px);pointer-events:none;z-index:20}
.boat-hud .bh-speed{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
.boat-hud .bh-bar{height:5px;margin:6px 0 4px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden}
.boat-hud .bh-bar i{display:block;height:100%;width:0;background:#e9b45a}
.boat-hud .bh-bar.rev i{background:#7fb2d9}
.boat-hud .bh-lever,.boat-hud .bh-att{opacity:.85;font-variant-numeric:tabular-nums}
.boat-hud .bh-keys{margin-top:4px;opacity:.55;font-size:11px}`;
    document.head.appendChild(st);
  }
  root.appendChild(el);
  return el;
}
