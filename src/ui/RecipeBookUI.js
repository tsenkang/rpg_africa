import { ITEMS } from '../systems/PlayerState.js';
import { RecipeIndex } from '../systems/RecipeIndex.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

const KIND_LABEL = { medicine: 'Remédio', weapon: 'Arma', tool: 'Ferramenta', material: 'Material', food: 'Comida', key: 'Missão' };
const SOURCE_ICON = { coleta: '🌿', caça: '🔪', fogueira: '🔥', loja: '🪙', kit: '🎒', água: '🌊' };
const FILTERS = [['', 'Tudo'], ['@remedio', 'Remédios'], ['@arma', 'Armas'], ['@ferramenta', 'Ferramentas'], ['@material', 'Materiais'], ['@comida', 'Comida']];

/**
 * Livro de receitas no estilo JEI (tecla J, ou botão na mochila): grade com
 * todos os itens + busca; clicando num item mostra **Como fazer**, **Usado
 * em** e **Onde conseguir**, com o que você tem/falta. Ingredientes são
 * clicáveis (navega até eles; ← volta). O "+" põe a receita na mesa de
 * crafting e abre a mochila.
 *
 * Só exibe e pede ações ao jogo (backpack.table / craftFromTable).
 *
 * @example
 * const rb = new RecipeBookUI(game); rb.toggle(); rb.show('lanca_pedra', 'make');
 */
export class RecipeBookUI {
  constructor(game) {
    this.game = game;
    this.index = new RecipeIndex({ biomeName: (id) => game.biomeName?.(id) ?? id });
    this.query = '';
    this.selected = null;
    this.tab = 'make';
    this.history = [];
    this.root = el('div', 'recipebook hidden', game.ui.root);
    this.root.innerHTML = `
      <div class="rb-card">
        <div class="rb-left">
          <div class="rb-head"><b>📚 Livro de Receitas</b><span><kbd>J</kbd>/<kbd>Esc</kbd> fecha</span></div>
          <input class="rb-search" type="search" placeholder="Buscar item… (ex.: curativo, lança)" spellcheck="false" autocomplete="off">
          <div class="rb-filters">${FILTERS.map(([q, l]) => `<button data-q="${q}">${l}</button>`).join('')}</div>
          <div class="rb-grid"></div>
        </div>
        <div class="rb-right"><div class="rb-detail"></div></div>
      </div>`;
    this.search = this.root.querySelector('.rb-search');
    this.grid = this.root.querySelector('.rb-grid');
    this.detail = this.root.querySelector('.rb-detail');
    this.search.addEventListener('input', () => { this.query = this.search.value; this.renderGrid(); });
    this.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = this.grid.querySelector('[data-id]'); if (first) this.select(first.dataset.id, true); } });
    this.root.querySelector('.rb-filters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      this.query = b.dataset.q;
      this.search.value = this.query;
      this.renderGrid();
    });
    this.grid.addEventListener('click', (e) => { const c = e.target.closest('[data-id]'); if (c) this.select(c.dataset.id, true); });
    this.detail.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { this.select(go.dataset.go, true); return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) { this.tab = tab.dataset.tab; this.renderDetail(); return; }
      if (e.target.closest('.rb-back')) { this.back(); return; }
      const put = e.target.closest('[data-put]');
      if (put && !put.disabled) this.transfer(put.dataset.put);
    });
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.toggle(false); });
    game.state.on('change', () => { if (this.open) { this.renderGrid(); this.renderDetail(); } });
  }

  get open() {
    return !this.root.classList.contains('hidden');
  }

  toggle(force) {
    const show = force ?? !this.open;
    this.root.classList.toggle('hidden', !show);
    if (show) {
      this.game.input.unlock();
      this.renderGrid();
      this.renderDetail();
      setTimeout(() => this.search.focus(), 0);
    } else {
      this.search.blur();
    }
  }

  /** Abre já num item (ex.: botão "Ver receitas" da mochila). */
  show(id, tab = 'make') {
    this.toggle(true);
    this.tab = tab;
    this.select(id, true);
  }

  select(id, push = false) {
    if (push && this.selected && this.selected !== id) this.history.push(this.selected);
    if (this.history.length > 30) this.history.shift();
    this.selected = id;
    const ix = this.index;
    // Abre na aba que tem conteúdo.
    if (this.tab === 'make' && !ix.recipesFor(id).length) this.tab = ix.sourcesOf(id).length ? 'get' : ix.usesOf(id).length ? 'use' : 'make';
    this.renderGrid();
    this.renderDetail();
  }

  back() {
    const prev = this.history.pop();
    if (prev) this.select(prev, false);
  }

  renderGrid() {
    const inv = this.game.state.inventory, known = this.game.notebook;
    this.grid.innerHTML = this.index.search(this.query).map((id) => {
      const d = ITEMS[id], n = inv.get(id) ?? 0;
      const craftable = this.index.recipesFor(id).some((r) => !Object.keys(this.index.missing(r, inv)).length);
      const learned = this.index.recipesFor(id).some((r) => known.has('receitas', r.id));
      return `<button class="rb-item${id === this.selected ? ' sel' : ''}${craftable ? ' can' : ''}" data-id="${id}" title="${d.name}${craftable ? ' — dá para fazer agora' : ''}">
        <span class="ic">${d.icon ?? '▪'}</span>${n ? `<span class="n">${n}</span>` : ''}${learned ? '<span class="k">✓</span>' : ''}</button>`;
    }).join('') || '<i class="rb-empty">Nada encontrado.</i>';
  }

  /** Um slot de ingrediente/resultado: clicável, com tem/precisa. */
  slot(id, need, { tool = false, out = false } = {}) {
    const d = ITEMS[id], have = this.game.state.inventory.get(id) ?? 0;
    const ok = out || have >= need;
    return `<button class="rb-slot${ok ? '' : ' lack'}${tool ? ' tool' : ''}${out ? ' out' : ''}" data-go="${id}" title="${d.name}${tool ? ' (ferramenta: não é gasta)' : ''}">
      <span class="ic">${d.icon}</span><span class="nm">${d.name}</span>
      <span class="q">${out ? `×${need}` : `${have}/${need}`}${tool ? ' 🔧' : ''}</span></button>`;
  }

  recipeCard(r) {
    const inv = this.game.state.inventory;
    const miss = this.index.missing(r, inv), can = !Object.keys(miss).length;
    const learned = this.game.notebook.has('receitas', r.id);
    const ins = [...Object.entries(r.in).map(([id, n]) => this.slot(id, n)), ...(r.tools ?? []).map((t) => this.slot(t, 1, { tool: true }))];
    const outs = Object.entries(r.out).map(([id, n]) => this.slot(id, n, { out: true }));
    return `<div class="rb-recipe${can ? ' can' : ''}">
      <div class="rb-row">${ins.join('<span class="plus">+</span>')}<span class="arrow">➜</span>${outs.join('')}</div>
      <div class="rb-foot">
        <span class="rb-tag">${learned ? '✓ anotada na caderneta' : 'ainda não descoberta'}${r.hint ? ` · ${r.hint}` : ''}</span>
        <button class="rb-put" data-put="${r.id}" ${can ? '' : 'disabled'} title="${can ? 'Põe os itens na mesa e abre a mochila' : 'Faltam itens'}">+ Pôr na mesa</button>
      </div></div>`;
  }

  renderDetail() {
    const id = this.selected, ix = this.index;
    if (!id) {
      this.detail.innerHTML = `<div class="rb-hello"><b>Escolha um item</b><p>Clique em qualquer item para ver como fazer, onde é usado e onde conseguir. Itens com borda verde dá para fazer agora; ✓ = receita já anotada na caderneta.</p></div>`;
      return;
    }
    const d = ITEMS[id], have = this.game.state.inventory.get(id) ?? 0;
    const make = ix.recipesFor(id), use = ix.usesOf(id), get = ix.sourcesOf(id), fx = ix.effectsOf(id);
    const tabs = [['make', 'Como fazer', make.length], ['use', 'Usado em', use.length], ['get', 'Onde conseguir', get.length]];
    let body = '';
    if (this.tab === 'make') body = make.length ? make.map((r) => this.recipeCard(r)).join('') : '<i class="rb-none">Não se fabrica: veja "Onde conseguir".</i>';
    else if (this.tab === 'use') body = use.length ? use.map((r) => this.recipeCard(r)).join('') : '<i class="rb-none">Não é ingrediente de nenhuma receita.</i>';
    else body = get.length ? `<ul class="rb-sources">${get.map((s) => `<li><span>${SOURCE_ICON[s.kind] ?? '•'}</span><b>${s.kind}</b> ${s.text}</li>`).join('')}</ul>` : '<i class="rb-none">Só pela mesa de crafting.</i>';
    this.detail.innerHTML = `
      <div class="rb-top">
        <button class="rb-back" ${this.history.length ? '' : 'disabled'} title="Voltar">←</button>
        <span class="rb-big">${d.icon}</span>
        <div><b class="rb-name">${d.name}</b><div class="rb-meta">${KIND_LABEL[d.kind] ?? ''}${d.tool ? ' · não é gasto' : ''} · você tem <b>${have}</b></div></div>
      </div>
      ${d.description ? `<p class="rb-desc">${d.description}</p>` : ''}
      ${fx.length ? `<ul class="rb-fx">${fx.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
      <div class="rb-tabs">${tabs.map(([t, l, n]) => `<button data-tab="${t}" class="${this.tab === t ? 'active' : ''}" ${n ? '' : 'data-empty'}>${l} <em>${n}</em></button>`).join('')}</div>
      <div class="rb-body">${body}</div>`;
  }

  /** "+": põe a receita na mesa da mochila e abre a mochila. */
  transfer(recipeId) {
    const r = this.index.recipes.find((x) => x.id === recipeId);
    if (!r) return;
    const bp = this.game.backpack;
    bp.table = RecipeIndex.tableFor(r);
    this.toggle(false);
    bp.show('full');
    bp.msg.textContent = 'Receita na mesa: clique em Craft.';
    bp.msg.classList.remove('ok');
  }
}
