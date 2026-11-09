/**
 * Dados das vilas (lore, estatísticas e posição no mapa).
 * A geometria de cada vila fica em src/villages/<Vila>.js.
 *
 * u, v = posição na imagem de referência (0..1).
 * radius = raio útil da vila (m). flatten = área de terreno aplainada.
 * biome = bioma onde fica (um assentamento por bioma).
 * abandoned = ruína: sem abrigo do clima, não vira ponto de renascer.
 * lore = conversa do ancião (E): { speaker, title, look, pages: [texto…] }.
 *   Cada página é uma tela do diálogo; "Continuar" passa para a próxima.
 *   `exposure` (opcional) soma exposição paranormal ao terminar de ler.
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

  // ===================== Novos assentamentos (um por bioma) =====================
  presaDeGelo: {
    id: 'presaDeGelo',
    name: 'Acampamento Presa de Gelo',
    biome: 'taiga',
    region: 'Norte — montanhas da Taiga',
    u: 0.4355, v: 0.0868,
    radius: 118,
    flatten: { radius: 130, blend: 45 },
    population: 520,
    demographics: { adultos: 80, criancas: 5, idosos: 15 },
    founded: 'Fundado por mineiros que seguiram um veio de ferro até a neve.',
    description:
      'Fortaleza rústica de caçadores e mineiros: paliçada de troncos congelados, dezenas de ' +
      'cabanas de tora e pedra viradas para as grandes fogueiras que nunca se apagam.',
    structures: ['Paliçada com portões', 'Dezenas de cabanas de tora', 'Torres de vigia altas', 'Varais de caça', 'Fogueiras centrais', 'Ruas de pedra com lanternas', 'Entrada da mina'],
    lore: {
      speaker: 'Ulmar, o Caçador-Chefe', title: 'Acampamento Presa de Gelo',
      look: { shirt: 0x5a4632, pants: 0x2e2a26, hat: 'wrap', height: 1.86, build: 1.15 },
      pages: [
        '"Chegue perto do fogo, estrangeiro. Aqui em cima o frio mata mais rápido que lobo."',
        '"Meu avô veio atrás do ferro que brilha nas pedras. Achou ferro… e achou a fome. As fogueiras são a nossa lei: quem deixa uma apagar, dorme do lado de fora."',
        '"As peles nos varais pagam o sal que vem do sul. As torres? Para ver a nevasca chegando — e as coisas que andam dentro dela."',
      ],
    },
  },
  alZahir: {
    id: 'alZahir',
    name: 'Oásis de Al-Zahir',
    biome: 'deserto',
    region: 'Centro do Deserto',
    u: 0.645, v: 0.28,
    radius: 150,
    flatten: { radius: 162, blend: 40 },
    population: 2400,
    demographics: { adultos: 60, criancas: 25, idosos: 15 },
    faction: 'Território neutro: nenhuma arma é sacada perto da água',
    founded: 'Erguido em volta do único lago que não seca no deserto.',
    description:
      'Cidade-oásis em volta do lago com palmeiras — a única área segura do deserto. ' +
      'Quarteirões de adobe de dois andares, ruas cobertas por tecidos e feiras de especiarias lotadas.',
    structures: ['Lago com palmeiras', 'Quarteirões de adobe (1–2 andares)', 'Ruas cobertas por toldos', 'Feiras densas de especiarias', 'Tendas das caravanas', 'Poço das caravanas'],
    lore: {
      speaker: 'Mestra Nadira', title: 'Guardiã da Água · Al-Zahir',
      look: { shirt: 0x2f5d8a, robe: true, hat: 'wrap', height: 1.7 },
      pages: [
        '"Bem-vindo à sombra de Al-Zahir. Beba primeiro, pergunte depois."',
        '"Zahir era um cameleiro que se perdeu na tempestade. Quando a areia baixou, ele estava de joelhos na beira deste lago. Ele jurou que ninguém morreria de sede aqui — e nós ainda cumprimos o juramento."',
        '"Por isso a regra: perto da água ninguém briga. Lá fora a areia decide quem vive."',
      ],
    },
  },
  copaAlta: {
    id: 'copaAlta',
    name: 'Povoado da Copa Alta',
    biome: 'tropical',
    region: 'Oeste — coração da Floresta Tropical',
    u: 0.0723, v: 0.6701,
    radius: 120,
    flatten: { radius: 128, blend: 40 },
    population: 1300,
    demographics: { adultos: 55, criancas: 30, idosos: 15 },
    founded: 'Subiram para as árvores depois da "Noite das Garras".',
    description:
      'Uma rede vertical de casas no alto das árvores gigantes, ligadas por uma teia de pontes ' +
      'de corda (dá para andar nelas). No chão ficam só as raízes, as escadas em caracol e os predadores.',
    structures: ['Dezenas de casas nas árvores', 'Teia de pontes suspensas', 'Escadas em caracol nos troncos', 'Árvores gigantes', 'Lanternas nas plataformas'],
    lore: {
      speaker: 'Avó Imani', title: 'Contadora de Histórias · Copa Alta',
      look: { shirt: 0x4a7a3a, robe: true, hair: 0xd0d0d0, hunch: 0.2, height: 1.6 },
      pages: [
        '"Shh… fale baixo, as onças escutam lá de baixo."',
        '"Antes vivíamos no chão. Até a Noite das Garras: em uma noite, metade das casas ficou vazia. Na manhã seguinte meu pai amarrou a primeira corda nesta árvore."',
        '"Hoje nenhuma criança daqui pisa no chão antes dos doze anos. A floresta dá tudo — fruta, água da chuva, remédio — desde que você fique em cima dela."',
      ],
    },
  },
  areiasVivas: {
    id: 'areiasVivas',
    name: 'Acampamento das Areias Vivas',
    biome: 'kalahari',
    region: 'Sul — onde a savana vira Kalahari',
    u: 0.5176, v: 0.8993,
    radius: 100,
    flatten: { radius: 112, blend: 35 },
    population: 340,
    populationNote: 'Nômades: o acampamento muda de lugar a cada estação.',
    demographics: { adultos: 50, criancas: 35, idosos: 15 },
    founded: 'Nunca foi fundado — só montado e desmontado, há gerações.',
    description:
      'Grande acampamento nômade de caçadores e coletores: dezenas de tendas de couro, áreas de ' +
      'suprimentos, cercados para os animais de carga e tótens gigantes de osso nos limites.',
    structures: ['Dezenas de tendas de couro', 'Áreas de suprimentos', 'Cercados de animais de carga', 'Tótens gigantes de osso', 'Fogueiras comunais'],
    lore: {
      speaker: 'Kxao, o Rastreador', title: 'Acampamento das Areias Vivas',
      look: { shirt: 0x8a5a2a, pants: 0x5a4a3a, height: 1.68, build: 0.95 },
      pages: [
        '"Você anda alto demais, estrangeiro. A areia ouve seus pés de longe."',
        '"Chamam de Areias Vivas porque o chão aqui se mexe: as dunas andam, a água some e volta. Quem fica parado, morre. Por isso nada aqui é de pedra."',
        '"Os tótens de osso avisam: daqui para dentro, a caça é nossa. Os ossos são de quem esqueceu disso."',
      ],
    },
  },
  zambaRios: {
    id: 'zambaRios',
    name: 'Zamba dos Rios',
    biome: 'equatorial',
    region: 'Leste — margens da Floresta Equatorial',
    u: 0.7168, v: 0.5243,
    radius: 125,
    flatten: { radius: 48, blend: 28, height: 2.2 },
    population: 1500,
    demographics: { adultos: 58, criancas: 27, idosos: 15 },
    founded: 'Pescadores que seguiram os peixes rio abaixo e nunca voltaram.',
    description:
      'Vila fluvial extensa: dezenas de casas de palafita sobre a água, ligadas por uma rede de ' +
      'trapiches, com uma feira flutuante de jangadas e canoas amarradas nas pilastras.',
    structures: ['Dezenas de palafitas', 'Rede de trapiches', 'Feira flutuante', 'Canoas amarradas', 'Defumadouro de peixe'],
    lore: {
      speaker: 'Mestre Bakary', title: 'Barqueiro-Mor · Zamba dos Rios',
      look: { shirt: 0x1f6a6a, pants: 0x2a2a30, hat: 'straw', height: 1.78 },
      pages: [
        '"Cuidado onde pisa — metade desta vila é água, a outra metade é madeira molhada."',
        '"O rio é estrada, despensa e cemitério. Levamos peixe defumado até a Bússola do Sul e voltamos com ferro e notícias."',
        '"Na cheia, a água sobe até o assoalho. Por isso as casas ficam em palafitas: o rio é visita, não dono."',
      ],
    },
  },
  ruinasKaelen: {
    id: 'ruinasKaelen',
    name: 'Ruínas de Kaelen',
    biome: 'preta',
    region: 'Coração da Floresta Preta',
    u: 0.7168, v: 0.8576,
    radius: 150,
    flatten: { radius: 160, blend: 45 },
    abandoned: true,
    population: 0,
    populationNote: 'Ninguém sabe para onde foram.',
    demographics: null,
    faction: 'Zona corrompida: a névoa engrossa perto do centro',
    founded: 'Conhecida como Vila das Sombras.',
    description:
      'Kaelen foi um reino próspero até a noite em que todos sumiram. Hoje restam dezenas de casas ' +
      'desmoronadas, muros cobertos de musgo negro, uma catedral partida e luzes que flutuam sem dono.',
    structures: ['Dezenas de casas desmoronadas', 'Muros com musgo negro', 'Catedral arruinada', 'Torres partidas', 'Árvores mortas', 'Luzes errantes', 'Pedra de Kaelen'],
    lore: {
      speaker: 'Pedra de Kaelen', title: 'Inscrição gasta',
      pages: [
        'As letras estão meio apagadas, como se alguém tivesse tentado raspá-las.',
        '"…no sétimo dia a névoa não foi embora. Os cães pararam de latir. As crianças falavam com alguém no poço…"',
        '"…quem ler isto: não siga as luzes. Elas sabem o seu nome."',
      ],
      exposure: 5,
    },
  },
};

/** Áreas extras aplainadas (plantações da Bússola do Sul fora da muralha). */
export const EXTRA_FLAT_ZONES = [
  { u: 0.36, v: 0.84, radius: 95, blend: 40 },
  { u: 0.385, v: 0.9, radius: 55, blend: 30 },
];
