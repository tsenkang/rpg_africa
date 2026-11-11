import * as THREE from 'three';

const _v = new THREE.Vector3();

/**
 * Balões de fala sobre a cabeça dos moradores (HTML posicionado pela
 * projeção 3D → tela a cada quadro). Somem sozinhos; um balão por morador.
 *
 * @example
 * const sb = new SpeechBubbles(ui.root);
 * sb.say(agent, 'Bom dia, vizinho!', 2.6);
 * sb.update(camera, dt); // no loop
 */
export class SpeechBubbles {
  constructor(root) {
    this.root = document.createElement('div');
    this.root.className = 'speech-bubbles';
    root.appendChild(this.root);
    this.items = new Map(); // agente → { el, left }
  }

  /**
   * @param {object} agent NPCAgent (precisa de `model` e `look.height`)
   * @param {string} text
   * @param {number} seconds
   * @param {'fala'|'alerta'|'medo'} [kind]
   */
  say(agent, text, seconds = 2.6, kind = 'fala') {
    let it = this.items.get(agent);
    if (!it) {
      const el = document.createElement('div');
      this.root.appendChild(el);
      it = { el, left: 0 };
      this.items.set(agent, it);
    }
    it.el.className = `bubble ${kind}`;
    it.el.textContent = text;
    it.left = seconds;
  }

  /** Posiciona e envelhece os balões. */
  update(camera, dt) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const [agent, it] of this.items) {
      it.left -= dt;
      const m = agent.model;
      if (it.left <= 0 || !m || !agent.rendered) {
        it.el.remove();
        this.items.delete(agent);
        continue;
      }
      _v.copy(m.root.position);
      _v.y += (agent.look.height ?? 1.75) + 0.35;
      _v.project(camera);
      const visible = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      it.el.style.display = visible ? '' : 'none';
      if (!visible) continue;
      it.el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -100%)`;
      it.el.style.opacity = Math.min(1, it.left * 2).toFixed(2);
    }
  }
}
