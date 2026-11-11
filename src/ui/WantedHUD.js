import { icon } from './Icons.js';

/**
 * Selo de PROCURADO na coluna de status (abaixo do painel de vida):
 * vila, recompensa e, durante a busca, a barra de fuga.
 * Só mostra o que recebe — quem decide é o BountyManager.
 *
 * @example
 *   const hud = new WantedHUD(ui.root, ui.vitals);
 *   hud.update({ village: 'Vila Renascimento', bounty: 350, search: { escape: 0.4 } });
 *   hud.update(null); // esconde
 */
export class WantedHUD {
  /**
   * @param {HTMLElement} root camada da interface
   * @param {HTMLElement} [anchor] painel acima do selo (posiciona logo abaixo dele)
   */
  constructor(root, anchor = null) {
    this.anchor = anchor;
    this.el = document.createElement('div');
    this.el.className = 'wanted hidden';
    this.el.innerHTML = `
      <div class="wd-top"><span class="wd-ic">${icon('alert')}</span><b>PROCURADO</b><span class="wd-village"></span></div>
      <div class="wd-bounty">Recompensa <b></b></div>
      <div class="wd-search"><div class="wd-label"></div><div class="wd-bar"><i></i></div></div>`;
    root.appendChild(this.el);
    this.village = this.el.querySelector('.wd-village');
    this.bounty = this.el.querySelector('.wd-bounty b');
    this.search = this.el.querySelector('.wd-search');
    this.label = this.el.querySelector('.wd-label');
    this.bar = this.el.querySelector('.wd-bar i');
    this._key = '';
  }

  /**
   * @param {null | { village: string, bounty: number, search: null | { escape: number, seen?: boolean } }} s
   */
  update(s) {
    if (!s) { if (this._key !== '') { this.el.classList.add('hidden'); this._key = ''; } return; }
    const pct = s.search ? Math.round(s.search.escape * 100) : -1;
    const key = `${s.village}|${s.bounty}|${pct}|${s.search?.seen ? 1 : 0}`;
    if (key === this._key) return;
    if (this._key === '' && this.anchor) this.el.style.top = `${this.anchor.offsetTop + this.anchor.offsetHeight + 10}px`;
    this._key = key;
    this.el.classList.remove('hidden');
    this.village.textContent = s.village;
    this.bounty.textContent = `${s.bounty.toLocaleString('pt-BR')} moedas`;
    this.el.classList.toggle('searching', !!s.search);
    this.bar.parentElement.style.display = s.search ? '' : 'none';
    if (!s.search) this.label.textContent = 'Pague ao Comandante da Guarda, na praça, para limpar a ficha.';
    if (s.search) {
      this.label.textContent = s.search.seen ? 'Guarda te vendo · busca reiniciada' : pct > 0 ? `Fugindo da busca · ${pct}%` : 'Área de busca · saia do círculo vermelho';
      this.bar.style.width = `${Math.max(0, pct)}%`;
    }
  }
}
