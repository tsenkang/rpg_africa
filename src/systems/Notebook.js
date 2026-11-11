/**
 * Caderneta de sobrevivência (regra pura): registra automaticamente o que
 * o jogador descobre — biomas visitados, fauna avistada, plantas medicinais
 * colhidas e receitas que deram certo. Emite 'entry' { section, id } só na
 * PRIMEIRA vez de cada coisa.
 *
 * @example
 * const nb = new Notebook();
 * nb.on('entry', ({ section, id }) => ui.toast(`Caderneta: ${id}`));
 * nb.record('biomas', 'savana'); // true (novo)
 * nb.record('biomas', 'savana'); // false
 * nb.has('receitas', 'faca_osso');
 */
export const SECTIONS = ['biomas', 'fauna', 'plantas', 'receitas'];

export class Notebook {
  constructor() {
    /** @type {Record<string, Set<string>>} */
    this.pages = Object.fromEntries(SECTIONS.map((s) => [s, new Set()]));
    this.listeners = [];
  }

  on(event, fn) {
    if (event === 'entry') this.listeners.push(fn);
  }

  /**
   * @param {'biomas'|'fauna'|'plantas'|'receitas'} section
   * @param {string} id
   * @returns {boolean} true se era inédito
   */
  record(section, id) {
    const page = this.pages[section];
    if (!page || !id || page.has(id)) return false;
    page.add(id);
    for (const fn of this.listeners) fn({ section, id });
    return true;
  }

  has(section, id) {
    return this.pages[section]?.has(id) ?? false;
  }

  list(section) {
    return [...(this.pages[section] ?? [])];
  }

  /** Total de anotações (para o selo "N descobertas"). */
  get count() {
    return SECTIONS.reduce((n, s) => n + this.pages[s].size, 0);
  }
}
