import { icon } from './Icons.js';

/**
 * Aviso discreto acima da hotbar: encosta acima do limite (escorregando ou
 * tentando subir) e efeitos de golpes de animais (preso, atordoado, lento).
 * Só mostra; quem decide é o Player.
 *
 * @example
 *   const hint = new SlopeHint(ui.root);
 *   hint.update(player.slope, player.status); // a cada quadro
 */
export class SlopeHint {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'slope-hint';
    this.el.innerHTML = `${icon('warn')}<span></span>`;
    this.text = this.el.lastChild;
    root.appendChild(this.el);
    this._key = '';
  }

  /**
   * @param {{ slipping: boolean, pushing: boolean, angle: number }} s encosta
   * @param {import('../systems/fauna/StatusEffects.js').StatusEffects} [fx] efeitos de golpes de animais
   */
  update(s, fx = null) {
    // Prioridade: preso > atordoado > encosta > lento.
    let text = '', danger = false;
    if (fx?.pinned) { text = 'Preso! O animal te segura'; danger = true; }
    else if (fx?.stunned) { text = 'Atordoado'; danger = true; }
    else if (s.slipping || s.pushing) text = `${s.slipping ? 'Escorregando' : 'Íngreme demais para subir'} · ${Math.round(s.angle / 5) * 5}°`;
    else if (fx && fx.speedFactor < 1) text = 'Mordida no calcanhar · mais lento';
    const key = `${text}|${danger}`;
    if (key === this._key) return;
    this._key = key;
    this.el.classList.toggle('show', !!text);
    this.el.classList.toggle('danger', danger);
    if (text) this.text.textContent = text;
  }
}
