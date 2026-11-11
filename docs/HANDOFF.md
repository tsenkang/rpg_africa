# Handoff — continuar o desenvolvimento (Claude app / nuvem)

> Leia este arquivo inteiro antes de mexer no código. Ele resume o estado do
> jogo, as decisões já tomadas com o dono do projeto e **a próxima tarefa
> (Etapa C — Lei, Testemunhas e Recompensa)**, com a especificação completa.
>
> Última atualização: 2026-11-10 · branch `completo`.

---

## 1. O projeto em 30 segundos

- RPG 3D de mundo aberto em **Three.js 0.187 + cannon-es**, empacotado com **Vite 8**.
  Continente africano estilizado com 7 biomas, vilas, fauna, clima e dungeons.
- Tudo em **JavaScript puro (ES modules)**, sem framework. UI em HTML/CSS sobre o canvas.
- Textos do jogo em **português do Brasil**. O dono do projeto fala português.
- Entrada: `src/main.js` → `src/core/Game.js` (orquestra tudo; `window.game` exposto para depuração).

```bash
npm install
npm run dev        # http://localhost:5173 (gera o mundo em ~10 s)
npm test           # node --test "tests/**/*.test.js" — 230 testes, todos passando
npm run build      # build de produção em dist/
```

## 2. Convenções obrigatórias (o dono pediu)

- **Data-driven**: números de gameplay ficam em `src/config/*.js`, nunca no meio da lógica.
- **Regras puras e testáveis** em `src/systems/**` (sem Three.js quando possível); renderização em `src/render/**`; HTML em `src/ui/**`.
- **Doc comment com `@example`** em toda classe/função pública.
- **Testes** em `tests/unit/<sistema>/*.test.js` (node:test), nome `cenário_resultadoEsperado`. Ao corrigir bug, escreva o teste, **veja falhar**, corrija, veja passar.
- **Zero alocação no loop** quando der (reutilize vetores, guarde listas).
- **Verificação no jogo de verdade** antes de dizer que está pronto: rode o jogo, interaja e guarde prints em `production/qa/evidence/`. (Nesta máquina usei Edge headless via CDP; na nuvem, use Playwright/Chromium. `window.game` dá acesso a tudo: `game.gameClock.totalHours`, `game.player.teleport(x,z,yaw)`, `game.npcManager`, etc.)
- Fluxo de trabalho com o dono: **pergunta → opções → decisão → rascunho → aprovação**. Para mudanças grandes, apresente um plano curto e peça aprovação; entregue em **etapas testadas** com resumo + prints ao fim de cada uma.
- Commits: Conventional Commits em português (`feat: …`), sem push para `main` sem pedido.
- Alguns arquivos estão em **CRLF** (ex.: `src/config/physics.js`). Scripts que fazem substituição de texto devem normalizar `\r\n`.

## 3. O que já está pronto (por sistema)

| Sistema | Arquivos principais | Tecla |
|---|---|---|
| Física universal (colisor automático para toda peça do mapa, props dinâmicos, sub-passos) | `physics/WorldColliders.js`, `physics/PhysicsWorld.js`, `world/CollisionWorld.js` | — |
| Sobrevivência: ferimentos por membro, infecção, veneno, parasitas, 4 macros, stamina, sujeira | `systems/Body.js`, `Nutrition.js`, `Survival.js`, `config/survival.js` | — |
| Inspeção corporal 3D (girar membro, puxar sanguessuga, arrastar remédio na ferida) | `ui/BodyInspection.js`, `render/WoundVisuals.js` | **C** |
| Mochila + mesa de crafting livre (até 4 itens) | `ui/BackpackUI.js`, `systems/Crafting.js`, `config/items.js` | **I** |
| Caderneta (biomas, fauna, plantas, receitas descobertas) | `systems/Notebook.js`, `ui/NotebookUI.js` | **N** |
| Livro de receitas estilo JEI (como fazer / usado em / onde conseguir, "+" põe na mesa) | `systems/RecipeIndex.js`, `ui/RecipeBookUI.js` | **J** |
| Coleta por bioma, fogueira (assar/ferver/cinza), água de rio | `systems/Resources.js`, `config/resources.js` | E |
| Caça anatômica (cabeça = abate, corpo = sangra com rastro, pernas = manca), lança/arco, esfolar segurando E | `systems/Projectiles.js`, `Skinning.js`, `render/Trails.js`, `config/hunting.js` | clique / E |
| Sanidade: barra sob a vida, gatilhos de trauma, ficha do personagem (atividades de conforto), 3 níveis de alucinação (distorção, sons, vultos), ossadas | `systems/SanityManager.js`, `config/character.js`, `render/Hallucinations.js`, `audio/PhantomSounds.js`, `render/Skeletons.js` | — |
| **Mundo vivo — Etapa A**: 280 moradores (40/vila), famílias com sobrenome e casa, rotina de 24 h, energia/cansaço, roupas por bioma, reação ao clima, LOD de IA, portas trancadas à noite | `systems/npc/NPCManager.js`, `entities/NPCAgent.js`, `systems/npc/Routine.js`, `Population.js`, `NPCVisualBuilder.js`, `config/npcLife.js` | — |
| **Mundo vivo — Etapa B**: diálogo contextual (Fala = F(profissão, humor, cansaço, hora, clima, bioma, família, jogador, memória)), menu Saudar/Provocar/Perguntar/Comerciar, percepção do jogador (armado/ensanguentado/insano/correndo), conversa NPC-NPC com balões, memória e rancor familiar | `systems/npc/DialogueEngine.js`, `config/dialogues.js`, `ui/SpeechBubbles.js` | E |

Outras teclas: **T** câmera 1ª/3ª pessoa, **M** mapa, **G** gráficos, **F** viagem rápida, **V** voo (debug), **H** poção.

### Decisões já tomadas pelo dono (não perguntar de novo)
- Inspeção corporal na tecla **C**; câmera foi para **T**.
- Fome, sede, infecção e veneno **podem matar**.
- **NPCs: soco = nocaute** (levanta depois, conta como agressão); **lança/flecha = podem matar** (conta como assassinato). Corpo fica no chão e dá trauma de sanidade a quem vê.
- **~40 NPCs com rotina por vila**; NPCs de missão (lojistas fixos, anciões, Senhor, prefeito) ficam sempre no posto.
- O livro de receitas mostra **todas** as receitas (foi oferecido esconder as não descobertas; sem resposta ainda).

## 4. Próxima tarefa — Etapa C: Lei, Testemunhas e Recompensa

Pedido original do dono (inspiração: sistema de procurado/recompensa de jogos de faroeste em mundo aberto). Implementar `BountyManager` e `GuardAIController` integrados ao `NPCManager`.

### 4.1 Crimes
- **Agressão**: socar um morador (soco já existe em `Game.tryAttack` → `Combat`; hoje só NPCs antigos estão registrados como alvo — registre os `NPCAgent` com boneco em `game.combat`). Soco derruba (nocaute: estado `KNOCKED_OUT` por ~20 s, deitado), grava `npcManager.remember(agent, 'agredido')` (a família já fica rancorosa — Etapa B pronta).
- **Assassinato**: lança/flecha (`Projectiles` → hoje só testa hitbox de animais em `Game.projectileHit`; incluir hitboxes dos moradores). Morador morre: estado `DEAD`, corpo fica, `game.onNpcDeath(npc)` já existe (dá trauma de sanidade a quem vê).
- **Invasão**: entrar numa casa de outra família (`home` do agente; `game.interiors.insideAt(pos)`), principalmente à noite com a porta destrancada à força (portas: `NPCManager.updateDoors`).
- **Roubo**: pegar itens/props dentro de casas alheias (definir: ex. pegar barril/caixote/pote de dentro de um lar, ou abrir baú).
- Valores sugeridos pelo dono: **50 moedas** por agressão/invasão, **500** por assassinato de civil ou guarda. Pôr em `config/law.js`.

### 4.2 Testemunhas (Witness System)
- Qualquer civil com boneco que **veja** o crime (raio + cone de visão; há `Game.inView(x, z, radius, minDot)` e a percepção em `NPCManager.updateSocial`) entra em `WITNESS`.
- Ícone de **olho** sobre a cabeça (use `SpeechBubbles` ou um ícone próprio), e o civil **corre até o guarda mais próximo** gritando por socorro (balões).
- **Interceptação**: enquanto ele corre, o jogador pode **Intimidar**, **Subornar** (custa moedas) ou **Nocautear** a testemunha (E perto dela abre essas opções; nocautear também é agressão, mas sem testemunha não vira procurado).
- Se a testemunha alcança um guarda → **PROCURADO** naquela vila.

### 4.3 Procurado e zona de busca
- HUD: selo **PROCURADO** e **[RECOMPENSA: 350 Moedas]** da região atual (vila mais próxima; recompensa é por vila/bioma).
- **Círculo vermelho de busca** no minimapa (`render/Minimap.js` desenha ícones; adicione um anel) em volta da última posição conhecida. Guardas correm para investigar.
- Sair do círculo sem ser visto e esperar um **contador de fuga** baixa o alerta; o crime **continua registrado** na recompensa daquela vila.

### 4.4 Guardas (GuardAIController)
- Já existem 6 guardas por vila em duplas, com turnos dia/noite e ronda (`NPCAgent.patrol`). Falta a IA de lei:
  - Com recompensa ativa, ao se aproximar de um guarda ele **reconhece após alguns segundos** de checagem visual.
  - Táticas: perseguir, **flanquear** (dupla se divide), lança/escudo, **chamar reforço com apito/corneta** (som via WebAudio como `audio/PhantomSounds.js`).
  - Dano do guarda no jogador via `game.damagePlayer(n, 'Guarda', null, guardAgent)` (já trata ataque surpresa/crítico na sanidade).
  - Guardas também podem ser nocauteados/mortos (crime grave).

### 4.5 Caçadores de recompensa
- Recompensa total **≥ 1000** → grupos de caçadores (NPCs armados) com **cães** (use `Fauna.spawnGroup('lobo' ou 'hiena', …)` ou espécie nova "cão de caça") surgem aleatoriamente **nas estradas/trilhas entre vilas** e emboscam.

### 4.6 Redenção
- **Comandante da Guarda / Posto de Correio** em cada vila (NPC fixo): pagar a recompensa limpa a ficha daquela vila, desde que **não esteja em combate**.

### 4.7 Memória social
- Vítimas e parentes já guardam rancor (`NPCManager.memory` / `familyMemory`), recusam comércio e ficam hostis (Etapa B). Na C: ao ver o jogador, parente de vítima pode **fugir gritando** ou chamar guarda.

### 4.8 Entrega pedida pelo dono
- Mostrar o código dos gerenciadores (`NPCManager`, `NPCAgent`, `GuardAIController`, `BountyManager`, `DialogueEngine`), a estrutura das tabelas de diálogo, o sistema de testemunhas e a integração no loop.
- Integração no loop hoje (em `Game.update`): `updateSurvival → updateSanity → updateLivingWorld` (este chama `npcManager.update(dt)` e `npcManager.updateSocial(dt, playerPerceptionState)`). Adicionar `bounty.update(dt)` e a IA dos guardas aí.
- `Game.playerPerceptionState` já tem um campo `wanted: !!this.bounty?.wantedHere?.(p)` esperando o `BountyManager` (a tag `procurado` já existe no `DialogueEngine`).

## 5. Mapa rápido do código

```
src/core/Game.js            orquestra init + loop (procure "setupLivingWorld", "updateSanity", "setupHunting")
src/core/Input.js           teclado/mouse (ignora teclas digitadas em <input>)
src/entities/Humanoid.js    boneco humano procedural (opções de roupa: cape, apron, armor, straps, gloves, boots, hat fur/hood)
src/entities/NPCAgent.js    morador: rotina, rotas, reações (FLEE/FACE/CHAT), gestos (applyGesture)
src/systems/npc/*           NPCManager, Routine, Population, NPCVisualBuilder, DialogueEngine
src/config/npcLife.js       rotina, profissões, nomes por região, roupas, LOD
src/config/dialogues.js     tabelas de falas + PERCEPTION + SOCIAL
src/systems/Combat.js       soco por Raycaster (registre alvos com combat.register)
src/systems/Projectiles.js  lança/flecha (zonas de acerto em classifyZone)
```

## 6. Pegadinhas conhecidas
- `game.gameClock.totalHours` controla a hora (1 h de jogo = 50 s reais). Saltos de relógio fazem o `NPCManager` reposicionar todos (`snap`).
- Moradores sem boneco são simulados a cada 0,25 s sem colisão; com boneco usam `collisions.move`.
- Nevascas/tempestades fortes mandam todos para casa (`weatherEnv().shelter`) — vila vazia não é bug.
- Ao verificar com câmera em 3ª pessoa: para olhar um alvo, sete `game.cameraRig.yaw` e confira `game.viewForward()` (a convenção do ângulo engana).
- Os balões de fala ficam escondidos enquanto um diálogo/painel está aberto (proposital).
