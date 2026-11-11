# Lei, Testemunhas e Recompensa (Etapa C)

Visão de código do sistema de lei: gerenciadores, tabelas, testemunhas e a
integração no loop. Pedido em `docs/HANDOFF.md` §4.8.

Regra da casa: **regras puras em `src/systems/law/`** (sem Three.js, testadas em
`tests/unit/law/`), **números em `src/config/law.js`**, interface em `src/ui/`,
cola no `src/core/Game.js`.

## Mapa

| Arquivo | Papel |
|---|---|
| `config/law.js` | `LAW`: valores dos crimes, nocaute, hitbox, testemunhas, procurado, guardas, caçadores, redenção, rancor |
| `systems/law/Crimes.js` | `CrimeLog` (registro), `humanZone` (cabeça/corpo/pernas), `rollLoot` (roubo), `TrespassTracker` (invasão) |
| `systems/law/Witness.js` | `canSee` (cone + audição), `findWitnesses`, `WitnessSystem` (corrida até a guarda, silenciar, alerta sem crime) |
| `systems/law/Bounty.js` | `BountyManager`: recompensa por vila, zona de busca, contador de fuga, `wantedHere` |
| `systems/law/GuardAI.js` | `GuardAIController`: PATROL → reconhecer → CHASE (flanco, ataque, apito/reforço) → INVESTIGATE |
| `systems/law/Hunters.js` | `HunterDirector` (quando surgem), `ambushPoint`, `hunterStep` |
| `systems/law/Redemption.js` | `payQuote` (pagar ao Comandante) |
| `systems/law/Grudge.js` | `grudgeReaction` (vítima/parente: fugir ou chamar a guarda) |
| `entities/NPCAgent.js` | vida (`ALIVE`/`KNOCKED_OUT`/`DEAD`), hitbox, reação `RUN_TO` com velocidade, gesto `thrust`, `commander` fixo no posto |
| `entities/BountyHunter.js` | caçador de recompensa (boneco, vida, golpe) |
| `systems/npc/NPCManager.js` | escolhe o Comandante da Guarda por vila; `homeOfHouse`; memória `morto` → `parente_morto` |
| `ui/WitnessMarkers.js` | selo de olho + distância sobre a testemunha |
| `ui/WantedHUD.js` | selo PROCURADO, recompensa, barra de fuga, dica do Comandante |
| `ui/UI.js` (`drawMinimap`) | círculo vermelho tracejado da zona de busca |
| `audio/Whistle.js` | apito (WebAudio) |
| `ui/Icons.js` | ícones de linha (substituem os emojis em toda a interface) |

## Fluxo de um crime

```
soco / lança / invasão / vasculhar
        │  Game.assaultAgent · onAgentShot · updateLaw · lootHouse
        ▼
Game.reportCrime(type, village, pos, victim)
        ├─ CrimeLog.report → crime { id, type, label, bounty, villageId, x, z, witnessed:false }
        └─ Game.lookForWitnesses(crime)
              findWitnesses(vs.agents, crime, LAW.witness, filtroCasa?)
              WitnessSystem.addCrime(crime, vistos)
                 ├─ guarda viu → crime.witnessed = true → onCrimeWitnessed + GuardAI.alert (apito, reforço)
                 └─ civil viu → corre (RUN_TO) até Game.guardFor(a), grita, selo de olho
                         ├─ jogador intercepta (E): Intimidar · Subornar · Deixar ir   → silence()
                         ├─ jogador soca → testemunha cai (nova agressão, que procura suas próprias testemunhas)
                         └─ chega ao guarda → crime.witnessed = true → onCrimeWitnessed
                                                   └─ BountyManager.recordWitnessed (soma 1× por crime, abre busca)
```

## Estados

**Morador** (`NPCAgent.life`): `ALIVE` → `KNOCKED_OUT` (deitado `LAW.knockoutSeconds`, levanta) · `DEAD` (corpo fica).

**Guarda** (`GuardAIController`, só quando o jogador tem recompensa na vila dele):

```
PATROL ──vê o procurado (medidor 3 s; ×2 a < 8 m)──► CHASE ──8 s sem ver──► INVESTIGATE
   ▲                                                  │  ataque de perto (12, recarga 1,4 s)    │
   └────────────── busca encerrada / recompensa paga ─┴─────────────────────────────────────────┘
```

**Zona de busca** (`BountyManager`): visto por guarda → recentra e zera a fuga; fora do círculo e sem ser visto → `escape` sobe até 1 em `escapeSeconds` → busca termina (a recompensa **fica**).

## Tabelas de diálogo

`config/dialogues.js` → `DIALOGUE[categoria] = [{ text, when }]`. O `DialogueEngine`
pontua cada fala pelas condições de `when` que bate (a mais específica ganha). Tags que a
lei alimenta:

- `player: 'procurado'` vem de `Game.playerPerceptionState().wanted` (= `bounty.wantedHere`).
- `memory: 'agredido' | 'parente_agredido' | 'parente_morto'` vem de `NPCManager.remember` (soco → `agredido`; morte → `morto` na vítima e `parente_morto` na família).

As falas próprias da lei (gritos, denúncia, suborno, guardas, caçadores, rancor) ficam em
`LAW.witness.*Lines`, `LAW.guards.lines`, `LAW.hunters.lines` e `LAW.grudge.*Lines`.

## Integração no loop

`Game.update` → `updateLivingWorld(dt)`:

```js
this.npcManager.update(dt);      // rotina, LOD, portas (reações RUN_TO/FACE já vêm aplicadas)
this.updateLaw(dt);              // invasão (TrespassTracker) e botão de vasculhar
this.updateWitnesses(dt);        // WitnessSystem.update → denúncias; selos de olho
this.updateBounty(dt);           // BountyManager.update (fuga) + WantedHUD
this.updateGuards(dt);           // GuardAIController.update → applyGuardEvents (fala, apito, dano)
this.updateGrudges(dt);          // vítimas/parentes: fugir ou addAlert (chamar a guarda)
this.updateHunters(dt);          // HunterDirector + BountyHunter.update (dano)
```

Projéteis: `Game.projectileHit` testa animais, moradores e caçadores; `onAgentShot`
(cabeça/corpo = assassinato, pernas = derruba) ou `hunter.kill()`.

## Ganchos para depuração (`window.game`)

```js
game.crimes.list                         // todos os crimes
game.bounty.bountyOf('renascimento')     // recompensa da vila
game.bounty.searchOf('renascimento')     // { x, z, r, escape }
game.guardAI.stateOf(agente).mode        // PATROL | CHASE | INVESTIGATE
game.witnesses.entries                   // testemunhas correndo
game.npcManager.villages[i].commander    // Comandante da Guarda
game.spawnHunters()                      // força uma emboscada
```
