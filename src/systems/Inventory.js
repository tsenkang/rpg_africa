/**
 * Hotbar do jogador: um número fixo de slots (8 por padrão), um deles ativo.
 *
 * Um item é um objeto simples, ex.:
 *   { id: 'faca', nome: 'Faca', tipo: 'arma' }
 *
 * O "equipamento atual" é o item do slot ativo. Slot vazio = MAOS_LIVRES.
 *
 * @example
 *   const inv = new Inventory({ slots: 8 });
 *   inv.adicionarItem({ id: 'faca', nome: 'Faca', tipo: 'arma' }); // → 0
 *   inv.selecionar(0);
 *   inv.equipado.nome; // 'Faca'
 *   inv.selecionar(3);
 *   inv.equipado === MAOS_LIVRES; // true
 */
export const MAOS_LIVRES = Object.freeze({ id: 'maos_livres', nome: 'Mãos Livres', tipo: 'desarmado' });

export class Inventory {
  /** @param {{ slots?: number }} options */
  constructor({ slots = 8 } = {}) {
    /** @type {(object|null)[]} */
    this.slots = new Array(slots).fill(null);
    this.selected = 0;
    this.listeners = [];
  }

  /** Chama `fn(inventory)` sempre que um slot ou a seleção mudar. */
  onChange(fn) {
    this.listeners.push(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  /**
   * Coloca o item no primeiro slot vazio.
   * @returns {number} índice do slot usado, ou -1 se a hotbar estiver cheia.
   */
  adicionarItem(item) {
    if (!item || typeof item !== 'object' || !item.id) throw new Error('adicionarItem: o item precisa ter pelo menos { id }');
    const slot = this.slots.indexOf(null);
    if (slot === -1) return -1;
    this.slots[slot] = { nome: item.id, tipo: 'item', ...item };
    this.emit();
    return slot;
  }

  /**
   * Tira o item de um slot (padrão: o slot ativo).
   * @returns {object|null} o item removido.
   */
  removerItem(slot = this.selected) {
    if (slot < 0 || slot >= this.slots.length) return null;
    const item = this.slots[slot];
    this.slots[slot] = null;
    if (item) this.emit();
    return item;
  }

  /** Ativa o slot `index` (0-based). Fora do intervalo: ignora. */
  selecionar(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.slots.length || index === this.selected) return;
    this.selected = index;
    this.emit();
  }

  /** Item do slot ativo, ou MAOS_LIVRES se o slot estiver vazio. */
  get equipado() {
    return this.slots[this.selected] ?? MAOS_LIVRES;
  }

  /** true quando o personagem está desarmado (slot ativo vazio). */
  get maosLivres() {
    return this.equipado === MAOS_LIVRES;
  }
}
