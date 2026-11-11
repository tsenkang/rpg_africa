import * as THREE from 'three';
import { LIMBS, WOUNDS, INSPECTION } from '../config/survival.js';
import { ITEMS } from '../systems/PlayerState.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/**
 * Modo de Inspeção Corporal 3D (tecla C). O jogo congela o personagem, a
 * câmera foca no corpo real (Humanoid) e o jogador escolhe um dos 4 membros
 * (botões ou teclas 1–4; 5 = corpo inteiro). Arrastar com o mouse (ou Q/E e
 * setas) gira o membro para ver todos os lados.
 *
 * Os ferimentos são as malhas do WoundVisuals presas ao membro:
 * - sanguessuga: clique e PUXE (≥ `leechPullPixels`) para arrancar;
 * - demais: clique abre as opções de tratamento; ou arraste o remédio
 *   certo da mochila (painel lateral) e solte em cima da ferida.
 *
 * Só exibe e pede ações ao jogo: `survival.body.treat`, `state.removeItem`.
 *
 * @example
 * const insp = new BodyInspection(game);
 * insp.open(); insp.selectLimb('pernaE'); // no loop: insp.update(dt, input)
 */
export class BodyInspection {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.limb = null;
    this.spin = 0;
    this.tilt = 0;
    this.baseQ = new THREE.Quaternion();
    this.joint = null;
    this.saved = [];
    this.drag = null;
    this.hoverId = null;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.camTarget = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this._badgeTimer = 0;

    this.layer = el('div', 'inspect hidden', game.ui.root);
    this.layer.innerHTML = `
      <div class="inspect-top"><b>🔍 Inspeção corporal</b>
        <span>arraste para girar o membro · <b>sanguessuga</b>: clique e puxe · <b>ferida</b>: clique ou solte um remédio da mochila em cima · <kbd>1</kbd>–<kbd>5</kbd> membros · <kbd>C</kbd>/<kbd>Esc</kbd> fecha</span></div>
      <div class="inspect-limbs">
        ${Object.entries(LIMBS).map(([id, l], i) => `<button data-limb="${id}"><kbd>${i + 1}</kbd>${l.name}<em></em></button>`).join('')}
        <button data-limb=""><kbd>5</kbd>Corpo inteiro<em></em></button>
      </div>
      <div class="inspect-tip hidden"></div>
      <div class="inspect-popup hidden"></div>`;
    this.tip = this.layer.querySelector('.inspect-tip');
    this.popup = this.layer.querySelector('.inspect-popup');
    this.layer.querySelector('.inspect-limbs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-limb]');
      if (b) this.selectLimb(b.dataset.limb || null);
    });
    this.popup.addEventListener('click', (e) => {
      const b = e.target.closest('[data-item]');
      if (b && !b.disabled) this.applyTreatment(+b.dataset.wound, b.dataset.item);
      if (e.target.closest('.close')) this.popup.classList.add('hidden');
    });
    this.layer.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    this.layer.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------ abrir/fechar

  open() {
    if (this.active) return;
    const g = this.game, m = g.player.model;
    this.active = true;
    g.input.unlock();
    this.saved = [...m.arms, ...m.elbows, ...m.legs, ...m.knees].map((j) => [j, j.quaternion.clone()]);
    g.player.root.visible = true;
    g.fpArm.root.visible = false;
    this.layer.classList.remove('hidden');
    g.ui.root.classList.add('inspecting');
    g.backpack.show('dock');
    g.backpack.onDrop = (id, x, y) => this.dropItem(id, x, y);
    g.backpack.onDragMove = (id, x, y) => this.hover(x, y);
    this.snap = true;
    this.selectLimb(this.firstWoundedLimb());
    this.refreshBadges();
  }

  close() {
    if (!this.active) return;
    const g = this.game;
    for (const [j, q] of this.saved) j.quaternion.copy(q);
    this.saved = [];
    if (this.drag?.kind === 'pull') g.woundVisuals.stretch(this.drag.id, 0);
    this.drag = null;
    this.layer.classList.add('hidden');
    this.popup.classList.add('hidden');
    this.tip.classList.add('hidden');
    g.ui.root.classList.remove('inspecting');
    g.backpack.onDrop = g.backpack.onDragMove = null;
    g.backpack.hide();
    g.applyCameraMode();
    g.cameraRig.snap();
    this.active = false;
  }

  firstWoundedLimb() {
    const w = this.game.survival.body.wounds[0];
    return w ? w.limb : null;
  }

  /**
   * Foca um membro (ou o corpo inteiro com `null`): pose erguida, câmera
   * perto, giro zerado.
   * @param {keyof typeof LIMBS | null} id
   */
  selectLimb(id) {
    for (const [j, q] of this.saved) j.quaternion.copy(q);
    this.limb = id;
    this.spin = 0;
    this.tilt = 0;
    this.joint = null;
    this.popup.classList.add('hidden');
    const m = this.game.player.model;
    if (id) {
      const L = LIMBS[id], i = L.side < 0 ? 0 : 1;
      if (L.arm) {
        this.joint = m.arms[i];
        this.baseQ.setFromEuler(_e.set(INSPECTION.armPose.tilt, 0, L.side * INSPECTION.armPose.raise));
        m.elbows[i].quaternion.identity();
      } else {
        this.joint = m.legs[i];
        this.baseQ.setFromEuler(_e.set(INSPECTION.legPose.lift, 0, 0));
        m.knees[i].quaternion.identity();
      }
    }
    for (const b of this.layer.querySelectorAll('[data-limb]')) b.classList.toggle('active', (b.dataset.limb || null) === id);
    this.applyPose();
  }

  applyPose() {
    if (!this.joint) return;
    _q1.setFromEuler(_e.set(this.tilt, 0, 0));
    _q2.setFromEuler(_e.set(0, this.spin, 0));
    this.joint.quaternion.copy(this.baseQ).multiply(_q1).multiply(_q2);
  }

  /** Contagem de ferimentos por membro nos botões. */
  refreshBadges() {
    const body = this.game.survival.body;
    for (const b of this.layer.querySelectorAll('[data-limb]')) {
      const id = b.dataset.limb;
      const n = id ? body.onLimb(id).length : body.wounds.length;
      const open = id ? body.onLimb(id).some((w) => !w.bandage) : body.wounds.some((w) => !w.bandage);
      b.querySelector('em').textContent = n || '';
      b.classList.toggle('hurt', open);
    }
  }

  // ------------------------------------------------------------ loop

  /**
   * Um quadro: giro por teclado, pose do membro, câmera suave até o alvo.
   * @param {number} dt
   * @param {import('../core/Input.js').Input} input
   */
  update(dt, input) {
    const cfg = INSPECTION;
    const turn = (input.isDown('KeyE') || input.isDown('ArrowRight') ? 1 : 0) - (input.isDown('KeyQ') || input.isDown('ArrowLeft') ? 1 : 0);
    const pitch = (input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('ArrowDown') ? 1 : 0);
    if (turn) this.spin += turn * 2.2 * dt;
    if (pitch) this.tilt = THREE.MathUtils.clamp(this.tilt + pitch * 1.4 * dt, -cfg.maxTilt, cfg.maxTilt);
    this.applyPose();
    const g = this.game, m = g.player.model, root = m.root;
    root.updateMatrixWorld(true);
    _fwd.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    let dist;
    if (this.limb) {
      const L = LIMBS[this.limb], i = L.side < 0 ? 0 : 1;
      (L.arm ? m.arms[i] : m.legs[i]).getWorldPosition(_a);
      (L.arm ? m.hands[i] : m.feet[i]).getWorldPosition(_b);
      this.lookTarget.addVectors(_a, _b).multiplyScalar(0.5);
      dist = L.arm ? cfg.camera.arm : cfg.camera.leg;
    } else {
      m.torso.getWorldPosition(this.lookTarget);
      this.lookTarget.y += 0.1;
      dist = cfg.camera.body;
    }
    this.camTarget.copy(this.lookTarget).addScaledVector(_fwd, dist);
    this.camTarget.y += 0.04;
    const k = this.snap ? 1 : 1 - Math.exp(-cfg.camera.lerp * dt);
    this.snap = false;
    g.camera.position.lerp(this.camTarget, k);
    this.look.lerp(this.lookTarget, k);
    g.camera.lookAt(this.look);
    this._badgeTimer += dt;
    if (this._badgeTimer > 0.5) { this._badgeTimer = 0; this.refreshBadges(); }
  }

  // ------------------------------------------------------------ mouse

  /** Ferimento sob o ponto da tela (id) ou null. */
  pick(x, y) {
    this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.game.camera);
    const hits = this.ray.intersectObjects(this.game.woundVisuals.pickables(), false);
    return hits.length ? hits[0].object.userData.woundId : null;
  }

  hover(x, y) {
    const id = this.pick(x, y);
    this.hoverId = id;
    this.layer.classList.toggle('over-wound', !!id);
    if (!id) { this.tip.classList.add('hidden'); return; }
    const w = this.game.survival.body.get(id), def = WOUNDS[w.type];
    const how = w.type === 'sanguessuga' ? 'clique e puxe' : w.bandage ? 'coberta — cicatrizando' : `trata com: ${Object.keys(def.treat ?? {}).map((k) => (k === 'maos' ? 'as mãos' : ITEMS[k]?.name ?? k)).join(', ')}`;
    this.tip.innerHTML = `${def.icon} <b>${def.name}</b> · ${LIMBS[w.limb].name}<br><small>${how}</small>`;
    this.tip.style.left = `${Math.min(x + 16, window.innerWidth - 280)}px`;
    this.tip.style.top = `${y + 16}px`;
    this.tip.classList.remove('hidden');
  }

  onDown(e) {
    if (!this.active || e.button !== 0 || e.target.closest('.inspect-limbs, .inspect-popup, .inspect-top')) return;
    e.preventDefault();
    this.popup.classList.add('hidden');
    const id = this.pick(e.clientX, e.clientY);
    const w = id && this.game.survival.body.get(id);
    this.drag = w?.type === 'sanguessuga' && !w.bandage
      ? { kind: 'pull', id, x: e.clientX, y: e.clientY }
      : { kind: 'spin', id, x: e.clientX, y: e.clientY, moved: false };
  }

  onMove(e) {
    if (!this.active) return;
    const d = this.drag;
    if (!d) { if (!e.target.closest?.('.backpack')) this.hover(e.clientX, e.clientY); return; }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.kind === 'pull') {
      const dist = Math.hypot(dx, dy);
      this.game.woundVisuals.stretch(d.id, Math.min(0.05, dist * 0.0007));
      if (dist >= INSPECTION.leechPullPixels) {
        this.game.woundVisuals.stretch(d.id, 0);
        this.drag = null;
        this.applyTreatment(d.id, 'maos');
      }
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    this.spin += dx * INSPECTION.spinPerPixel;
    this.tilt = THREE.MathUtils.clamp(this.tilt + dy * INSPECTION.tiltPerPixel, -INSPECTION.maxTilt, INSPECTION.maxTilt);
    d.x = e.clientX; d.y = e.clientY;
  }

  onUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!this.active || !d) return;
    if (d.kind === 'pull') { this.game.woundVisuals.stretch(d.id, 0); return; }
    if (!d.moved && d.id) this.openPopup(d.id, e.clientX, e.clientY);
  }

  /** Opções de tratamento de um ferimento (teclado/gamepad: botões focáveis). */
  openPopup(id, x, y) {
    const g = this.game, w = g.survival.body.get(id);
    if (!w) return;
    const def = WOUNDS[w.type];
    const rows = Object.keys(def.treat ?? {}).map((k) => {
      if (k === 'maos') return `<button data-item="maos" data-wound="${id}">✋ Puxar com a mão</button>`;
      const n = g.state.inventory.get(k) ?? 0, d = ITEMS[k];
      return `<button data-item="${k}" data-wound="${id}" ${n ? '' : 'disabled'}>${d.icon} ${d.name} ${n ? `×${n}` : '<small>(não tem)</small>'}</button>`;
    });
    const dirty = g.survival.dirty ? '<div class="warn">⚠ Pele suja: enfaixar agora tem alta chance de infecção. Lave-se no rio ou na chuva.</div>' : '';
    this.popup.innerHTML = `<div class="head">${def.icon} <b>${def.name}</b> · ${LIMBS[w.limb].name}<button class="close">×</button></div>
      ${w.bandage ? '<p>Coberta. Vai cicatrizar sozinha.</p>' : `<p>${hintFor(w.type)}</p>${dirty}<div class="opts">${rows.join('')}</div>`}`;
    this.popup.style.left = `${Math.min(x + 10, window.innerWidth - 340)}px`;
    this.popup.style.top = `${Math.min(y + 10, window.innerHeight - 260)}px`;
    this.popup.classList.remove('hidden');
    this.popup.querySelector('button:not([disabled])')?.focus();
  }

  /** Aplica `item` ('maos' = mão) no ferimento `id`; consome o item se não for ferramenta. */
  applyTreatment(id, item) {
    const g = this.game, s = g.survival;
    const r = s.body.treat(id, item, { dirt: s.dirt });
    if (!r.ok) { g.ui.toast(r.message); return false; }
    if (item !== 'maos' && !ITEMS[item]?.tool) g.state.removeItem(item);
    g.ui.toast(r.message + (['bandage', 'suture', 'antivenom'].includes(r.action) && s.dirty ? ' Você fez isso com a pele suja…' : ''));
    this.popup.classList.add('hidden');
    this.tip.classList.add('hidden');
    this.refreshBadges();
    return true;
  }

  /** Remédio arrastado da mochila e solto sobre a tela. */
  dropItem(itemId, x, y) {
    const wid = this.pick(x, y);
    if (!wid) { this.game.ui.toast('Solte o remédio em cima da ferida.'); return; }
    this.applyTreatment(wid, itemId);
  }
}

function hintFor(type) {
  return {
    arranhao: 'Cobrir com um curativo evita infecção.',
    laceracao: 'Sangra. Costure com formigas ou enfaixe rápido — de preferência com cinza ou mel.',
    limpa: 'Tecido morto removido. Cubra com um curativo.',
    infeccao: 'Pus e tecido necrosado. Larvas de carne comem só o que está morto.',
    veneno: 'Veneno circulando. Curativo de tabaco ou de lírio neutraliza.',
    sanguessuga: 'Clique nela e puxe para fora.',
    larva: 'Elevação na pele. A agulha de osso fura e puxa a larva.',
  }[type] ?? '';
}
