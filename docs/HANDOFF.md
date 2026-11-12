# Handoff — continuar o desenvolvimento (Claude app / nuvem)

> Leia este arquivo inteiro antes de mexer no código. Ele resume o estado do
> jogo, as decisões já tomadas com o dono do projeto e o que fazer a seguir.
> A Etapa C (Lei, Testemunhas e Recompensa) está **pronta** — visão de código em `docs/LAW-SYSTEM.md`.
>
> Última atualização: 2026-11-11 · branch `ccr-f440db29-mlw9d3` (a partir de `completo`).

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
npm test           # node --test "tests/**/*.test.js" — 303 testes (1 instável conhecido: ver §6)
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
| **Lei — Etapa C**: crimes (agressão = nocaute, assassinato, invasão, roubo ao vasculhar), testemunhas (olho, corrida até a guarda, intimidar/subornar), PROCURADO por vila com zona de busca e fuga, IA dos guardas (reconhecer, perseguir, flanquear, atacar, apito), caçadores de recompensa com cães (≥ 1000), Comandante da Guarda (pagar limpa a ficha), parentes das vítimas | `systems/law/*`, `config/law.js`, `ui/WantedHUD.js`, `ui/WitnessMarkers.js`, `entities/BountyHunter.js` — ver `docs/LAW-SYSTEM.md` | E / clique |
| **Limite de inclinação 45°** (jogador, animais, moradores, caçadores): bloqueia subida, escorregão até chão firme, IA contorna montanhas, som de derrapagem | `systems/physics/SlopePhysics.js`, `config/physics.js` (`SLOPE`) — ver `docs/SLOPE-PHYSICS.md` | — |
| **Ecossistema da fauna — F1–F4**: cadeia alimentar em níveis, fome/energia (caça só > 60%), LOD estatístico, ataques por espécie (agarrão, rolamento, coice, flanco, soco no chão, veneno), matilhas (líder uiva, batedores/interceptadores), manadas (vigia, alarme, debandada, círculo defensivo, filhotes), carcaças com necrófagos | `systems/fauna/*`, `config/ecosystem.js`, `config/faunaCombat.js` — ver `docs/FAUNA-ECOSYSTEM.md` | — |
| **Água e barco — A1–A6**: oceano FFT de 4 cascatas (Tidewater, WebGL2), refração/absorção/reflexo/cáusticas/mergulho, barco pilotável com flutuação por pontos, esteira de Kelvin + espuma + spray, ondas de costa com quebra e espraiado, menu Esc com ajustes | `src/world/Water.js`, `src/render/ocean/*`, `src/systems/ocean/*`, `src/systems/boat/*`, `src/ui/PauseMenu.js` — ver `docs/OCEAN-SYSTEM.md` | E (barco) / Esc |

Outras teclas (todas listadas no menu do **Esc** → Controles): **T** câmera 1ª/3ª pessoa, **M** mapa, **G** gráficos, **F** viagem rápida, **V** voo (debug), **H** poção.

### Decisões já tomadas pelo dono (não perguntar de novo)
- **Sem elefante** (não há modelo 3D): girafa, alce e camelo são os grandes defensores.
- Inspeção corporal na tecla **C**; câmera foi para **T**.
- Fome, sede, infecção e veneno **podem matar**.
- **NPCs: soco = nocaute** (levanta depois, conta como agressão); **lança/flecha = podem matar** (conta como assassinato). Corpo fica no chão e dá trauma de sanidade a quem vê.
- **~40 NPCs com rotina por vila**; NPCs de missão (lojistas fixos, anciões, Senhor, prefeito) ficam sempre no posto.
- O livro de receitas mostra **todas** as receitas (foi oferecido esconder as não descobertas; sem resposta ainda).
- **Interface sem emojis**: ícones de linha próprios em `ui/Icons.js`; dados guardam a chave (`icon: 'leaf'`). Um teste falha se um ícone não existir.
- Roubo = **vasculhar com E** dentro de casa alheia (móveis dos interiores são só visuais). Lança/flecha nas **pernas derruba**, cabeça/corpo mata.

### Iluminação e gráficos (L1–L4)
- IBL do céu, Kelvin, fogo, materiais PBR com chuva molhando, pós-processamento cinematográfico, sonda de reflexo e o nível **Cinemático** (6º nível, acima do Ultra). Arquitetura e ajustes: `docs/LIGHTING-SYSTEM.md`.

## 4. Próximos passos (sugestões — confirmar com o dono)

A Etapa C foi entregue em 5 fatias (C1 crimes · C2 testemunhas · C3 procurado · C4 guardas · C5 caçadores/redenção/rancor), cada uma com testes em `tests/unit/law/` e prints em `production/qa/evidence/lei-c*.jpg`.

Pontas soltas conhecidas:
- Guardas e caçadores não seguram uma lança 3D; o ataque é o gesto `thrust`.
- Não há estradas entre vilas no mapa: "na estrada" = fora da região de qualquer vila (`LAW.bounty.regionMargin`).
- Reforço em dupla/flanco e o apito só foram vistos nos testes, não no navegador (no teste havia um guarda por perto).
- Crimes/recompensas não são salvos (não há sistema de save).

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
- Testes de imagem: `weather.force` dura só até a próxima hora sorteada; para clima fixo, substitua `weather.scheduler.roll` no teste.
- `WakeSim` gera 1 erro WebGL (sampler) no primeiro quadro — antigo (A4), inofensivo, ainda não corrigido.
- **Teste instável (antigo)**: `tests/unit/animation/humanoid-animation.test.js` ("entrar e sair da água…") falha ~1 em 12 execuções — `Humanoid` sorteia `phase`/`idleT`/`strokePhase` com `Math.random`. Tornar injetável resolve.
- Verificação na nuvem (Chromium sem GPU) roda ~1 FPS: o relógio do jogo anda ~25× mais devagar; encurte tempos no `cfg` do teste em vez de esperar.
- `game.gameClock.totalHours` controla a hora (1 h de jogo = 50 s reais). Saltos de relógio fazem o `NPCManager` reposicionar todos (`snap`).
- Moradores sem boneco são simulados a cada 0,25 s sem colisão; com boneco usam `collisions.move`.
- Nevascas/tempestades fortes mandam todos para casa (`weatherEnv().shelter`) — vila vazia não é bug.
- Ao verificar com câmera em 3ª pessoa: para olhar um alvo, sete `game.cameraRig.yaw` e confira `game.viewForward()` (a convenção do ângulo engana).
- Os balões de fala ficam escondidos enquanto um diálogo/painel está aberto (proposital).
