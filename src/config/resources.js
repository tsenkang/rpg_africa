/**
 * Recursos coletáveis espalhados pelo mundo (gravetos, pedras, cipó, plantas
 * medicinais, frutas, castanhas, coco, cogumelos, mel, formigas, larvas).
 * Gerados por célula de forma determinística (semente + célula), só perto
 * do jogador; ao colher, o nó some e volta depois de `respawnSeconds`.
 *
 * Por tipo: item entregue, quantidade [min, max], rótulo do E, biomas
 * (ids de BIOMES ou 'all'), peso no sorteio, geometria/cor do render,
 * `water` = só perto da margem, `dirt` = suja ao colher, `also` = item extra.
 */
export const RESOURCES = {
  cell: 36,
  radius: 72, // m em volta do jogador com nós carregados
  perCell: 5,
  reach: 2.4, // m para colher
  respawnSeconds: 600,
  types: {
    graveto: { item: 'graveto', n: [1, 2], label: 'Pegar gravetos', biomes: 'all', weight: 3, geo: 'stick', color: 0x6a4a2a },
    graveto_longo: { item: 'graveto_longo', n: [1, 1], label: 'Pegar graveto longo', biomes: ['savana', 'taiga', 'tropical', 'equatorial', 'preta', 'kalahari'], weight: 1.4, geo: 'longstick', color: 0x7a5a30 },
    pedra: { item: 'pedra', n: [1, 2], label: 'Pegar pedras', biomes: 'all', weight: 2.5, geo: 'rock', color: 0x8a8580 },
    cipo: { item: 'cipo', n: [1, 2], label: 'Cortar cipó', biomes: ['tropical', 'equatorial', 'preta'], weight: 2, geo: 'vine', color: 0x3f6a2a },
    folha_medicinal: { item: 'folha_medicinal', n: [1, 2], label: 'Colher folha de molineria', biomes: ['tropical', 'equatorial', 'savana'], weight: 1.6, geo: 'leafplant', color: 0x4f8a3a },
    folha_tabaco: { item: 'folha_tabaco', n: [1, 1], label: 'Colher tabaco', biomes: ['savana', 'kalahari', 'tropical'], weight: 0.8, geo: 'leafplant', color: 0x8a7a2a },
    lirio: { item: 'lirio', n: [1, 1], label: 'Colher lírio', biomes: ['tropical', 'equatorial', 'savana'], water: true, weight: 1.2, geo: 'flower', color: 0xe8e0f0 },
    banana: { item: 'banana', n: [2, 3], label: 'Colher bananas', biomes: ['tropical', 'equatorial'], weight: 1, geo: 'bush', color: 0xd8c030 },
    fruta: { item: 'fruta', n: [1, 3], label: 'Colher frutas', biomes: ['savana', 'tropical', 'kalahari'], weight: 1.2, geo: 'bush', color: 0xd05a3a },
    guanabana: { item: 'guanabana', n: [1, 1], label: 'Colher guanábana', biomes: ['tropical', 'equatorial'], weight: 0.5, geo: 'bush', color: 0x6aa040 },
    castanha: { item: 'castanha', n: [2, 4], label: 'Catar castanhas-do-pará', biomes: ['tropical', 'equatorial'], weight: 1, geo: 'nuts', color: 0x5a3a1a },
    noz: { item: 'noz', n: [2, 3], label: 'Catar nozes', biomes: ['taiga', 'preta'], weight: 1, geo: 'nuts', color: 0x7a5a30 },
    coco: { item: 'coco', n: [1, 2], label: 'Pegar coco', biomes: ['tropical', 'deserto', 'savana'], weight: 0.7, geo: 'nuts', color: 0x6a4a28, also: 'agua_coco' },
    cogumelo: { item: 'cogumelo', n: [1, 3], label: 'Colher cogumelos', biomes: ['taiga', 'preta', 'equatorial'], weight: 1.2, geo: 'mushroom', color: 0xc8a070 },
    cogumelo_azul: { item: 'cogumelo_azul', n: [1, 2], label: 'Colher cogumelo azul', biomes: ['equatorial', 'preta'], weight: 0.5, geo: 'mushroom', color: 0x3a6ad0 },
    cogumelo_roxo: { item: 'cogumelo_roxo', n: [1, 2], label: 'Colher cogumelo roxo', biomes: ['tropical', 'taiga'], weight: 0.5, geo: 'mushroom', color: 0x7a3ad0 },
    mel: { item: 'mel', n: [1, 2], label: 'Tirar mel da colmeia', biomes: ['savana', 'tropical', 'equatorial'], weight: 0.5, geo: 'hive', color: 0xc8902a },
    formigas: { item: 'formigas', n: [2, 4], label: 'Pegar formigas-cabo-verde', biomes: ['tropical', 'equatorial', 'savana'], weight: 0.8, geo: 'anthill', color: 0x7a4a2a },
    larvas_carne: { item: 'larvas_carne', n: [1, 3], label: 'Catar larvas da carcaça', biomes: ['savana', 'kalahari', 'deserto'], weight: 0.5, geo: 'carcass', color: 0xb0a080, dirt: 6 },
  },
};
