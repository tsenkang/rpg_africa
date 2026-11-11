# Ecossistema da fauna (Etapas F1–F4)

Os animais caçam, fogem, defendem a manada e comem carcaças **entre si**,
não só em volta do jogador. Toda regra é pura (sem Three.js), testada em
`tests/unit/fauna/`, e os números ficam em `src/config/`.

## Onde está (classes do pedido → arquivos reais)

| Pedido | Arquivo | Papel |
|---|---|---|
| EcosystemManager | `src/systems/fauna/EcosystemManager.js` | fome/energia, quem caça quem, quem foge de quem, LOD estatístico |
| (regras da cadeia) | `src/systems/fauna/Ecology.js` | dieta por nível, grade espacial, pontuação da presa, chance de abate estatístico |
| PackController | `src/systems/fauna/PackController.js` | matilha (líder, uivo, batedores, interceptadores) e manada (vigia, alarme, debandada, círculo) |
| AnimalBehaviorAI | `src/entities/Animal.js` (`focusPoint`, `update`) + `AnimalBrain.js` | transforma as decisões em movimento: caçar, fugir, flanquear, interceptar, ir comer |
| CombatAnimationSystem | `src/systems/fauna/CombatAnimationSystem.js` | agarrões (leão no pescoço, rolamento do jacaré) |
| (efeitos) | `src/systems/fauna/StatusEffects.js`, `AttackRules.js` | atordoado, preso, lento, veneno; flanco, coice, arrancada |
| (carcaças) | `src/systems/fauna/CarcassSystem.js` | comer aos poucos, necrófagos esperam, decomposição |
| animação | `src/entities/anim/AnimalAnimationManager.js` | poses procedurais de ataque, agarrão, comer |
| números | `src/config/ecosystem.js` (`ECOSYSTEM`, `PACKS`, `CARCASS`), `faunaCombat.js`, `animation.js` | |

## Cadeia alimentar (`ECOSYSTEM.levels`)

| Nível | Espécies | Caça |
|---|---|---|
| 1 superpredadores | leão, onça, urso, jacaré, cérbero | níveis 2, 3, 4 e o jogador |
| 2 meso/matilhas | lobo, hiena, leopardo, javali | nível 4 e o jogador |
| 3 grandes defensores | girafa, alce, camelo, gorila | ninguém; **revidam** |
| 4 presas | zebra, capivara, suricato, avestruz, arara | — |
| 5 pequenos | escorpião, víbora (comem suricato), corvo (necrófago) | — |

Predador só caça com **fome > 60%** e energia > 25%. Abaixo disso fica calmo e
convive com as presas (bebem no mesmo lago). A presa preferida tem vida baixa,
é filhote ou está mancando (`scorePrey`).

## Ataque e fuga por espécie

| Espécie | Ataque | Efeito | Quando ameaçada |
|---|---|---|---|
| leão, onça, leopardo | arrancada + bote, trava no pescoço | presa presa, dano contínuo | — |
| lobo, hiena | mordida no calcanhar pelo flanco, em bando | presa mais lenta | — |
| jacaré | bote da água, rolamento da morte | arrasta para a água | — |
| urso | fica em pé e desce as garras | empurrão | — |
| gorila | soco no chão (área de 3 m) | atordoa | revida |
| girafa | pescoço/casco | atordoa, empurra | revida |
| alce, zebra | coice traseiro em quem chega por trás | atordoa | alce revida; zebra foge/circula |
| camelo | cabeçada | empurrão | revida |
| escorpião, víbora | ferrão/presa | veneno | — |
| zebra, capivara, suricato, avestruz | — | — | vigia → alarme → debandada ou círculo |

## Bandos (F3)

- **Matilha**: o líder escolhe a presa e **uiva** quando ela muda. Metade do resto
  vira **interceptador** e corre para onde a presa estará em 1,6 s fugindo do líder
  (um de cada lado da rota). O resto é **batedor**, que vai direto na presa.
- **Manada**: um adulto é o **vigia** e enxerga predadores 1,6× mais longe. Quando
  alguém vê, todos recebem a mesma ameaça e o vigia dá o **alarme**.
  - Zebra/capivara **com filhotes** contra matilha: **círculo defensivo**, com os
    adultos virados para fora e os filhotes no centro.
  - Senão: **debandada**, todos no mesmo rumo, com pequeno espalhamento.
- **Filhotes**: 35% dos membros não-líderes de manada. Tamanho 0,6, velocidade 0,8,
  metade da vida.

## Carcaças (F4)

- Abate **perto do jogador** (≤ 55 m) → carcaça com carne = vida máxima da presa.
  Abate longe → o predador se alimenta na hora (é estatístico mesmo).
- Predador com fome > 12% num raio de 35 m vem comer. **Comida parada vence a caçada**:
  ele larga a presa viva e até o jogador.
- Hiena e corvo sentem o cheiro a 80 m. Se um predador mais forte está comendo,
  **esperam a 7 m** e entram quando ele sai.
- Até 4 comendo ao mesmo tempo, 6 de carne/s cada. A fome cai na mesma medida
  que `mealPerHealth`.
- A carcaça afunda e achata conforme perde carne e some em 240 s.
- Comendo, o animal fica de cabeça baixa, mastigando e dando puxões.
- Quem está comendo não conta como caçador, então não assusta os vizinhos.

## Integração no loop (`requestAnimationFrame`)

O jogo usa `renderer.setAnimationLoop(() => this.update())` (é um
`requestAnimationFrame` por baixo), em `src/core/Game.js`. A cada quadro:

```text
Game.update()
 └─ fauna.update(dt, player.position, { active, playerAlive })        // systems/Fauna.js
     ├─ ecosystem.update(dt, animals, player)   // fome/energia todo quadro; decisões a cada 0,25 s:
     │    ├─ grid.rebuild(vivos)                // grade espacial de 16 m (vizinhos em O(1))
     │    ├─ predadores → eco.target           // caçar ou conviver
     │    ├─ presas → eco.threat               // vigiar (vigia vê mais longe)
     │    ├─ packs.update(vivos)               // F3: alvo comum, papéis, alarme  → eventos howl/alarm
     │    └─ LOD: caçada longe do jogador      // chance de abate estatística   → eventos kill
     ├─ eventos: kill → applyKill (carcaça ou refeição); howl/alarm → som
     ├─ carcasses.update(dt, animals)          // F4: quem come, quem espera; decompõe
     ├─ grapples.update(dt, …)                 // F2: dano por segundo, arrasto para a água
     ├─ para cada animal: animal.update(dt, …) // foco → estado → movimento → animação
     │    └─ golpes/coices → hitAnimal / hitPlayer
     └─ decayLook(carcaças)                    // afunda/achata
```

## Custo

- As decisões rodam a cada 0,25 s, não a cada quadro.
- A busca de vizinhos usa a grade espacial.
- Só existem animais num raio de ~120 m do jogador (máx. 16).
- Caçadas além de 55 m do jogador não têm perseguição física: um sorteio por tique
  decide o abate.
- `PackController` e `CarcassSystem` são O(n) por tique e reaproveitam arrays.

## Limites conhecidos

- Todas as poses são procedurais (o código move corpo e juntas). Lobo e alce têm
  clipes próprios; neles as poses novas mexem só o corpo inteiro.
- O corvo é atraído pela carcaça, mas a máquina de voo dele (pousa e levanta voo
  com o jogador por perto) quase nunca o deixa pousar para comer.
- Durante um agarrão no jogador não há como se soltar.
- O uivo e o alarme são sons sintetizados.
