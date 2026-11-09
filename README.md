# Jogo África — Continente (Three.js)

Jogo 3D single-player feito com [Three.js](https://threejs.org) + [Vite](https://vitejs.dev).
O continente é um **mundo 3D real** gerado a partir do mapa de referência. A imagem não é
esticada sobre um plano: dela vêm as posições dos biomas, do lago, das pontes, dos rios e das vilas.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:5173. A geração do mundo leva cerca de 10–15 s e mostra uma barra de progresso.

Para gerar e testar o build:

```bash
npm run build      # gera dist/
npm run preview    # testa o build
```

## Controles

| Tecla | Ação |
|---|---|
| WASD (↑ ↓ também) | mover (relativo à câmera) |
| ← → ou Q / R | girar a câmera para os lados (PageUp/PageDown inclinam) |
| **Shift** | **correr** (sprint): 2× a velocidade de andar (4,2 → 8,4 m/s). O FOV abre de 62° para 72° e a câmera balança mais; a diagonal é normalizada |
| Espaço | pular |
| **ALT** | travar/destravar o cursor (mouse gira a câmera livremente). Esc também solta. Sem trava, arraste com o botão esquerdo/direito |
| **C** | alternar câmera em **1ª pessoa** (olhos) / **3ª pessoa** (atrás e acima) |
| Roda | zoom (3ª pessoa) |
| E | interagir (NPCs, poço, alçapão, relógio) |
| 1–9 / clique | escolher opção no diálogo (Esc fecha) |
| H | usar Poção de Cura Total |
| M | mapa do continente; clique num ponto para viajar |
| F | viagem rápida (velocidade ×7) |
| **V** | **modo voo**: Espaço sobe, Ctrl desce, Shift acelera ×5, roda afasta a câmera até 400 m |
| 1–8 | escolher o slot da hotbar (slot vazio = **Mãos Livres**) |
| Clique esquerdo | com Mãos Livres: **fala** com o NPC na mira (até 2,6 m) ou dá um **soco**; com um item equipado (ex.: Injeção Suspeita), **usa** o item |
| Na água: Espaço / Ctrl | **nadar** para cima / para baixo (em 1ª pessoa, andar para frente segue o olhar). Sem tecla, o corpo flutua |

## Escala

- 1 unidade = 1 metro. O personagem tem 1,80 m.
- O mapa tem 4.096 × 2.304 m (8 m por pixel da imagem de 512×288).
- Portas medem 1,0 × 2,1 m, o pé-direito tem 2,8–3,2 m e as casas têm de 5 a 10 m.
- A muralha da Bússola tem 9 m. As acácias têm 6–10 m e os baobás até 20 m.
- As texturas são projetadas em tamanho real (tijolos, pedras e telhas na escala do personagem).

## Realismo (texturas fotográficas)

O visual segue o modelo de referência *a forest with a road*: o realismo vem de **fotos**, não de geometria pesada.

- **Chão**: foto de chão de floresta com mapa normal (`public/assets/textures/ground_*`). A foto é dividida pela cor média e vira "detalhe" sobre a cor de cada bioma.
  - Duas amostras giradas escondem a repetição.
  - O quanto a foto aparece em cada bioma fica em `GROUND_PHOTO.strength` (`src/config/photoAssets.js`).
- **Árvores**: cartões cruzados com recortes de fotos (`foliage_atlas.webp`). Os recortes estão em `FOLIAGE_SPRITES`.
  - Acácias usam copas vistas de cima, em camadas achatadas (guarda-chuva).
  - Abetos e pinheiros usam fotos laterais.
- **Árvores 3D** (`src/config/treeModels.js`):
  - Carvalhos do pacote *oak trees pack*: folhosas, sumaúmas, Floresta Preta e árvores mortas. Modelo perto, billboard longe.
  - Acácias do modelo *free acacia african*: acácias da savana e acácias-camelo do Kalahari. O modelo tem poucas folhas, então a copa é completada com cartões de foto em guarda-chuva (`canopy`). Longe, usam os cartões da acácia procedural.
  - Cada GLB tem uma cópia `*.glb.json` (base64), usada quando o servidor não entrega `.glb` (o artefato publicado).
- **Troncos**: foto de casca com mapa normal (`bark_*`).
- **Capim**: tufos de foto, verdes ou secos conforme o bioma (`GRASS_DRYNESS`).

Para trocar uma foto, substitua o arquivo e ajuste a cor média (`mean`) em `photoAssets.js`.

> **Por que não abre com duplo clique no `index.html`?** O navegador bloqueia módulos JavaScript em arquivos `file://`. Use `npm run dev`, sirva a pasta `dist/` com qualquer servidor http (`npm run preview`), ou abra o link do artefato.

## Hotbar e soco

- **Inventário** (`src/systems/Inventory.js`): 8 slots (`GAMEPLAY.inventory.slots`). O item do slot ativo é o equipamento; slot vazio = `MAOS_LIVRES`.
  - Para testar no console do navegador: `adicionarItem({ id: 'faca', nome: 'Faca', icone: '🔪' })` (devolve o slot, ou -1 se estiver cheio).
  - A HUD mostra a hotbar embaixo e o texto "Equipado: …".
- **Soco** (`src/systems/Combat.js`): com Mãos Livres, um clique esquerdo curto (ou qualquer clique com o cursor travado) dá um soco para onde a câmera olha.
  - Dois `Raycaster`s curtos (peito e cintura, alcance 1,7 m) procuram NPCs, o boneco de treino e as construções das vilas.
  - Feedback: braço do personagem estica, tranco na câmera, aviso "Acertou: X" no centro e `console.log("Soco desferido! Acertou: X")`.
  - NPCs recuam um pouco. O **boneco de treino** (ao lado de onde você começa, em Renascimento) perde vida, balança, tomba e volta depois de 4 s.
  - Valores em `GAMEPLAY.combat.punch` e `GAMEPLAY.trainingDummy` (`src/config/gameplay.js`).
- Testes: `npm test` (inventário e soco, com o `node:test` do próprio Node).

## Câmera e trava do cursor

- **ALT** (`src/core/Input.js`, classe `AltLockToggle`): trava o cursor ao **pressionar** ALT, e solta no próximo ALT (ou Esc). Segurar ALT ou combinar com outra tecla (Alt+Tab etc.) não alterna de novo. O aviso acima da hotbar mostra o estado.
- **C** (`src/core/CameraRig.js`): 1ª pessoa na altura dos olhos (o corpo some, aparecem a mira e o braço direito, que estica no soco) ou 3ª pessoa orbitando as costas. Os dois modos usam o mesmo ângulo horizontal, então WASD continua indo para onde a câmera olha ao trocar.
- Valores em `src/config/camera.js` (sensibilidade, distância, altura dos olhos, limites de inclinação).
- Alguns navegadores e páginas embutidas recusam a trava; o jogo avisa e o arrastar com o mouse continua funcionando.

## Corrida, balanço da câmera e animação do personagem

- **Sprint** (`src/entities/Locomotion.js` — regras puras, testadas): `wantsSprint` (Shift + andando, não nadando) e `resolveMoveSpeed` (andar × `PLAYER.sprintMultiplier`). `Player.sprinting` é o estado lido pela câmera.
- **FOV e head bobbing** (`src/core/CameraRig.js`, valores em `src/config/camera.js`): o FOV interpola por tempo (`approach`, independente do framerate) entre `fov` e `sprintFov`; o balanço tem dois quiques por ciclo e sobe de frequência e amplitude ao correr, em 1ª e 3ª pessoa.
- **Humanoide** (`src/entities/Humanoid.js`): joelhos, cotovelos, mãos com dedos, rosto (olhos, sobrancelhas, nariz, orelhas, boca). Parado respira, muda o peso e olha em volta; andar e correr têm cadência pela passada (`BODY.strideWalk/strideRun`), joelho dobrando no balanço, tronco contra o quadril, inclinação e cotovelos a 90° na corrida; soco em três fases (preparo, golpe com giro do tronco, recolhe) com o outro braço em guarda. Os NPCs usam o mesmo corpo.

## Biomas

Cada bioma tem cor de chão, capim, árvores, neblina, luz do sol e exposição próprios
(veja `src/config/biomes.js`). A luz e a neblina mudam suavemente conforme você anda.

| Bioma | Vegetação |
|---|---|
| Savana | acácias-guarda-chuva, baobás, arbustos, capim alto e dourado |
| Taiga (montanhas do norte) | abetos e pinheiros, rochas, neve no topo |
| Deserto | dunas, quase sem vegetação, arbustos secos |
| Deserto de Kalahari | acácia-camelo (*camelthorn*), arbustos secos, capim ralo |
| Floresta Tropical | palmeiras, bananeiras, folhosas, arbustos densos |
| Floresta Equatorial | sumaúmas gigantes (raízes tabulares), folhosas, sub-bosque fechado |
| Floresta Preta | árvores escuras e retorcidas, árvores mortas, neblina densa |

## Vilas

| Vila | Onde | Destaques |
|---|---|---|
| **Renascimento** (5.000 hab.) | ilha do lago central, 8 pontes | praça com poço, igreja, lojas, casa destruída do Senhor (NEX). **O poço leva à sede secreta sob a igreja.** |
| **Perseguição** (1.467 hab.) | leste | cerca de mini estacas, feira grande, Praça da Saudade com memorial, **alçapão do Holocausto** e o **mendigo** |
| **Abstração** (2.000 populistas) | noroeste | muro de troncos, igreja grande saheliana, 2 lojas, feira humilde, casa medicinal, casa do líder Hoogmoed |
| **Bússola do Sul** (3.000+ hab.) | sul, às margens do rio | muralha com canhões e guardas, catedral, mansão, grande relógio (cofre), 2 feiras, área comercial, plantações, fazenda, porto |

As casas (`house()` e `rondavel()` em `src/villages/Builders.js`) têm rodapé de pedra, cunhais e cinta de madeira, porta pintada com batente e degrau, janelas com moldura, peitoril e venezianas, e telhado com espessura, beiral e cumeeira. Conforme a posição, cada casa ganha varanda, chaminé, potes e lenha (a variação usa uma semente tirada da posição, então o sorteio da vila não muda).

## Marcos do mapa

Construções e relevo tirados da imagem de referência. Ficam em `src/config/landmarks.js`, com posições em (u, v) da imagem:

| Marco | Bioma | O que é |
|---|---|---|
| **Torre Negra** | savana (noroeste) | pináculo octogonal de basalto com 52 m, fendas acesas e anel de muro em ruínas |
| **Templo dos Degraus** | floresta tropical (oeste) | pirâmide de 6 patamares com escadaria, santuário e braseiros, cipós e estelas |
| **Fortaleza das Areias** | deserto (nordeste) | cidadela de barro com torres afuniladas, ameias, torreão e minarete |
| **Povoado do Oásis** | deserto | anel de casas de teto plano, poço, feira e palmeiras |
| **Muralhas de Pedra** | sul | recinto elíptico de pedra seca com torre cônica e ruínas de cabanas |
| **Pináculos Pretos** | Floresta Preta | agulhas de basalto com runas acesas e um arco em ruínas |
| **Árvore Anciã** (64 m) e **Árvore Irmã** | Floresta Equatorial | árvores gigantes com raízes tabulares, cipós e copa de ~70 m |

Relevo novo (`RELIEF`, formulas em `src/world/Relief.js`):
- a cordilheira do sul, com neve nos picos mais altos;
- as serras escuras do sudeste;
- cinco mesas no deserto;
- a mesa vermelha do Kalahari.

Ao chegar perto de um marco aparece um aviso com o nome e a descrição dele.

## Como funcionam as mecânicas

### Mendigo → doença → cura do Senhor

1. **Mendigo** (`Mechanics.beggar`, Praça da Saudade): fale com ele (E ou clique). Ele divaga em 4 falas
   (os sussurros da Praça, a maldição do alçapão, o mundo doido) e oferece a **Injeção Suspeita** (💉),
   que entra no primeiro slot livre da hotbar. Depois há uma espera de 45 s (`GAMEPLAY.beggar.cooldownSeconds`).
   Equipe a injeção (1–8) e clique: ela é consumida e o jogo sorteia `game.random() < healChance` (0,5):
   - **50%**: vida cheia e **toda doença removida** (a única exceção ao `curableBy`, de propósito: é o "cura tudo" que ele prometeu).
   - **50%**: você recebe o efeito **`febre_mendigo`**.
   A regra está em `applySuspiciousInjection` (`src/systems/Items.js`), testada em `tests/unit/items/`.
2. **Febre do Mendigo** (`STATUS_EFFECTS.febre_mendigo`):
   - Não tem duração e fica até ser curada.
   - Tira 1 de vida a cada 4 s, mas nunca abaixo de 15 (a doença sozinha não mata).
   - Reduz a velocidade para 80%.
   - A borda da tela fica amarelada.
   - Tem `curableBy: ['senhor_nex']`.
3. **Cura** (`PlayerState.removeEffect(id, by)`):
   - Só remove a doença se `by` estiver em `curableBy`.
   - A poção, a curandeira de Abstração e qualquer outra fonte **não** curam.
   - Apenas `Mechanics.healer` (o Senhor, na casa destruída da Vila Renascimento) chama
     `removeEffect('febre_mendigo', 'senhor_nex')`.
4. Para adicionar outra doença, crie uma entrada em `STATUS_EFFECTS` com `kind: 'disease'` e `curableBy`.

### Fauna (animais por bioma)

- `src/config/fauna.js`: 13 espécies (`SPECIES`), quais aparecem em cada bioma (`BIOME_FAUNA`, com pesos) e os
  números do spawner (`FAUNA`: até 16 animais, nascem entre 28 e 65 m do jogador, somem a 120 m, nunca dentro de vilas nem na água).
- **Cérebro** (`src/entities/AnimalBrain.js`, máquina de estados pura e testada):
  `idle → wander → idle`; perto do jogador cada comportamento reage:

  | Comportamento | Espécies | Reação |
  |---|---|---|
  | flee | zebra, alce, capivara (nada) | foge e se acalma depois |
  | aggressive | leão, lobo, escorpião, leopardo, javali | persegue → ataca no alcance (com intervalo) → desiste longe |
  | stalker | onça | espreita agachada e dá o bote de perto |
  | pack | hiena | ataca; se uma apanha, o bando inteiro vem |
  | neutral | gorila | ignora, mas revida se apanhar |
  | burrow / fly | suricato / corvo | foge e se enterra / levanta voo e some |
- **Modelos 3D** (`src/config/animalModels.js`, carregados por `src/render/AnimalModels.js`): 12 modelos do
  [poly.pizza](https://poly.pizza) em `public/assets/models/animals/` (créditos em `CREDITS.md` ali; os CC-BY exigem citar o autor).
  O carregador normaliza tamanho (`length`/`height` em metros), eixo e apoio no chão.
  - **Lobo e alce** são animados (Quaternius): um `AnimationMixer` troca Idle / Walk / Gallop / Attack / Death conforme a IA,
    com o ritmo do passo acompanhando a velocidade. O poly.pizza comprime as animações; `cleanClips` conserta (testado).
  - **Os outros 10 são estáticos**: o corpo inteiro quica ao andar, avança no bote e tomba ao morrer; as pernas não mexem.
  - **Suricato** não tem modelo e usa o corpo procedural (`AnimalBody.js`), que também cobre qualquer modelo que falhe ao carregar.
- Animais levam soco e morrem; o golpe deles tira vida e pode matar.
- No console: `game.fauna.spawnGroup('leao', x, z, 2)`.

### Natação, fôlego e morte

- A água fica em `WORLD.waterLevel`. Com a água acima da cintura (`swimming.surfaceDepth`), o jogador nada:
  metade da velocidade, sem pulo e sem gravidade, flutuação de 0,7 m/s; Espaço/Ctrl sobem/descem.
  Tudo isso fica isolado em `Player.updateSwimming` (regra vertical em `src/entities/Swimming.js`).
- **Fôlego** (`src/systems/Oxygen.js`): a barra só aparece na água e dura exatamente 90 s; fora dela recupera 30 s por segundo.
  Abaixo de 25% fica vermelha. Submerso, a tela fica azulada.
- **Morte** (afogado ou morto por um animal): a tela escurece com a causa ("Você se afogou") e, 3,5 s depois,
  você acorda na última vila visitada (Renascimento no começo) com vida e fôlego cheios.

### Holocausto (sob a Praça da Saudade)
- Ao descer, o jogo aplica `reliquias_potencializadas`: **+20% de poder das relíquias por 120 s** e **+5% de exposição paranormal**.
- Os valores ficam em `GAMEPLAY.holocausto`.

### Bússola do Sul
O portão só abre com **100 de confiança do prefeito**. Fale com o mensageiro do lado de fora. A confiança sobe de três formas:

| Ação | Ganho de confiança |
|---|---|
| Pagar tributo (60 moedas) | +35 |
| Entregar a carta de recomendação que o Senhor de Renascimento dá | +65 |
| Conversar (uma única vez) | +5 |

## Onde colocar a imagem base

Edite `REFERENCE_MAP` em `src/config/worldConfig.js`:

```js
export const REFERENCE_MAP = {
  imageUrl: '/assets/maps/continente-referencia.png', // minimapa e mapa (M)
  useAsBiomeMask: false,   // true = biomas lidos pelas cores da imagem (maskColor em biomes.js)
  heightmapUrl: null,      // PNG em tons de cinza → relevo real (branco = alto)
  heightmapScale: 260,     // altura máxima em metros
  heightmapSeaLevel: 0.18, // tom de cinza que vira o nível do mar
};
```

## Estrutura

```
src/config/      dados (mundo, biomas, vilas, valores de jogabilidade): ajuste aqui
src/world/       gerador, terreno, água, céu/luz, vegetação, capim, pontes, colisões
src/render/      texturas procedurais, materiais, agrupador de geometria estática
src/villages/    Builders (peças em metros), uma vila por arquivo, masmorras
src/entities/    Player, NPC, Humanoid
src/systems/     PlayerState (vida, efeitos), InteractionSystem (E), Mechanics (diálogos)
src/ui/          HUD, diálogos, minimapa, mapa, carregamento
src/core/        Game (orquestra tudo), Input, câmera em terceira pessoa
```

No console do navegador, `window.game` dá acesso ao jogo para depuração.
