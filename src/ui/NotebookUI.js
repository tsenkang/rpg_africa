import { BIOMES } from '../config/biomes.js';
import { SPECIES } from '../config/fauna.js';
import { RECIPES } from '../config/items.js';
import { ITEMS } from '../systems/PlayerState.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

const TABS = [['biomas', '🗺️ Biomas'], ['fauna', '🐾 Fauna'], ['plantas', '🌿 Plantas medicinais'], ['receitas', '📜 Receitas']];
const BEHAVIOR = { flee: 'foge', aggressive: 'agressivo', stalker: 'emboscada', pack: 'em bando', burrow: 'se enterra', neutral: 'neutro', fly: 'voa', passive: 'pacífico', ambush: 'emboscada na água/areia', territorial: 'territorial', soar: 'plana', guardian: 'guardião' };

/**
 * Caderneta de sobrevivência (tecla N): diário em HTML/CSS com o que o
 * jogador já descobriu (Notebook): biomas, fauna, plantas e receitas.
 *
 * @example
 * const nb = new NotebookUI(game); nb.toggle();
 */
export class NotebookUI {
  constructor(game) {
    this.game = game;
    this.tab = 'biomas';
    this.root = el('div', 'notebook hidden', game.ui.root);
    this.root.innerHTML = `
      <div class="nb-book">
        <div class="nb-page nb-left">
          <div class="nb-title">Caderneta de Sobrevivência</div>
          <div class="nb-sub">anotações de viagem · <span class="nb-count"></span></div>
          <div class="nb-tabs">${TABS.map(([id, label]) => `<button data-tab="${id}">${label} <em></em></button>`).join('')}</div>
          <div class="nb-foot"><kbd>N</kbd> ou <kbd>Esc</kbd> fecha · <kbd>←</kbd><kbd>→</kbd> trocam a página</div>
        </div>
        <div class="nb-page nb-right"><div class="nb-content"></div></div>
      </div>`;
    this.content = this.root.querySelector('.nb-content');
    this.root.querySelector('.nb-tabs').addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { this.tab = t.dataset.tab; this.refresh(); }
    });
    game.notebook.on('entry', () => { if (this.open) this.refresh(); });
  }

  get open() {
    return !this.root.classList.contains('hidden');
  }

  toggle(force) {
    const show = force ?? !this.open;
    this.root.classList.toggle('hidden', !show);
    if (show) { this.game.input.unlock(); this.refresh(); }
  }

  /** ←/→ trocam a aba. */
  step(dir) {
    const i = TABS.findIndex(([id]) => id === this.tab);
    this.tab = TABS[(i + dir + TABS.length) % TABS.length][0];
    this.refresh();
  }

  refresh() {
    const nb = this.game.notebook;
    this.root.querySelector('.nb-count').textContent = `${nb.count} descobertas`;
    for (const b of this.root.querySelectorAll('[data-tab]')) {
      b.classList.toggle('active', b.dataset.tab === this.tab);
      b.querySelector('em').textContent = nb.pages[b.dataset.tab].size;
    }
    const list = nb.list(this.tab);
    let html = '';
    if (this.tab === 'biomas') {
      html = list.map((id) => { const b = BIOMES.find((x) => x.id === id); return b ? `<div class="nb-entry"><b>${b.name}</b><p>${b.description ?? ''}</p></div>` : ''; }).join('');
      html += `<div class="nb-todo">${BIOMES.length - list.length} biomas por visitar.</div>`;
    } else if (this.tab === 'fauna') {
      html = list.map((id) => { const s = SPECIES[id]; return s ? `<div class="nb-entry"><b>${s.nome}</b><p>${BEHAVIOR[s.behavior] ?? s.behavior}${s.damage ? ` · ataque ${s.damage}` : ''} · vida ${s.health ?? '?'}</p></div>` : ''; }).join('');
      html += `<div class="nb-todo">${Object.keys(SPECIES).length - list.length} espécies por avistar.</div>`;
    } else if (this.tab === 'plantas') {
      html = list.map((id) => { const d = ITEMS[id]; return d ? `<div class="nb-entry"><b>${d.icon} ${d.name}</b><p>${d.description ?? ''}</p></div>` : ''; }).join('');
      html += `<div class="nb-todo">${Object.values(ITEMS).filter((d) => d.plant).length - list.length} plantas por colher.</div>`;
    } else {
      html = list.map((id) => {
        const r = RECIPES.find((x) => x.id === id);
        if (!r) return '';
        const ins = [...Object.entries(r.in).map(([i, n]) => `${ITEMS[i].icon} ${ITEMS[i].name}${n > 1 ? ` ×${n}` : ''}`), ...(r.tools ?? []).map((t) => `${ITEMS[t].icon} ${ITEMS[t].name} <small>(ferramenta)</small>`)];
        const outs = Object.entries(r.out).map(([i, n]) => `${ITEMS[i].icon} ${ITEMS[i].name}${n > 1 ? ` ×${n}` : ''}`);
        return `<div class="nb-entry"><b>${outs.join(', ')}</b><p>${ins.join(' + ')}${r.hint ? `<br><small>${r.hint}</small>` : ''}</p></div>`;
      }).join('');
      html += `<div class="nb-todo">${RECIPES.length - list.length} receitas por descobrir na mesa livre.</div>`;
    }
    this.content.innerHTML = html || '<i>Nada anotado ainda.</i>';
  }
}
