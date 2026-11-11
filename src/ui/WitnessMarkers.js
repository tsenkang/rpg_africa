import * as THREE from 'three';
import { icon } from './Icons.js';

const _v = new THREE.Vector3();

/**
 * Selo de "testemunha" (olho) sobre a cabeça de quem viu um crime e está
 * correndo até a guarda. Mostra também a distância até o jogador, para ele
 * decidir se dá tempo de interceptar.
 *
 * @example
 *   const marks = new WitnessMarkers(ui.root);
 *   marks.update(camera, witnessSystem.entries.keys(), player.position); // no loop
 */
export class WitnessMarkers {
  constructor(root) {
    this.root = document.createElement('div');
    this.root.className = 'witness-marks';
    root.appendChild(this.root);
    /** @type {Map<object, HTMLElement>} */
    this.items = new Map();
  }

  /**
   * @param {THREE.Camera} camera
   * @param {Iterable<object>} agents testemunhas ativas (NPCAgent)
   * @param {{ x: number, z: number }} player
   */
  update(camera, agents, player) {
    const w = window.innerWidth, h = window.innerHeight, seen = new Set();
    for (const a of agents) {
      seen.add(a);
      let el = this.items.get(a);
      if (!el) {
        el = document.createElement('div');
        el.className = 'witness-mark';
        el.innerHTML = `<span class="wm-badge">${icon('eye')}</span><span class="wm-dist"></span>`;
        this.root.appendChild(el);
        this.items.set(a, el);
      }
      const m = a.model;
      if (!m || !a.rendered) { el.style.display = 'none'; continue; }
      _v.copy(m.root.position);
      _v.y += (a.look?.height ?? 1.75) + 0.95; // acima do balão de fala
      _v.project(camera);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      el.style.display = vis ? '' : 'none';
      if (!vis) continue;
      el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -100%)`;
      el.lastChild.textContent = `${Math.round(Math.hypot(a.pos.x - player.x, a.pos.z - player.z))} m`;
    }
    for (const [a, el] of this.items) if (!seen.has(a)) { el.remove(); this.items.delete(a); }
  }
}
