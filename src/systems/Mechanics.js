import { GAMEPLAY } from '../config/gameplay.js';

/**
 * Mecânicas de interação (diálogos e consequências).
 * Cada função recebe o `game` e abre um diálogo com opções.
 *
 * Serviços usados:
 *   game.state          PlayerState (vida, moedas, itens, efeitos, confiança)
 *   game.ui.dialogue    open({ speaker, title, text, options:[{label, onSelect, disabled}] })
 *   game.ui.toast(msg)
 *   game.enterArea(id)  teleporta para uma masmorra / volta à superfície
 *   game.villages.bussola.gate  portão da Bússola do Sul
 */
export const Mechanics = {
  // ------------------------------------------------------------------
  // VILA PERSEGUIÇÃO — Mendigo: conversa e dá a Injeção Suspeita
  // (ao usar: 50% cura total / 50% Febre do Mendigo — ver Items.js)
  // ------------------------------------------------------------------
  beggar(game) {
    const cfg = GAMEPLAY.beggar;
    const item = GAMEPLAY.items.injecao_suspeita;
    const say = (text, options) => game.ui.dialogue.open({ speaker: 'Mendigo', title: 'Praça da Saudade · Vila Perseguição', text, options });
    const wait = (game.flags.beggarReadyAt ?? 0) - game.time;
    if (wait > 0) {
      say(`"A Praça ainda tá sussurrando, viajante… volta depois, que eu procuro mais nas ruínas." (${Math.ceil(wait)} s)`, [{ label: 'Sair' }]);
      return;
    }
    const hasOne = game.inventory.slots.some((x) => x?.id === item.id);
    const give = () => {
      if (game.inventory.adicionarItem({ ...item }) === -1) {
        say('"Suas mãos tão cheias, viajante. Larga alguma coisa e volta." (A hotbar está cheia.)', [{ label: 'Certo' }]);
        return;
      }
      game.flags.beggarReadyAt = game.time + cfg.cooldownSeconds;
      game.ui.toast(`Você recebeu: ${item.icone} ${item.nome}. Equipe na hotbar (1–8) e clique para usar.`);
    };
    const lines = [
      '"Ei, viajante… você tem os olhos de quem já viu o outro lado. A Praça da Saudade sussurra à noite, sabia?"',
      '"Esta vila é amaldiçoada desde o dia em que abriram aquele alçapão. Os mortos não foram embora… eles só pararam de fazer barulho. '
        + 'Todo mundo aqui finge que não ouve. Eu não finjo mais. Por isso me chamam de louco."',
      '"O mundo tá doido, meu filho. Gente vendendo água pra quem tá se afogando, prefeito cobrando confiança como se fosse imposto… '
        + 'e eu aqui, o único que fala a verdade, pedindo moeda."',
      hasOne
        ? '"Você já tem uma das minhas. Usa ela primeiro… e me conta o que viu."'
        : '"Eu encontrei isso nas ruínas. Disseram que cura tudo. Ou que te faz ver os mortos. Não lembro bem… Tome, injete isso e descubra."',
    ];
    const step = (i) => {
      const last = i === lines.length - 1;
      say(lines[i], last
        ? (hasOne ? [{ label: 'Ir embora' }] : [{ label: `Aceitar a ${item.nome}`, onSelect: give }, { label: 'Recusar e ir embora' }])
        : [{ label: 'Continuar…', onSelect: () => step(i + 1) }, { label: 'Ir embora' }]);
    };
    step(0);
  },

  // ------------------------------------------------------------------
  // VILA RENASCIMENTO — Senhor (Especialista em NEX): único que cura a febre
  // ------------------------------------------------------------------
  healer(game) {
    const s = game.state;
    const sick = s.hasEffect('febre_mendigo');
    const cfg = GAMEPLAY.healer;
    const options = [];
    if (sick) {
      options.push({
        label: 'Pedir a cura da Febre do Mendigo',
        onSelect: () => {
          if (s.removeEffect('febre_mendigo', 'senhor_nex')) {
            game.ui.dialogue.open({
              speaker: 'Senhor (Especialista em NEX)',
              text: '"Esse velho de Perseguição de novo… Beba isto, devagar." A febre passa. Você está curado.',
              options: [{ label: 'Obrigado, senhor' }],
            });
          }
        },
      });
    }
    options.push({
      label: `Tratar ferimentos (${cfg.healCost} moedas)`,
      disabled: s.health >= s.maxHealth || s.coins < cfg.healCost,
      onSelect: () => {
        s.spend(cfg.healCost);
        s.healFull();
        game.ui.toast('Vida restaurada pelo Senhor.');
      },
    });
    if (!game.flags.gotLetter) {
      options.push({
        label: 'Pedir uma carta de recomendação',
        onSelect: () => {
          game.flags.gotLetter = true;
          s.addItem('carta_recomendacao');
          game.ui.dialogue.open({
            speaker: 'Senhor (Especialista em NEX)',
            text: '"O prefeito da Bússola do Sul me deve a vida da filha dele. Leve esta carta ao mensageiro no portão."',
            options: [{ label: 'Guardar a carta' }],
          });
        },
      });
    }
    options.push({
      label: 'Perguntar sobre o NEX',
      onSelect: () => game.ui.dialogue.open({
        speaker: 'Senhor (Especialista em NEX)',
        text: '"NEX é o que sobra de nós quando o paranormal encosta. Eu estudo isso há quarenta anos. '
          + 'Quanto mais exposição, mais perto você fica do outro lado."',
        options: [{ label: 'Sair' }],
      }),
    });
    options.push({ label: 'Sair' });
    game.ui.dialogue.open({
      speaker: 'Senhor (Especialista em NEX)', title: 'Casa destruída — Vila Renascimento',
      text: sick
        ? '"Esses olhos amarelados… você bebeu alguma coisa do mendigo de Perseguição, não foi?"'
        : '"A casa caiu, mas eu continuo de pé. Sou o único que trata gente nesta vila. O que precisa?"',
      options,
    });
  },

  shopkeeper(game, { name = 'Lojista', village = '' } = {}) {
    const s = game.state;
    const price = GAMEPLAY.shop.potionPrice;
    game.ui.dialogue.open({
      speaker: name, title: village,
      text: '"Temos de tudo um pouco: farinha, querosene, tecido… e um frasco ou outro de poção."',
      options: [
        {
          label: `Comprar Poção de Cura Total (${price} moedas)`,
          disabled: s.coins < price,
          onSelect: () => { s.spend(price); s.addItem('pocao_cura_total'); game.ui.toast('Poção de Cura Total comprada.'); },
        },
        { label: 'Só olhando' },
      ],
    });
  },

  // ------------------------------------------------------------------
  // Poço da Vila Renascimento — entrada secreta para a sede do KKK
  // ------------------------------------------------------------------
  well(game) {
    const options = [
      {
        label: 'Tirar água e beber',
        onSelect: () => { game.state.heal(5); game.ui.toast('Água fresca. +5 de vida.'); },
      },
    ];
    if (!game.flags.wellExamined) {
      options.push({
        label: 'Examinar o poço com atenção',
        onSelect: () => {
          game.flags.wellExamined = true;
          game.ui.dialogue.open({
            speaker: 'Poço d\'água',
            text: 'Logo abaixo da borda, escondidos pelo musgo, há degraus de ferro chumbados na pedra. '
              + 'Eles descem muito além do nível da água… e uma corrente de ar frio sobe lá de baixo.',
            options: [{ label: 'Descer pelos degraus', onSelect: () => game.enterArea('sedeKKK') }, { label: 'Deixar para depois' }],
          });
        },
      });
    } else {
      options.push({ label: 'Descer pelos degraus secretos', onSelect: () => game.enterArea('sedeKKK') });
    }
    options.push({ label: 'Sair' });
    game.ui.dialogue.open({
      speaker: 'Poço d\'água', title: 'Praça central — Vila Renascimento',
      text: 'O poço mais antigo do continente. A água é limpa e gelada.',
      options,
    });
  },

  priest(game) {
    game.ui.dialogue.open({
      speaker: 'Padre', title: 'Igreja — Vila Renascimento',
      text: '"Nossa igreja é a mais bem cuidada do continente. Por fora e por dentro." '
        + 'Ele sorri, mas os olhos dele vão rápido até o poço da praça.',
      options: [{ label: 'Sair' }],
    });
  },

  // ------------------------------------------------------------------
  // Masmorra "Holocausto" (sob a Praça da Saudade)
  // ------------------------------------------------------------------
  holocaustoHatch(game) {
    const cfg = GAMEPLAY.holocausto;
    game.ui.dialogue.open({
      speaker: 'Alçapão de ferro', title: 'Praça da Saudade — Vila Perseguição',
      text: `Uma escada desce para o "Holocausto". Lá embaixo o poder das relíquias aumenta `
        + `${Math.round(cfg.relicBonus * 100)}% por ${cfg.buffDuration} s, mas cada descida causa `
        + `${cfg.paranormalExposure}% de exposição paranormal.`,
      options: [{ label: 'Descer', onSelect: () => game.enterArea('holocausto') }, { label: 'Não descer' }],
    });
  },

  // ------------------------------------------------------------------
  // VILA BÚSSOLA DO SUL — confiança do prefeito abre o portão
  // ------------------------------------------------------------------
  mayorEnvoy(game) {
    const s = game.state;
    const cfg = GAMEPLAY.bussolaTrust;
    const trust = s.trust.bussola;
    const gate = game.villages.bussola?.gate;
    if (trust >= cfg.required) {
      game.ui.dialogue.open({
        speaker: 'Mensageiro do Prefeito', title: 'Portão da Bússola do Sul',
        text: '"O prefeito confia em você. As portas estão abertas."',
        options: [{ label: 'Sair' }],
      });
      return;
    }
    const gain = (amount, msg) => {
      s.trust.bussola = Math.min(100, s.trust.bussola + amount);
      s.emit('change');
      if (s.trust.bussola >= cfg.required) {
        gate?.setOpen(true);
        game.ui.toast('O prefeito confia em você. O portão da Bússola do Sul se abre!');
      } else {
        game.ui.toast(`${msg} Confiança do prefeito: ${s.trust.bussola}/${cfg.required}`);
      }
    };
    const options = [
      {
        label: `Pagar tributo à vila (${cfg.tributeCost} moedas, +${cfg.tributeTrust})`,
        disabled: s.coins < cfg.tributeCost,
        onSelect: () => { s.spend(cfg.tributeCost); gain(cfg.tributeTrust, 'Tributo aceito.'); },
      },
    ];
    if (s.hasItem('carta_recomendacao')) {
      options.push({
        label: `Entregar a carta do Senhor da Vila Renascimento (+${cfg.letterTrust})`,
        onSelect: () => { s.removeItem('carta_recomendacao'); gain(cfg.letterTrust, 'O mensageiro reconhece o selo.'); },
      });
    }
    if (!game.flags.envoyTalked) {
      options.push({
        label: `Conversar sobre a vila (+${cfg.talkTrust})`,
        onSelect: () => {
          game.flags.envoyTalked = true;
          gain(cfg.talkTrust, 'O mensageiro gostou da conversa.');
        },
      });
    }
    options.push({ label: 'Sair' });
    game.ui.dialogue.open({
      speaker: 'Mensageiro do Prefeito', title: 'Portão da Bússola do Sul',
      text: `"Ninguém atravessa estas muralhas sem a confiança do prefeito. Estamos em guerra com as tribos do sul; `
        + `só os Luiheid são bem-vindos." Confiança atual: ${trust}/${cfg.required}.`,
      options,
    });
  },

  gateGuard(game) {
    const open = game.villages.bussola?.gate?.open;
    game.ui.dialogue.open({
      speaker: 'Guarda do Portão',
      text: open ? '"Pode passar. Não arrume confusão."' : '"Portão fechado. Fale com o mensageiro do prefeito."',
      options: [{ label: 'Sair' }],
    });
  },

  mayor(game) {
    game.ui.dialogue.open({
      speaker: 'Prefeito', title: 'Mansão do Prefeito — Bússola do Sul',
      text: '"Bem-vindo à vila mais rica do continente. Nossos canhões nos protegem, os Luiheid nos abastecem '
        + 'e o relógio da praça guarda tudo o que temos. Não chegue perto do relógio à noite."',
      options: [{ label: 'Sair' }],
    });
  },

  vault(game) {
    game.ui.dialogue.open({
      speaker: 'Grande Relógio', title: 'Cofre da Bússola do Sul',
      text: 'Na base da torre há uma porta de ferro com três fechaduras. O cofre da vila fica logo abaixo. '
        + '(Ponto de extensão: sistema de chaves/assalto em Mechanics.vault.)',
      options: [{ label: 'Sair' }],
    });
  },

  // ------------------------------------------------------------------
  // VILA ABSTRAÇÃO
  // ------------------------------------------------------------------
  hoogmoedGuard(game) {
    game.ui.dialogue.open({
      speaker: 'Guerreiro Hoogmoed', title: 'Vila Abstração',
      text: '"Esta vila é da tribo Hoogmoed agora. Ande na linha, estrangeiro. O chefe está reunido na casa grande."',
      options: [{ label: 'Sair' }],
    });
  },

  populist(game) {
    game.ui.dialogue.open({
      speaker: 'Morador', title: 'Vila Abstração',
      text: '"Éramos quinhentos. Agora somos dois mil… mas ninguém aqui escolheu isso. Levaram tudo da feira, '
        + 'até as panelas."',
      options: [{ label: 'Sair' }],
    });
  },

  medicHouse(game) {
    const s = game.state;
    game.ui.dialogue.open({
      speaker: 'Curandeira', title: 'Casa Medicinal — Vila Abstração',
      text: s.hasEffect('febre_mendigo')
        ? '"Essa febre não é coisa minha. Só o velho da casa caída, em Renascimento, sabe tratar."'
        : '"Ervas, ataduras e paciência. É o que temos."',
      options: [
        {
          label: 'Tratar ferimentos (20 moedas)',
          disabled: s.coins < 20 || s.health >= s.maxHealth,
          onSelect: () => { s.spend(20); s.heal(50); game.ui.toast('+50 de vida.'); },
        },
        { label: 'Sair' },
      ],
    });
  },

  // ------------------------------------------------------------------
  // Genéricos
  // ------------------------------------------------------------------
  talk(game, { speaker, title = '', text }) {
    game.ui.dialogue.open({ speaker, title, text, options: [{ label: 'Sair' }] });
  },
};
