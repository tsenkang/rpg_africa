import { FOODS } from './survival.js';

/**
 * Catálogo de itens da mochila (data-driven).
 *   kind: material | medicine | tool | weapon | food | key
 *   plant: true → entra na seção "Plantas medicinais" da caderneta
 *   tool: true → usado no crafting/tratamento sem ser consumido
 *   hotbar: true → ao ser criado vai para a hotbar (equipável)
 */
export const ITEM_CATALOG = {
  // ---- materiais ----
  graveto: { name: 'Graveto', icon: '🥢', kind: 'material', description: 'Pau curto e seco. Flechas e fogueira.' },
  graveto_longo: { name: 'Graveto Longo', icon: '🪵', kind: 'material', description: 'Vara reta de 2 m. Base de lanças e arcos.' },
  pedra: { name: 'Pedra', icon: '🪨', kind: 'material', description: 'Bata uma na outra para lascar uma lâmina.' },
  lamina_pedra: { name: 'Lâmina de Pedra', icon: '🔪', kind: 'material', description: 'Lasca afiada. Ponta de lança e faca.' },
  cipo: { name: 'Cipó', icon: '🌿', kind: 'material', description: 'Fibra vegetal. Torça para fazer corda.' },
  corda: { name: 'Corda (Cipó)', icon: '🪢', kind: 'material', description: 'Amarra pontas, cabos e arcos.' },
  osso: { name: 'Osso de Caça', icon: '🦴', kind: 'material', description: 'Osso grande. Faca de osso.' },
  fragmento_osso: { name: 'Fragmento de Osso', icon: '🦷', kind: 'material', description: 'Lasca fina. Fincada na faca vira agulha.' },
  pena: { name: 'Pluma', icon: '🪶', kind: 'material', description: 'Empena flechas.' },
  pele_animal: { name: 'Pele de Animal', icon: '🟫', kind: 'material', description: 'Couro cru. Mochila e abrigo.' },
  tripas: { name: 'Tripas', icon: '🧶', kind: 'material', description: 'Isca e corda de arco.' },
  cinza: { name: 'Cinza de Fogueira', icon: '🌫️', kind: 'material', description: 'Antisséptica. Curativo de cinza.' },
  mel: { name: 'Mel', icon: '🍯', kind: 'material', food: true, description: 'Doce e antisséptico. Curativo de mel.' },
  folha_medicinal: { name: 'Folha de Molineria', icon: '🍃', kind: 'material', plant: true, description: 'Folha larga e macia. Vira curativo.' },
  folha_tabaco: { name: 'Folha de Tabaco', icon: '🍂', kind: 'material', plant: true, food: true, description: 'Anti-veneno: mastigada ou em curativo.' },
  lirio: { name: 'Lírio', icon: '🌸', kind: 'material', plant: true, description: 'Flor dos rios. Anti-veneno em curativo.' },
  formigas: { name: 'Formigas-Cabo-Verde', icon: '🐜', kind: 'material', description: 'As mandíbulas costuram cortes.' },
  larvas_carne: { name: 'Larvas de Carne', icon: '🐛', kind: 'material', description: 'Comem só o tecido morto. Limpam infecção.' },
  cogumelo_azul: { name: 'Cogumelo Azul', icon: '🍄', kind: 'food', plant: true },
  cogumelo_roxo: { name: 'Cogumelo Roxo', icon: '🍄', kind: 'food', plant: true },
  guanabana: { name: 'Guanábana', icon: '🍈', kind: 'food', plant: true },
  // ---- remédios ----
  curativo_folha: { name: 'Curativo de Folha', icon: '🩹', kind: 'medicine', description: 'Cobre arranhões e lacerações. Pele suja = infecção.' },
  curativo_cinza: { name: 'Curativo de Cinza', icon: '🩹', kind: 'medicine', description: 'Anti-infeccioso: quase não infecciona.' },
  curativo_mel: { name: 'Curativo de Mel', icon: '🩹', kind: 'medicine', description: 'Antisséptico suave.' },
  curativo_tabaco: { name: 'Curativo de Tabaco', icon: '🩹', kind: 'medicine', description: 'Anti-veneno: neutraliza picadas.' },
  curativo_lirio: { name: 'Curativo de Lírio', icon: '🩹', kind: 'medicine', description: 'Anti-veneno: neutraliza picadas.' },
  agulha_osso: { name: 'Agulha de Osso', icon: '🪡', kind: 'tool', tool: true, description: 'Fura a pele e puxa larvas.' },
  // ---- ferramentas e armas ----
  faca_osso: { name: 'Faca de Osso', icon: '🗡️', kind: 'tool', tool: true, hotbar: true, description: 'Esfola animais. Base da agulha.' },
  faca_pedra: { name: 'Faca de Pedra', icon: '🔪', kind: 'tool', tool: true, hotbar: true, description: 'Esfola animais.' },
  lanca_simples: { name: 'Lança Simples', icon: '🥢', kind: 'weapon', hotbar: true, description: 'Vara apontada. Arremessável.' },
  lanca_pedra: { name: 'Lança de Pedra', icon: '🔱', kind: 'weapon', hotbar: true, description: 'Ponta de pedra amarrada. Mais dano.' },
  arco: { name: 'Arco', icon: '🏹', kind: 'weapon', hotbar: true, description: 'Precisa de flechas na mochila.' },
  flecha: { name: 'Flecha', icon: '➶', kind: 'material', description: 'Munição do arco.' },
  // ---- comida (macros em FOODS) ----
  ...Object.fromEntries(Object.entries(FOODS).map(([id, f]) => [id, { name: f.name, icon: f.icon, kind: 'food', food: true, description: foodDescription(f) }])),
};

function foodDescription(f) {
  const parts = [];
  if (f.proteins) parts.push(`${f.proteins > 0 ? '+' : ''}${f.proteins} prot.`);
  if (f.carbs) parts.push(`${f.carbs > 0 ? '+' : ''}${f.carbs} carb.`);
  if (f.fats) parts.push(`${f.fats > 0 ? '+' : ''}${f.fats} gord.`);
  if (f.water) parts.push(`${f.water > 0 ? '+' : ''}${f.water} água`);
  if (f.cures) parts.push(`cura ${f.cures.join('/')}`);
  if (f.contamination) parts.push('⚠ pode ter parasitas');
  return parts.join(' · ');
}

/**
 * Receitas da mesa livre (até 4 itens, sem ordem). `in` = ingredientes
 * consumidos; `tools` = precisam estar na mesa mas não são gastos;
 * `out` = { id: quantidade }. `hint` aparece na caderneta.
 */
export const RECIPES = [
  { id: 'lanca_simples', in: { graveto_longo: 1 }, out: { lanca_simples: 1 }, hint: 'Aponte a vara com uma pedra.' },
  { id: 'lanca_pedra', in: { graveto_longo: 1, lamina_pedra: 1, corda: 1 }, out: { lanca_pedra: 1 } },
  { id: 'faca_osso', in: { osso: 1, corda: 1 }, out: { faca_osso: 1 } },
  { id: 'faca_pedra', in: { lamina_pedra: 1, graveto: 1, corda: 1 }, out: { faca_pedra: 1 } },
  { id: 'lamina_pedra', in: { pedra: 2 }, out: { lamina_pedra: 1 }, hint: 'Bata uma pedra na outra.' },
  { id: 'corda', in: { cipo: 2 }, out: { corda: 1 } },
  { id: 'curativo_folha', in: { folha_medicinal: 1 }, out: { curativo_folha: 1 } },
  { id: 'curativo_cinza', in: { curativo_folha: 1, cinza: 1 }, out: { curativo_cinza: 1 }, hint: 'Anti-infeccioso.' },
  { id: 'curativo_tabaco', in: { curativo_folha: 1, folha_tabaco: 1 }, out: { curativo_tabaco: 1 }, hint: 'Anti-veneno.' },
  { id: 'curativo_lirio', in: { curativo_folha: 1, lirio: 1 }, out: { curativo_lirio: 1 }, hint: 'Anti-veneno.' },
  { id: 'curativo_mel', in: { curativo_folha: 1, mel: 1 }, out: { curativo_mel: 1 } },
  { id: 'agulha_osso', in: { fragmento_osso: 1 }, tools: ['faca_osso'], out: { agulha_osso: 1 }, hint: 'Fragmento fincado na faca.' },
  { id: 'arco', in: { graveto_longo: 1, corda: 1 }, out: { arco: 1 } },
  { id: 'flecha', in: { graveto: 1, lamina_pedra: 1, pena: 1 }, out: { flecha: 3 } },
  { id: 'fragmento_osso', in: { osso: 1, pedra: 1 }, out: { fragmento_osso: 3 }, hint: 'Quebre o osso com a pedra.' },
];

/** Com o que o jogador começa (kit de viagem) — a coleta no mundo vem na etapa 3. */
export const STARTER_KIT = { folha_medicinal: 2, curativo_folha: 1, cinza: 1, graveto_longo: 1, cipo: 2, pedra: 2, agua_fervida: 1 };

/** Materiais à venda nas lojas (até a coleta existir, dá para montar o básico). */
export const SHOP_MATERIALS = [
  { id: 'folha_medicinal', price: 3 }, { id: 'cinza', price: 1 }, { id: 'folha_tabaco', price: 4 }, { id: 'corda', price: 3 },
  { id: 'larvas_carne', price: 5 }, { id: 'formigas', price: 4 }, { id: 'osso', price: 4 },
];
