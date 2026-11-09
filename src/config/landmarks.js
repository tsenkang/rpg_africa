/**
 * Marcos do mapa de referência: relevo extra (cordilheiras e mesas) e
 * construções isoladas. Posições em (u, v) da imagem (0-1, origem no canto
 * superior esquerdo), conferidas no mapa com zoom; 1 px = 8 m.
 *
 * RELIEF (somado ao terreno, depois do litoral e antes das áreas aplainadas):
 *   range  { points: [[u, v], …], width (m), height (m), seed }
 *          cordilheira ao longo da linha; os picos variam com ruído "ridged".
 *   mesa   { u, v, radius (m), height (m), seed }
 *          planalto de topo plano, paredões íngremes e talude na base.
 *
 * LANDMARKS (construídos por `src/world/Landmarks.js`):
 *   { id, type, name, u, v, rot, flatten?: { radius, blend }, clear (m) }
 *   `flatten` aplaina o chão antes de esculpir o terreno; `clear` é o raio
 *   onde a vegetação não nasce.
 */
export const RELIEF = [
  // Cordilheira do sul, na borda de baixo do mapa (interrompida onde fica a
  // Bússola do Sul e suas plantações).
  { type: 'range', points: [[0.14, 0.93], [0.19, 0.905], [0.24, 0.925], [0.29, 0.9], [0.325, 0.935]], width: 190, height: 210, seed: 1 },
  { type: 'range', points: [[0.5, 0.94], [0.56, 0.915], [0.62, 0.94], [0.68, 0.92]], width: 170, height: 170, seed: 2 },
  // Serras escuras do sudeste (Floresta Preta).
  { type: 'range', points: [[0.8, 0.93], [0.86, 0.895], [0.92, 0.915], [0.97, 0.88]], width: 160, height: 160, seed: 3 },
  // Mesas e morros-testemunho do deserto (nordeste).
  { type: 'mesa', u: 0.79, v: 0.085, radius: 85, height: 58, seed: 4 },
  { type: 'mesa', u: 0.82, v: 0.205, radius: 60, height: 44, seed: 5 },
  { type: 'mesa', u: 0.885, v: 0.33, radius: 70, height: 50, seed: 6 },
  { type: 'mesa', u: 0.7, v: 0.165, radius: 40, height: 36, seed: 7 },
  { type: 'mesa', u: 0.93, v: 0.17, radius: 55, height: 46, seed: 8 },
  // Mesa vermelha do Kalahari.
  { type: 'mesa', u: 0.31, v: 0.74, radius: 75, height: 52, seed: 9 },
];

export const LANDMARKS = [
  {
    id: 'torre-negra', type: 'darkTower', name: 'Torre Negra', u: 0.256, v: 0.229, rot: 0.4,
    flatten: { radius: 30, blend: 25 }, clear: 34,
    description: 'Pináculo de pedra escura no meio da savana. Ninguém lembra quem a ergueu.',
  },
  {
    id: 'templo-degraus', type: 'stepTemple', name: 'Templo dos Degraus', u: 0.137, v: 0.51, rot: Math.PI / 2,
    flatten: { radius: 48, blend: 35 }, clear: 52,
    description: 'Pirâmide em degraus engolida pela floresta tropical.',
  },
  {
    id: 'fortaleza-areia', type: 'desertFortress', name: 'Fortaleza das Areias', u: 0.755, v: 0.13, rot: Math.PI,
    flatten: { radius: 58, blend: 35 }, clear: 62,
    description: 'Cidadela de barro aos pés das mesas do deserto.',
  },
  {
    id: 'povoado-deserto', type: 'desertSettlement', name: 'Povoado do Oásis', u: 0.645, v: 0.28, rot: 0,
    flatten: { radius: 52, blend: 30 }, clear: 56,
    description: 'Casas de barro de teto plano em volta de um poço.',
  },
  {
    id: 'ruinas-pedra', type: 'stoneEnclosure', name: 'Muralhas de Pedra', u: 0.32, v: 0.625, rot: 0.3,
    flatten: { radius: 46, blend: 30 }, clear: 50,
    description: 'Recinto circular de pedra seca com uma torre cônica no centro.',
  },
  {
    id: 'pinaculos-pretos', type: 'blackSpires', name: 'Pináculos Pretos', u: 0.7, v: 0.74, rot: 0,
    clear: 45,
    description: 'Agulhas de rocha negra e ruínas no coração da Floresta Preta.',
  },
  {
    id: 'arvore-gigante', type: 'giantTree', name: 'Árvore Anciã', u: 0.869, v: 0.448, rot: 0,
    flatten: { radius: 36, blend: 30 }, clear: 48, height: 64,
    description: 'A maior árvore do continente; a copa faz sombra por um quarteirão inteiro.',
  },
  {
    id: 'arvore-irma', type: 'giantTree', name: 'Árvore Irmã', u: 0.905, v: 0.395, rot: 1.3,
    flatten: { radius: 22, blend: 20 }, clear: 30, height: 38,
    description: 'Uma árvore anciã menor, vizinha da grande.',
  },
];
