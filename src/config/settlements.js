/**
 * Escala das construções e disposição orgânica das vilas.
 *
 * MÉTRICA: 1 unidade do Three.js = 1 metro. Personagem = 1,80 m,
 * porta = 2,1 m (fixa — não escala). Por isso as casas NÃO são ampliadas
 * com `mesh.scale.set`: isso aumentaria a porta junto (2,7 m+) e quebraria
 * a proporção com o personagem. Em vez disso, só a altura das paredes
 * cresce; portas, janelas e degraus ficam na medida humana.
 */
export const BUILDING_SCALE = {
  /** Multiplica a altura de parede pedida por cada vila. */
  wallHeightMul: 1.3,
  /** Pé-direito mínimo (m) de casa térrea: com o telhado passa de 5 m. */
  minWallHeight: 3.4,
  /** Rondavéis (cabanas redondas): parede mínima (m). */
  minHutWall: 3.0,
};

/**
 * Disposição das casas por vila (Poisson Disk em anel em volta da praça).
 * - inner/outer: anel onde as casas podem ficar (m a partir do centro).
 *   outer ≤ 0 = raio da vila menos esse valor (ex.: -8 → até 8 m da borda)
 * - spacing: distância mínima entre centros de casas (m) — define o "aperto"
 * - jitter: rotação aleatória extra (rad) sobre "de frente para a rua"
 * - streetReach: até onde (m) a casa procura uma rua para virar a frente;
 *   mais longe que isso ela se vira para o centro da vila
 * - pathMax: liga a porta à rua com uma trilha de terra se a rua estiver
 *   a até esta distância (m)
 */
export const VILLAGE_LAYOUT = {
  renascimento: { inner: 50, outer: 205, spacing: 13.5, jitter: 0.35, streetReach: 30, pathMax: 26 },
  perseguicao: { inner: 22, outer: -8, spacing: 10, jitter: 0.6, streetReach: 25, pathMax: 18 },
  abstracao: { inner: 25, outer: -7, spacing: 9.5, jitter: 0.8, streetReach: 25, pathMax: 18 },
  bussola: { inner: 28, outer: -8, spacing: 12.5, jitter: 0.25, streetReach: 30, pathMax: 22 },
  alZahir: { inner: 34, outer: -6, spacing: 12, jitter: 0.3, streetReach: 25, pathMax: 18 },
};

/**
 * Decoração entre as casas. Chance por casa de cada item e quantos.
 * - fence: cerca de madeira irregular num lado do quintal
 * - barrels, crates, bushes, rocks: [mínimo, máximo] por casa
 */
export const CLUTTER = {
  fenceChance: 0.35,
  barrels: [0, 2],
  crates: [0, 2],
  bushes: [1, 3],
  rocks: [0, 2],
  /** Raio (m) em volta da casa onde os objetos caem. */
  yard: 3.5,
  /** Terra batida em volta de cada casa: força (0..1) e cor. */
  yardDirt: { strength: 0.5, color: 0x7a6248 },
  /** Trilhas da porta até a rua. */
  path: { width: 1.8, strength: 0.65, color: 0x6e5840 },
};

/**
 * Luzes de fogo (fogueiras, tochas, luzes errantes das ruínas).
 * - pool: quantas PointLights reais existem (cada uma pesa em toda a cena)
 * - maxDistance: só fontes até esta distância do jogador ganham luz real (m)
 * - flicker: força do tremor (0 = luz parada)
 */
export const FIRE_LIGHTS = { pool: 2, maxDistance: 80, flicker: 0.22 };
