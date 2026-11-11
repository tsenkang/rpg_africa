import { icon } from './Icons.js';

/**
 * Aviso discreto acima da hotbar quando o jogador perde a aderência numa encosta
 * acima do limite (escorregando ou tentando subir). Só mostra; quem decide é o Player.
 *
 * @example
 *   const hint = new SlopeHint(ui.root);
 *   hint.update(player.slope); // { slipping, pushing, angle } a cada quadro
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

  /** @param {{ slipping: boolean, pushing: boolean, angle: number }} s */
  update(s) {
    const on = s.slipping || s.pushing;
    const key = on ? `${s.slipping ? 'e' : 'i'}${Math.round(s.angle / 5)}` : '';
    if (key === this._key) return;
    this._key = key;
    this.el.classList.toggle('show', on);
    if (on) this.text.textContent = `${s.slipping ? 'Escorregando' : 'Íngreme demais para subir'} · ${Math.round(s.angle)}°`;
  }
}
