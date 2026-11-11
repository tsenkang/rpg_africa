/**
 * Ícones de linha da interface (SVG 24×24, traço fino, cor = `currentColor`).
 *
 * Substituem os emojis: os dados guardam só a **chave** (`icon: 'leaf'`) e a
 * interface desenha com `icon(chave)`. Chave desconhecida vira um ponto discreto.
 *
 * @example
 *   import { icon } from './Icons.js';
 *   el.innerHTML = `${icon('leaf')} Folha`;
 *   icon('eye', 'lg'); // <svg class="i lg" …>
 */
const P = {
  // --- materiais
  stick: '<path d="M5 19 19 5"/><path d="M9 15l-2-1"/><path d="M14 10l1-2"/>',
  log: '<ellipse cx="7" cy="12" rx="3" ry="5"/><path d="M7 7h11a3 5 0 0 1 0 10H7"/><ellipse cx="7" cy="12" rx="1" ry="2"/>',
  stone: '<path d="M4 16 7 8l6-3 6 4 1 7-5 3H8z"/><path d="m7 8 4 4 6-1"/>',
  blade: '<path d="M4 20 16 8l3-4-4 1L4 16z"/><path d="M8 16l-2-2"/>',
  leaf: '<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14Z"/><path d="M5 19 14 10"/>',
  rope: '<path d="M6 4c6 2 6 6 0 8s-6 6 0 8"/><path d="M12 4c6 2 6 6 0 8s-6 6 0 8"/>',
  bone: '<path d="M8 6a2 2 0 1 0-3 2l9 9a2 2 0 1 0 3 2 2 2 0 1 0 2-3L10 7a2 2 0 1 0-2-1Z"/>',
  shard: '<path d="M12 3 8 12l4 9 4-9z"/><path d="M12 3v18"/>',
  feather: '<path d="M20 4C10 4 6 10 6 18"/><path d="M20 4c0 8-6 12-14 14"/><path d="M4 20l2-2"/><path d="M10 12h5"/>',
  hide: '<path d="M7 4h10l2 4-2 4 2 4-2 4H7l-2-4 2-4-2-4z"/>',
  coil: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  dust: '<path d="M4 15h11"/><path d="M7 19h10"/><path d="M6 11h8a3 3 0 1 0-3-3"/>',
  jar: '<path d="M8 4h8"/><path d="M9 4v3L6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8l-3-3V4"/><path d="M6 13h12"/>',
  flower: '<circle cx="12" cy="10" r="2"/><path d="M12 8a3 3 0 1 1 3 1 3 3 0 1 1-1 3 3 3 0 1 1-4 0 3 3 0 1 1-1-3 3 3 0 1 1 3-1Z"/><path d="M12 12v9"/>',
  bug: '<ellipse cx="12" cy="13" rx="4" ry="6"/><path d="M12 7V4"/><path d="M8 11H4"/><path d="M8 15H4"/><path d="M16 11h4"/><path d="M16 15h4"/>',
  mushroom: '<path d="M4 12a8 7 0 0 1 16 0Z"/><path d="M10 12v6a2 2 0 0 0 4 0v-6"/>',
  fruit: '<circle cx="12" cy="14" r="6"/><path d="M12 8c0-2 1-4 3-4"/>',
  nut: '<path d="M12 4c4 0 7 3 7 8s-3 8-7 8-7-3-7-8 3-8 7-8Z"/><path d="M5 11h14"/>',
  meat: '<path d="M14 4a6 6 0 0 1 6 6c0 4-4 7-8 7l-3 3-2-2-2 1 1-2-2-2 3-3c0-4 3-8 7-8Z"/><circle cx="14" cy="10" r="2"/>',
  fish: '<path d="M3 12c3-4 7-5 11-5 3 0 5 2 7 5-2 3-4 5-7 5-4 0-8-1-11-5Z"/><path d="M3 12 1 9v6z"/><circle cx="16" cy="11" r=".6"/>',
  bowl: '<path d="M3 11h18a9 7 0 0 1-18 0Z"/><path d="M9 7c0-2 2-2 2-4"/><path d="M14 7c0-2 2-2 2-4"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/>',
  wave: '<path d="M2 9c3 0 3-2 5-2s2 2 5 2 3-2 5-2 3 2 5 2"/><path d="M2 15c3 0 3-2 5-2s2 2 5 2 3-2 5-2 3 2 5 2"/>',
  bucket: '<path d="M5 8h14l-2 12H7z"/><path d="M5 8a7 5 0 0 1 14 0"/>',
  // --- saúde
  bandage: '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M10 10l4 4"/><path d="M14 10l-4 4"/>',
  scratch: '<path d="M4 9c2-2 4 2 6 0s4-2 6 0 3 1 4 0"/><path d="M4 15c2-2 4 2 6 0s4-2 6 0 3 1 4 0"/>',
  blood: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/><path d="M10 15a2 2 0 0 0 2 2"/>',
  germ: '<circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
  skull: '<path d="M5 11a7 7 0 1 1 14 0c0 3-2 4-2 4v3H7v-3s-2-1-2-4Z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M10 18v2M14 18v2"/>',
  thermo: '<path d="M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0Z"/><path d="M12 9v8"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v6L5 18a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 15h10"/>',
  syringe: '<path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 9 19l-4-4L15 5z"/><path d="m5 15-3 3 1 1 3-3"/><path d="m11 11 2 2"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5"/><path d="M11 10V4a1.5 1.5 0 0 1 3 0v6"/><path d="M14 10V5a1.5 1.5 0 0 1 3 0v7"/><path d="M8 11a1.5 1.5 0 0 0-3 0v2a8 8 0 0 0 8 8h1a5 5 0 0 0 5-5v-4"/>',
  // --- ferramentas e armas
  knife: '<path d="M3 21 13 11"/><path d="M13 11 20 4c1 4-1 8-5 10z"/>',
  spear: '<path d="M4 20 16 8"/><path d="m16 8 1-5 4-1-1 4z"/>',
  bow: '<path d="M6 3c8 3 12 9 15 15"/><path d="M6 3l15 15"/><path d="M3 21l9-9"/>',
  arrow: '<path d="M4 20 20 4"/><path d="M14 4h6v6"/><path d="M4 16v4h4"/>',
  needle: '<path d="M5 19 19 5"/><ellipse cx="17.5" cy="6.5" rx="1" ry="2" transform="rotate(45 17.5 6.5)"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M4 21a2 2 0 0 1 2-2h13v2"/>',
  wrench: '<path d="M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M15 9.5c-1-1-5-1-5 .8s5 1.4 5 3.4-4 2-5 .8"/>',
  // --- clima
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  snow: '<path d="M12 2v20M3.5 7l17 10M3.5 17l17-10"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  rain: '<path d="M7 15a5 5 0 1 1 9-5h1a4 4 0 0 1 0 8"/><path d="M8 19l-1 2M12 18l-1 3M16 19l-1 2"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  flame: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-6 2 1 3 3 3 3 1-3 1-5 1-8Z"/>',
  candle: '<rect x="9" y="10" width="6" height="11" rx="1"/><path d="M12 3c1 2 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4Z"/>',
  // --- interface
  backpack: '<path d="M6 8a6 6 0 0 1 12 0v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z"/><path d="M9 4.5V3h6v1.5"/><path d="M9 13h6v4H9z"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  paw: '<circle cx="7" cy="10" r="1.6"/><circle cx="10.5" cy="6.5" r="1.6"/><circle cx="14.5" cy="6.5" r="1.6"/><circle cx="18" cy="10" r="1.6"/><path d="M8 17a4 4 0 0 1 8 0c0 2-2 3-4 3s-4-1-4-3Z"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4"/><path d="M16 7v11a2 2 0 0 1-4 0v-1H4v1a2 2 0 0 0 2 2h8"/><path d="M7 4a2 2 0 0 0-2 2v11"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  warn: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4"/><path d="M12 17v.5"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  next: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  notebook: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18"/><path d="M12 8h4M12 12h4"/>',
  mind: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1Z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  // --- lei
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 16.5v.5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  fist: '<path d="M7 10V8a2 2 0 0 1 4 0v2"/><path d="M11 9a2 2 0 0 1 4 0v1"/><path d="M15 10a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-3a2 2 0 0 1 4 0"/>',
  voice: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M19 6a8 8 0 0 1 0 12"/>',
  dot: '<circle cx="12" cy="12" r="2.5"/>',
};

/** Chaves disponíveis (para testes e documentação). */
export const ICON_KEYS = Object.freeze(Object.keys(P));

/**
 * SVG em linha de um ícone.
 * @param {string} key chave do ícone (ex.: 'leaf'); vazia = string vazia
 * @param {string} [cls] classes extras (ex.: 'lg')
 * @returns {string} HTML do `<svg>`
 */
export function icon(key, cls = '') {
  if (!key) return '';
  const body = P[key] ?? P.dot;
  return `<svg class="i${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/**
 * Ícone dentro de outro SVG (ex.: mostrador), centrado em (x, y) com `size` px.
 * @example svg.innerHTML += iconAt('drop', 60, 60, 14, 'macro-icon');
 */
export function iconAt(key, x, y, size, cls = '') {
  const k = size / 24;
  return `<g class="${cls}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${k})" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${P[key] ?? P.dot}</g>`;
}
