/**
 * Tabelas de diálogo do mundo vivo (DialogueEngine).
 *
 * Cada fala: { text, when? }. `when` é um filtro; quanto mais condições uma
 * fala satisfaz, mais prioridade ela tem (a mais específica ganha; empate =
 * sorteio). Condições (qualquer uma pode ser lista = "um destes"):
 *   profession  agricultor | mercador | ferreiro | artesao | cacador | lenhador | pescador | guarda | crianca | idoso
 *   mood        FELIZ | NEUTRO | CANSADO | TRISTE_E_CANSADO | IRRITADO | ASSUSTADO | COM_FRIO | COM_CALOR | RANCOROSO
 *   period      madrugada | manha | almoco | tarde | fim_de_tarde | noite
 *   weather     limpo | chuva | areia | neve | frio | calor
 *   region      central | taiga | deserto | mata
 *   activity    WORK | LUNCH | LEISURE | HOME | WAKE | PATROL | PLAY | REST | SHELTER
 *   player      armado | ensanguentado | insano | correndo | procurado
 *   family      true = tem família (usa {conjuge}/{filho})
 *   memory      provocado | agredido | parente_agredido
 *
 * Marcadores no texto: {nome} {primeiro} {vila} {profissao} {conjuge} {filho}
 * {horas} (horas trabalhadas) {jogador_titulo} (estranho/forasteiro/amigo).
 */

/** Rótulo do humor no cabeçalho da caixa de diálogo. */
export const MOOD_LABELS = {
  FELIZ: 'Animado', NEUTRO: 'Tranquilo', CANSADO: 'Cansado', TRISTE_E_CANSADO: 'Cansado & Cabisbaixo',
  IRRITADO: 'Irritado', ASSUSTADO: 'Assustado', COM_FRIO: 'Tremendo de frio', COM_CALOR: 'Suado', RANCOROSO: 'Hostil',
};

export const DIALOGUE = {
  // ---------------------------------------------------------------- saudar
  greet: [
    { text: 'Bom dia, {jogador_titulo}. Que a estrada te trate bem.', when: { period: 'manha' } },
    { text: 'Boa tarde. Calor danado hoje, não?', when: { period: ['tarde', 'almoco'], weather: 'calor' } },
    { text: 'Boa noite... Não é hora de andar por aí sozinho.', when: { period: ['noite', 'madrugada'] } },
    { text: 'Olá! Precisa de alguma coisa?' },
    { text: 'Hm. Oi.', when: { mood: ['CANSADO', 'TRISTE_E_CANSADO'] } },
    { text: 'Você de novo. O que quer agora?', when: { mood: 'IRRITADO' } },
    { text: 'Não tenho nada pra falar com você.', when: { mood: 'IRRITADO', memory: 'provocado' } },
    { text: 'Fique longe de mim e da minha família.', when: { mood: 'RANCOROSO' } },
    { text: 'Ainda tem coragem de aparecer aqui? Depois do que fez?', when: { mood: 'RANCOROSO', memory: ['agredido', 'parente_agredido'] } },
    { text: 'Ah, oi! Dia bonito, né? Nem parece que a semana foi dura.', when: { mood: 'FELIZ' } },
    { text: 'Minhas costas estão moídas... Passei o dia inteiro sob este sol limpando a terra da plantação e quase não colhi nada. Só quero chegar em casa, ver {conjuge} e deitar...', when: { profession: 'agricultor', mood: 'TRISTE_E_CANSADO', period: 'fim_de_tarde', family: true } },
    { text: 'Já são {horas} horas com a enxada na mão. Se Deus quiser, a colheita vem.', when: { profession: 'agricultor', activity: 'WORK' } },
    { text: 'Ouviu o martelo? Isso aqui não para nunca. Pregos, ferraduras, pontas de lança...', when: { profession: 'ferreiro', activity: 'WORK' } },
    { text: 'O fogo da forja apagou e meus braços também. Volte amanhã.', when: { profession: 'ferreiro', mood: ['CANSADO', 'TRISTE_E_CANSADO'] } },
    { text: 'Chegue mais! Tenho de tudo um pouco, preço justo pra quem conversa direito.', when: { profession: 'mercador', activity: 'WORK' } },
    { text: 'A banca já fechou, amigo. Mas amanhã cedo eu estou aqui.', when: { profession: 'mercador', period: ['fim_de_tarde', 'noite'] } },
    { text: 'Fique de olhos abertos. Nem todo mundo que passa por aqui é amigo.', when: { profession: 'guarda' } },
    { text: 'Ronda da noite. Vá pra dentro, {jogador_titulo}.', when: { profession: 'guarda', period: ['noite', 'madrugada'] } },
    { text: 'Os peixes não querem nada hoje. Acho que sentem a chuva chegando.', when: { profession: 'pescador' } },
    { text: 'Vi pegadas grandes perto do riacho. Leão, talvez. Cuidado se for pra mata.', when: { profession: 'cacador' } },
    { text: 'Cada tora dessas é meio dia de machado. E o inverno nunca acaba.', when: { profession: 'lenhador', region: 'taiga' } },
    { text: 'Estou terminando uma cesta pra minha vizinha. Gosta?', when: { profession: 'artesao' } },
    { text: 'Moço! Moço! Você já viu um leão de verdade?', when: { profession: 'crianca' } },
    { text: 'No meu tempo, a gente cumprimentava tirando o chapéu.', when: { profession: 'idoso' } },
    { text: 'Brrr... Esse vento corta até os ossos. Tem fogo por perto?', when: { mood: 'COM_FRIO' } },
    { text: 'Esse sol vai me derreter. Água, só peço água.', when: { mood: 'COM_CALOR' } },
    { text: 'Sai da chuva, criatura! Vai pegar uma febre.', when: { weather: 'chuva' } },
    { text: 'Cubra o rosto! A areia entra até na alma.', when: { weather: 'areia' } },
    { text: 'Hora do almoço. Senta aí, sempre sobra um pedaço de pão.', when: { activity: 'LUNCH' } },
    { text: 'Que bom ter um rosto novo na fogueira. Conta uma história?', when: { activity: 'LEISURE' } },
    { text: '{conjuge} me espera pro jantar. Até mais.', when: { period: 'fim_de_tarde', family: true } },
  ],
  // ---------------------------------------------------------------- provocar
  provoke: [
    { text: 'Tá procurando confusão? Porque achou.', when: { mood: ['IRRITADO', 'RANCOROSO'] } },
    { text: 'Ei, ei! Eu não quero problema com você!', when: { mood: 'ASSUSTADO' } },
    { text: 'Fala isso de novo e eu chamo a guarda.' },
    { text: 'Você sabe com quem está falando? Eu protejo esta vila.', when: { profession: 'guarda' } },
    { text: 'Mais uma gracinha e você dorme no tronco.', when: { profession: 'guarda', memory: 'provocado' } },
    { text: 'Mãe! MÃE! Esse aí tá me assustando!', when: { profession: 'crianca' } },
    { text: 'Que falta de respeito com um velho. Seus pais não te ensinaram nada?', when: { profession: 'idoso' } },
    { text: 'Depois de doze horas de trabalho eu não tenho paciência pra isso.', when: { mood: ['CANSADO', 'TRISTE_E_CANSADO'] } },
    { text: 'Já não chega o que você fez com a minha família?', when: { memory: 'parente_agredido', mood: 'RANCOROSO' } },
    { text: 'De novo você? Some daqui.', when: { memory: 'provocado' } },
  ],
  // ---------------------------------------------------------------- perguntar (vila/trabalho)
  ask: [
    { text: 'Isso aqui é {vila}. Gente trabalhadora. A praça é o coração de tudo: feira de manhã, fogueira à noite.' },
    { text: 'Trabalho como {profissao} faz anos. Não é fácil, mas é honesto.', when: { activity: 'WORK' } },
    { text: 'Dizem que o poço da praça esconde mais do que água. Eu é que não desço lá.', when: { region: 'central' } },
    { text: 'Quer erva boa? Molineria cresce na mata úmida. Faz um curativo que é uma beleza.', when: { region: 'mata' } },
    { text: 'Nunca vá às Ruínas de Kaelen. Quem vai, volta com os olhos vazios... quando volta.' },
    { text: 'No deserto, a água do oásis é sagrada. Ferva antes de beber, mesmo assim.', when: { region: 'deserto' } },
    { text: 'As fogueiras nunca podem apagar. É a nossa lei. Quem deixa apagar dorme do lado de fora.', when: { region: 'taiga' } },
    { text: 'Os mercadores da praça trocam comida e ferramentas. O ferreiro faz pontas de lança.' },
    { text: 'Tem um velho na casa destruída que cura qualquer coisa. Dizem que ele entende de coisas que a gente não entende.', when: { region: 'central' } },
    { text: 'Ronda dupla, dia e noite. Se vir algo estranho, procure a guarda.', when: { profession: 'guarda' } },
    { text: 'A plantação rende pouco este ano. Pouca chuva e muito gafanhoto.', when: { profession: 'agricultor' } },
    { text: 'Peixe bom só depois da curva do rio. Lá a água é mais funda.', when: { profession: 'pescador' } },
    { text: 'Caçou alguma coisa? Esfola com faca de osso, não estraga a pele.', when: { profession: 'cacador' } },
    { text: 'Moro com {conjuge} na casa perto da rua grande. Se precisar, é só bater.', when: { family: true } },
  ],
  // ---------------------------------------------------------------- comércio
  trade: [
    { text: 'Vamos ver o que posso fazer por você.' },
    { text: 'Pra você? Preço de amigo.', when: { mood: 'FELIZ' } },
    { text: 'Não vendo nada pra gente como você.', when: { memory: ['agredido', 'parente_agredido'] } },
  ],
  // ---------------------------------------------------------------- reação ao estado do jogador
  react: [
    { text: 'Ei! Abaixa essa arma!', when: { player: 'armado' } },
    { text: 'Meu Deus, você está coberto de sangue!', when: { player: 'ensanguentado' } },
    { text: 'O-o que tem nos seus olhos? Fique longe!', when: { player: 'insano' } },
    { text: 'Calma! Por que está correndo assim pra cima de mim?', when: { player: 'correndo' } },
    { text: 'Socorro! Não me machuca!', when: { profession: 'crianca' } },
    { text: 'Afaste-se. Estou de olho em você.', when: { profession: 'guarda' } },
  ],
  // ---------------------------------------------------------------- conversa entre NPCs (balões curtos)
  smalltalk: [
    { text: 'Bom dia, vizinho!', when: { period: 'manha' } },
    { text: 'Dia puxado, hein?', when: { mood: ['CANSADO', 'TRISTE_E_CANSADO'] } },
    { text: 'Vai ter feira amanhã?' },
    { text: 'Viu o tempo? Vem chuva.', when: { weather: ['chuva', 'areia'] } },
    { text: 'Que frio, meu Deus.', when: { mood: 'COM_FRIO' } },
    { text: 'Esse sol tá de matar.', when: { mood: 'COM_CALOR' } },
    { text: 'Ouviu o que aconteceu nas ruínas?' },
    { text: 'Minha colheita? Nem me fale.', when: { profession: 'agricultor' } },
    { text: 'Tudo tranquilo na ronda.', when: { profession: 'guarda' } },
    { text: 'Até a fogueira!', when: { period: 'fim_de_tarde' } },
    { text: 'Boa noite, durma bem.', when: { period: ['noite', 'madrugada'] } },
    { text: 'Vi um forasteiro estranho por aí...', when: { player: ['armado', 'ensanguentado', 'insano'] } },
  ],
  /** Família se cruzando: mais carinho. */
  family: [
    { text: 'Volto pro jantar, {conjuge}.' },
    { text: 'Já comeu hoje?' },
    { text: 'Te amo. Cuidado na estrada.' },
    { text: 'As crianças estão bem?' },
  ],
};

/** Perguntas do menu (tecla E num morador). */
export const DIALOGUE_MENU = [
  { id: 'greet', label: 'Saudar / Cumprimentar' },
  { id: 'provoke', label: 'Antagonizar / Provocar' },
  { id: 'ask', label: 'Perguntar sobre a vila / trabalho' },
  { id: 'trade', label: 'Comerciar / Trocar', traders: true },
];

/**
 * Percepção do jogador: pontos de ameaça (armado, ensanguentado, insano,
 * correndo na direção do NPC). Soma ≥ `startle` assusta (vira e reclama);
 * ≥ `flee` e o NPC não é guarda → foge por `fleeSeconds`.
 */
export const PERCEPTION = {
  radius: 7,
  sprintRadius: 10,
  approachDot: 0.75, // correndo "na direção" = velocidade apontando para o NPC
  bloodyDirt: 70, // sujeira acima disto conta como "coberto de sangue/sujeira"
  insaneBelow: 30,
  startle: 1,
  flee: 2,
  fleeSeconds: 5,
  cooldown: 9, // s até o mesmo NPC reagir de novo
  grudgeAfterProvokes: 3,
};

/** Conversa entre NPCs: param 2–4 s, viram-se um para o outro e trocam balões. */
export const SOCIAL = { radius: 3.2, chance: 0.6, seconds: [2, 4], cooldown: 25, checkEvery: 0.6, bubbleSeconds: 2.6 };
