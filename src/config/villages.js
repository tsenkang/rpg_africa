/**
 * Dados das 4 vilas (lore, estatísticas e posição no mapa).
 * A geometria de cada vila fica em src/villages/<Vila>.js.
 *
 * u, v = posição na imagem de referência (0..1).
 * radius = raio útil da vila (m). flatten = área de terreno aplainada.
 */
export const VILLAGES = {
  renascimento: {
    id: 'renascimento',
    name: 'Vila Renascimento',
    region: 'Centro da África — ilha do lago central',
    u: 0.5, v: 0.486,
    radius: 215,
    flatten: { radius: 205, blend: 22, height: 4.2 },
    population: 5000,
    demographics: { adultos: 65, criancas: 5, idosos: 30 },
    founded: 'A vila mais velha do continente.',
    description:
      'Construída na ilha do grande lago, ligada ao continente por oito pontes. ' +
      'Ruas de terra batida irradiam da praça central, onde fica o poço d\'água.',
    structures: [
      'Casas de adobe', 'Lojas e mercadinhos', 'Praça central', 'Poço d\'água',
      'Igreja bem cuidada', 'Uma casa em ruínas no canto da vila',
    ],
  },
  perseguicao: {
    id: 'perseguicao',
    name: 'Vila Perseguição',
    region: 'Leste Africano',
    u: 0.82, v: 0.47,
    radius: 135,
    flatten: { radius: 150, blend: 45 },
    population: 1467,
    demographics: { adultos: 43, criancas: 15, idosos: 42 },
    founded: 'Existe desde a Partilha da África.',
    description:
      'Vila antiga e apertada, cercada por mini estacas. A feira é a maior da região ' +
      'e a Praça da Saudade guarda memórias que ninguém gosta de contar.',
    structures: [
      'Muitas casas', 'Feira grande', 'Cerca de mini estacas',
      'Poucas áreas de plantação', 'Praça da Saudade',
    ],
  },
  abstracao: {
    id: 'abstracao',
    name: 'Vila Abstração',
    region: 'Noroeste Africano',
    u: 0.18, v: 0.21,
    radius: 120,
    flatten: { radius: 135, blend: 45 },
    population: 2000,
    populationNote: 'Cresceu de 500 para 2.000 "populistas" após a invasão.',
    demographics: null,
    faction: 'Controlada à força pela tribo Hoogmoed',
    founded: 'Invadida pela tribo Hoogmoed.',
    description:
      'Muito pobre e saqueada. Um muro de troncos cerca as casas simples; ' +
      'o líder da tribo faz suas reuniões na casa grande.',
    structures: [
      'Muro de troncos', 'Igreja grande', 'Duas lojas comerciais', 'Feira humilde',
      'Várias casas simples', 'Casa medicinal', 'Casa grande do líder Hoogmoed',
    ],
  },
  bussola: {
    id: 'bussola',
    name: 'Vila Bússola do Sul',
    region: 'Sul — às margens do rio',
    u: 0.42, v: 0.82,
    radius: 125,
    flatten: { radius: 150, blend: 40 },
    population: 3000,
    populationNote: 'Mais de 3.000 habitantes.',
    demographics: null,
    faction: 'Aliada e parceira comercial da tribo Luiheid',
    founded: 'Em guerra constante com algumas tribos.',
    description:
      'A vila mais rica do continente. A muralha com canhões e guardas é ' +
      'impenetrável: só entra quem conquista a confiança do prefeito.',
    structures: [
      'Muralha com canhões e guardas', 'Maior catedral do jogo', 'Mansão do prefeito',
      'Casas menores', 'Duas feiras', 'Área comercial', 'Grandes plantações',
      'Fazenda de animais', 'Porto de pesca no rio', 'Grande relógio (cofre embaixo)',
    ],
  },
};

/** Áreas extras aplainadas (plantações da Bússola do Sul fora da muralha). */
export const EXTRA_FLAT_ZONES = [
  { u: 0.36, v: 0.84, radius: 95, blend: 40 },
  { u: 0.385, v: 0.9, radius: 55, blend: 30 },
];
