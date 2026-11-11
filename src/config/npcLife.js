/**
 * Mundo vivo (NPCManager): rotina de 24 h, profissões, nomes, famílias,
 * vestuário por bioma, reação ao clima e LOD de IA. Horas do jogo (0..24).
 */

/**
 * Blocos da rotina diária. `from` = hora de início; cada NPC sorteia um
 * desvio de ±`jitter` h para a vila não andar em fila.
 *   WAKE    acorda em casa (café, família)
 *   WORK    turno da manhã no posto de trabalho
 *   LUNCH   pausa: come sentado perto do trabalho / praça
 *   WORK_PM turno da tarde (cansaço cresce)
 *   LEISURE lazer: praça, fogueira, feira
 *   HOME    volta para casa; ao chegar, SLEEP
 */
export const ROUTINE = {
  blocks: [
    { from: 6, activity: 'WAKE' },
    { from: 7.5, activity: 'WORK' },
    { from: 12, activity: 'LUNCH' },
    { from: 13, activity: 'WORK_PM' },
    { from: 17.5, activity: 'LEISURE' },
    { from: 21.5, activity: 'HOME' },
  ],
  jitter: 0.35,
  /** Guardas trabalham em turnos: dia 6–18, noite 18–6 (metade de cada). */
  guardShifts: { day: [6, 18], night: [18, 6] },
};

/**
 * Energia 0..1: cai trabalhando (por hora do jogo), sobe um pouco no almoço,
 * e volta a 1 dormindo. Abaixo de `tired` a postura cai (ombros caídos).
 */
export const ENERGY = { workPerHour: 0.085, leisurePerHour: 0.02, lunchBoost: 0.1, tired: 0.35, exhausted: 0.15 };

/**
 * Profissões: peso no sorteio, onde trabalham (`place`) e gesto de trabalho.
 *   place: farm (borda da vila) · plaza (barracas) · forge (forja perto da praça)
 *          · yard (quintal de casa) · wild (fora da vila) · water (margem) · patrol
 */
export const PROFESSIONS = {
  agricultor: { name: 'Agricultor', weight: 4, place: 'farm', gesture: 'hoe', tool: 'hoe' },
  mercador: { name: 'Mercador', weight: 2, place: 'plaza', gesture: 'arrange', trader: true },
  ferreiro: { name: 'Ferreiro', weight: 1, place: 'forge', gesture: 'hammer', trader: true, apron: 0x4a3626 },
  artesao: { name: 'Artesão', weight: 2, place: 'yard', gesture: 'craft', apron: 0x8a6a4a },
  cacador: { name: 'Caçador', weight: 1.2, place: 'wild', gesture: 'scout' },
  lenhador: { name: 'Lenhador', weight: 1.5, place: 'wild', gesture: 'chop', biomes: ['taiga', 'preta', 'equatorial', 'tropical'] },
  pescador: { name: 'Pescador', weight: 1.5, place: 'water', gesture: 'fish' },
  guarda: { name: 'Guarda', weight: 0, place: 'patrol', gesture: 'patrol' },
};

/**
 * População por vila (vilas abandonadas ficam vazias).
 *   families: [min, max] pessoas por família; childChance/elderChance por vaga extra
 *   guards: número de guardas (patrulham em duplas)
 */
export const POPULATION = {
  perVillage: 40,
  guards: 6,
  familySize: [1, 5],
  childChance: 0.35,
  elderChance: 0.15,
  walkSpeed: 1.25,
  runSpeed: 3.2, // fugindo do temporal
};

/**
 * LOD de IA:
 * - renderRadius: perto disto o NPC vira boneco 3D animado (até `maxRendered`)
 * - activeRadius: vila a menos disto (da borda) simula os NPCs passo a passo
 * - logicTick: NPC simulado sem boneco atualiza a cada N s (mais barato)
 * - buildsPerFrame: bonecos novos montados por quadro (evita engasgo)
 */
export const NPC_LOD = { renderRadius: 70, maxRendered: 26, activeRadius: 260, logicTick: 0.25, buildsPerFrame: 2 };

/** Reação ao clima: limites dos overlays do WeatherManager (0..1). */
export const WEATHER_REACT = { shelter: 0.45, cold: 0.3, heat: 0.3, sweatEvery: [6, 12], coldBiomes: ['taiga'], hotBiomes: ['deserto', 'kalahari'] };

/** Nomes por região cultural (biomas). Sobrenome é da família inteira. */
export const NAMES = {
  common: {
    male: ['Alberto', 'Kwame', 'Joaquim', 'Tomé', 'Baltasar', 'Kofi', 'Mateus', 'Abel', 'Inácio', 'Dário', 'Jonas', 'Sebastião', 'Elias', 'Gaspar', 'Lázaro', 'Amadou', 'Rui', 'Firmino'],
    female: ['Maria', 'Amara', 'Benedita', 'Luzia', 'Esperança', 'Nala', 'Rosa', 'Teresa', 'Adaeze', 'Clara', 'Joana', 'Iracema', 'Filomena', 'Zuri', 'Graça', 'Ana', 'Celeste', 'Imani'],
    surnames: ['Torres', 'Mbeki', 'Almeida', 'Okafor', 'Nascimento', 'Carvalho', 'Diallo', 'Ferreira', 'Mensah', 'Rocha', 'Ndlovu', 'Barros', 'Asante', 'Pinto', 'Kamara', 'Moura', 'Sousa', 'Teixeira'],
  },
  taiga: {
    male: ['Ivar', 'Bjorn', 'Anatoli', 'Erik', 'Gunnar', 'Mikhail', 'Leif', 'Yuri', 'Sven', 'Oleg', 'Halvar', 'Pavel'],
    female: ['Ingrid', 'Olga', 'Sigrid', 'Astrid', 'Yelena', 'Freya', 'Katya', 'Helga', 'Sonja', 'Vera', 'Runa', 'Irina'],
    surnames: ['Volkov', 'Haldorsen', 'Petrov', 'Lindqvist', 'Morozov', 'Eriksen', 'Sokolov', 'Bergstrom', 'Ivanov', 'Dahl'],
  },
  desert: {
    male: ['Zahir', 'Tariq', 'Idris', 'Karim', 'Yusuf', 'Hamza', 'Omar', 'Malik', 'Samir', 'Rashid', 'Faris', 'Nabil'],
    female: ['Leila', 'Amira', 'Yasmin', 'Samira', 'Nadia', 'Farah', 'Zainab', 'Salma', 'Rania', 'Hana', 'Aisha', 'Dalia'],
    surnames: ['Al-Rashid', 'Haddad', 'Mansour', 'El-Amin', 'Saleh', 'Khalil', 'Nasser', 'Bakr', 'Darwish', 'Farouk'],
  },
  jungle: {
    male: ['Kito', 'Jabari', 'Obi', 'Tano', 'Mosi', 'Ayo', 'Chidi', 'Kayode', 'Bem', 'Iro', 'Tunde', 'Nnamdi'],
    female: ['Ama', 'Ife', 'Kemi', 'Nia', 'Ola', 'Sade', 'Yetunde', 'Ebo', 'Chioma', 'Ada', 'Ngozi', 'Folake'],
    surnames: ['Adeyemi', 'Okonkwo', 'Bello', 'Eze', 'Nwosu', 'Abara', 'Oduya', 'Ilori', 'Uzor', 'Achebe'],
  },
};

/** Biomas → região de nomes. */
export const NAME_REGION = { taiga: 'taiga', deserto: 'desert', kalahari: 'desert', tropical: 'jungle', equatorial: 'jungle' };

/**
 * Vestuário por bioma (NPCVisualBuilder). Cores sorteadas de cada lista;
 * `chance` liga peças opcionais. `guard` = uniforme dos guardas daquele bioma.
 */
export const OUTFITS = {
  taiga: {
    shirts: [0x5a4636, 0x4a4a52, 0x6a3a2a, 0x3a4a3a], pants: [0x2a2420, 0x34302a],
    cape: [0x7a5a3a, 0x8a7a6a, 0x5a4030], capeChance: 0.85, hat: 'fur', hatColors: [0x6a4a30, 0x8a7a6a],
    gloves: [0x3a2a1e, 0x4a3a2a], boots: [0x2a1e16, 0x3a2a1e], robeChance: 0.2,
    guard: { shirt: 0x4a4a52, armor: 0x6a6a72, cape: 0x6a4a30, hat: 'helmet', boots: 0x2a1e16, gloves: 0x3a2a1e },
  },
  desert: {
    shirts: [0xe8dcc0, 0xd8c8a0, 0xc8a878, 0xf0e8d8, 0x9a6a4a], pants: [0xd8c8a8, 0xb8a078],
    robeChance: 0.85, hat: 'wrap', hatChance: 0.8, capeChance: 0.25, cape: [0xd8c8a8, 0xb89a6a],
    guard: { shirt: 0xd8c8a0, armor: 0xb8925a, hat: 'wrap', robe: true, cape: 0x8a3a2a },
  },
  jungle: {
    shirts: [0x6a7a3a, 0x8a6a3a, 0x5a4a2a, 0xa0803a], pants: [0x4a3a22, 0x5a4a2a],
    straps: [0x5a3a1e, 0x4a2a16], strapsChance: 0.75, robeChance: 0.1, hat: 'straw', hatChance: 0.2,
    guard: { shirt: 0x5a6a2a, straps: 0x4a2a16, armor: 0x7a5a2a, hat: 'helmet' },
  },
  common: {
    shirts: [0xb5382a, 0x2f5d8a, 0xd9a02a, 0x4a7a3a, 0x7a3a6a, 0xe0d8c8, 0x8a5a2a, 0x1f6a6a], pants: [0x3a3028, 0x2a2a30, 0x5a4a3a, 0x2e3a4a],
    hat: 'straw', hatChance: 0.3, robeChance: 0.15,
    noble: { shirt: 0x5a1a4a, cape: 0x8a1a2a }, // mercador abastado
    guard: { shirt: 0x2f3a5a, armor: 0x8a8a92, hat: 'helmet', cape: 0x8a1a1a, boots: 0x2a1e16 },
  },
};

/** Bioma → conjunto de roupas. */
export const OUTFIT_REGION = { taiga: 'taiga', deserto: 'desert', kalahari: 'desert', tropical: 'jungle', equatorial: 'jungle' };

/** Comandante da Guarda (um por vila, fixo na praça): capa vermelha e peitoral. */
export const COMMANDER_LOOK = { cape: 0x7a1f1a, armor: 0x8c8378 };
