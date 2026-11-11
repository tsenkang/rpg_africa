import { ITEMS } from '../systems/PlayerState.js';
import { icon } from './Icons.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

const KINDS = [['medicine', 'Remédios'], ['food', 'Comida e água'], ['material', 'Materiais'], ['tool', 'Ferramentas'], ['weapon', 'Armas'], ['key', 'Missão']];

/**
 * Mochila (tecla I) com a mesa de crafting livre, e modo "dock" (durante a
 * inspeção corporal): painel lateral de onde se ARRASTA um remédio para
 * cima da ferida no corpo 3D.
 *
 * Só exibe; quem muda o estado é o jogo (state/crafting/survival). Teclado:
 * clique = selecionar, botões de ação por item; arrasto com o mouse
 * (mousedown + mover) leva o item para a mesa ou para a ferida.
 *
 * @example
 * const bp = new BackpackUI(game);
 * bp.toggle();                       // I
 * bp.open('dock'); bp.onDrop = (itemId, x, y) => inspection.applyAt(itemId, x, y);
 */
export class BackpackUI {
  constructor(game) {
    this.game = game;
    this.root = el('div', 'backpack hidden', game.ui.root);
    this.root.innerHTML = `
      <div class="bp-card">
        <div class="bp-head"><b>${icon('backpack')} Mochila</b><button class="bp-book" title="Livro de receitas (J)">${icon('book')} Receitas <kbd>J</kbd></button><span class="bp-hint">clique num item · arraste para a mesa · <kbd>I</kbd>/<kbd>Esc</kbd> fecha</span></div>
        <div class="bp-body">
          <div class="bp-items"></div>
          <div class="bp-side">
            <div class="bp-detail"><i>Selecione um item.</i></div>
            <div class="bp-craft">
              <div class="bp-craft-title">Mesa de crafting livre <small>até 4 itens, sem receita</small></div>
              <div class="bp-table"></div>
              <div class="bp-craft-actions"><button class="bp-craft-btn">Craft</button><button class="bp-clear-btn">Limpar</button></div>
              <div class="bp-craft-msg"></div>
            </div>
          </div>
        </div>
      </div>`;
    this.items = this.root.querySelector('.bp-items');
    this.detail = this.root.querySelector('.bp-detail');
    this.tableEl = this.root.querySelector('.bp-table');
    this.msg = this.root.querySelector('.bp-craft-msg');
    this.table = []; // ids na mesa
    this.selected = null;
    this.mode = 'full';
    /** Durante a inspeção: callback do arrasto solto fora do painel. */
    this.onDrop = null;
    this.onDragMove = null;
    this.root.querySelector('.bp-craft-btn').addEventListener('click', () => this.craft());
    this.root.querySelector('.bp-book').addEventListener('click', () => { this.hide(); game.recipeBook.toggle(true); });
    this.root.querySelector('.bp-clear-btn').addEventListener('click', () => { this.table = []; this.refresh(); });
    this.tableEl.addEventListener('click', (e) => {
      const i = e.target.closest('[data-slot]')?.dataset.slot;
      if (i !== undefined && this.table[i]) { this.table.splice(+i, 1); this.refresh(); }
    });
    this.items.addEventListener('mousedown', (e) => {
      const chip = e.target.closest('[data-id]');
      if (!chip || e.button !== 0) return;
      e.preventDefault();
      this.beginDrag(chip.dataset.id, e);
    });
    this.items.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act) { this.action(act.dataset.act, act.dataset.id); return; }
    });
    this.detail.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act) this.action(act.dataset.act, act.dataset.id);
    });
    game.state.on('change', () => { if (this.open) this.refresh(); });
  }

  get open() {
    return !this.root.classList.contains('hidden');
  }

  /** @param {'full'|'dock'} [mode] */
  show(mode = 'full') {
    this.mode = mode;
    this.root.classList.remove('hidden');
    this.root.classList.toggle('dock', mode === 'dock');
    this.game.input.unlock();
    this.refresh();
  }

  hide() {
    this.root.classList.add('hidden');
  }

  toggle() {
    if (this.open) this.hide(); else this.show('full');
  }

  /** Itens da mochila agrupados por tipo (os da mesa aparecem descontados). */
  refresh() {
    const s = this.game.state;
    const onTable = {};
    for (const id of this.table) onTable[id] = (onTable[id] ?? 0) + 1;
    const groups = KINDS.map(([kind, label]) => {
      const list = [...s.inventory].filter(([id]) => (ITEMS[id]?.kind ?? 'key') === kind).filter(([id, n]) => n - (onTable[id] ?? 0) > 0);
      if (!list.length) return '';
      return `<div class="bp-group"><div class="bp-group-title">${label}</div><div class="bp-grid">${list.map(([id, n]) => {
        const d = ITEMS[id];
        return `<div class="bp-chip${this.selected === id ? ' sel' : ''}" data-id="${id}" title="${d?.description ?? ''}" tabindex="0"><span class="ic">${icon(d?.icon ?? 'dot')}</span><span class="nm">${d?.name ?? id}</span><span class="ct">×${n - (onTable[id] ?? 0)}</span></div>`;
      }).join('')}</div></div>`;
    }).join('');
    this.items.innerHTML = groups || '<i class="bp-empty">Mochila vazia.</i>';
    this.renderDetail();
    this.tableEl.innerHTML = [0, 1, 2, 3].map((i) => {
      const id = this.table[i], d = id && ITEMS[id];
      return `<div class="bp-slot${id ? ' filled' : ''}" data-slot="${i}" title="${id ? 'clique para tirar' : ''}">${d ? `<span class="ic">${icon(d.icon)}</span><span class="nm">${d.name}</span>` : '<span class="plus">+</span>'}</div>`;
    }).join('');
  }

  renderDetail() {
    const id = this.selected, d = id && ITEMS[id], n = id ? this.game.state.inventory.get(id) ?? 0 : 0;
    if (!d || !n) { this.detail.innerHTML = '<i>Selecione um item.</i>'; return; }
    const acts = [];
    if (d.food) acts.push(`<button data-act="eat" data-id="${id}">Comer / beber</button>`);
    if (d.comfort) acts.push(`<button data-act="use" data-id="${id}">Usar</button>`);
    if (this.mode === 'full') acts.push(`<button data-act="book" data-id="${id}">${icon('book')} Receitas</button>`);
    if (d.hotbar) acts.push(`<button data-act="equip" data-id="${id}">Pôr na hotbar</button>`);
    if (this.mode === 'full' && this.table.length < 4) acts.push(`<button data-act="table" data-id="${id}">Pôr na mesa</button>`);
    this.detail.innerHTML = `<div class="bp-detail-head"><span class="ic">${icon(d.icon)}</span><b>${d.name}</b> <span class="ct">×${n}</span></div><p>${d.description ?? ''}</p><div class="bp-actions">${acts.join('')}</div>`;
  }

  /** Ações dos botões (pedidos ao jogo; a UI não muda estado sozinha). */
  action(act, id) {
    const g = this.game;
    if (act === 'book') {
      this.hide();
      g.recipeBook.show(id, 'use');
      return;
    } else if (act === 'use') {
      g.useComfortItem(id);
    } else if (act === 'eat') {
      if (g.state.removeItem(id)) g.ui.toast(`Você consumiu: ${g.survival.consume(id)}`);
    } else if (act === 'equip') {
      g.equipFromBackpack(id);
    } else if (act === 'table') {
      this.addToTable(id);
    }
    this.refresh();
  }

  addToTable(id) {
    const have = this.game.state.inventory.get(id) ?? 0, used = this.table.filter((x) => x === id).length;
    if (this.table.length >= 4 || used >= have) return false;
    this.table.push(id);
    this.msg.textContent = '';
    this.refresh();
    return true;
  }

  /** Tenta a combinação da mesa (crafting por descoberta). */
  craft() {
    const r = this.game.craftFromTable(this.table);
    this.msg.innerHTML = r.message;
    this.msg.classList.toggle('ok', r.ok);
    if (r.ok) this.table = [];
    this.refresh();
  }

  // ------------------------------------------------------------ arrasto

  beginDrag(id, e) {
    this.selected = id;
    this.refresh();
    const start = { x: e.clientX, y: e.clientY };
    let ghost = null;
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
        ghost = el('div', 'bp-ghost', document.body, `${icon(ITEMS[id]?.icon)} ${ITEMS[id]?.name ?? id}`);
      }
      ghost.style.left = `${ev.clientX + 12}px`;
      ghost.style.top = `${ev.clientY + 12}px`;
      this.onDragMove?.(id, ev.clientX, ev.clientY);
    };
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!ghost) return; // clique simples: só seleciona
      ghost.remove();
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      if (this.mode === 'full' && over?.closest('.bp-craft')) this.addToTable(id);
      else if (!over?.closest('.bp-card')) this.onDrop?.(id, ev.clientX, ev.clientY);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
}
