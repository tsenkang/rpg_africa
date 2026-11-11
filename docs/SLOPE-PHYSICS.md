# Limite de inclinação (Max Slope 45°)

Jogador, animais, moradores (guardas e testemunhas incluídos) e caçadores de
recompensa não sobem chão com mais de **45°**. Quem pisa nele **escorrega** até o chão firme.

## Onde está

| Classe do pedido | Arquivo real | O que faz |
|---|---|---|
| núcleo (puro, testado) | `src/systems/physics/SlopePhysics.js` | `surfaceNormal`, `isUnwalkable`, `blockUphill`, `SlideState`, `steerAroundSlope` |
| números | `src/config/physics.js` → `SLOPE` | 45°, atrito, velocidade máxima do escorregão, distância de sondagem da IA… |
| PlayerController | `src/entities/Player.js` (`update`) | bloqueia a subida, escorrega, trava de degrau, perde a aderência correndo, `onSkid` |
| AnimalAI | `src/entities/Animal.js` (`update`) | contorna encostas ao fugir/caçar/passear; escorrega com desequilíbrio |
| NPCPhysics | `src/entities/NPCAgent.js` (`slideStep`, `step`) | idem para moradores/guardas; gesto `balance` |
| caçadores | `src/entities/BountyHunter.js` | contornam encostas na perseguição |
| feedback | `src/audio/SkidSound.js`, `src/ui/SlopeHint.js` | som de cascalho; aviso "Escorregando · 63°" |

## Normal da superfície (sem raycast de malha)

O chão aberto é um mapa de alturas (grade de 4,27 m). O raio vertical a partir dos pés
cairia num triângulo cuja normal vem das alturas vizinhas — então ela é calculada direto,
por diferenças centrais em ±1 m (4 leituras de `heightAt`, O(1), sem alocação):

```
N = normalize(−∂h/∂x, 1, −∂h/∂z)      cos θ = N · UP = N.y      íngreme ⇔ N.y < cos 45° = 0,7071
```

A amostra de ±1 m suaviza as arestas dos triângulos (a normal exata de cada triângulo
pularia de um quadro para o outro). Só vale **no relevo**: em pisos, pontes, degraus e
plataformas (`|chão − relevo| ≥ 8 cm`) a regra não se aplica.

## Jogador (por quadro)

1. Normal sob os pés → `steep`. Vale também **no ar**.
2. Passo andando: `blockUphill` tira a parte que sobe a encosta (andar de lado/descer continua).
3. Correndo (Shift) contra a encosta → `sprinting = false`, som de derrapagem, postura de desequilíbrio.
4. `SlideState`: gravidade projetada no plano, `a_h = g · N.y · (N.x, N.z) · (1 − atrito)`, até 9 m/s;
   no chão andável morre em `settle`/s. Escorregando: sem pulo, colado à encosta.
5. **Trava de degrau** depois do movimento: se o relevo subiu mais que `tan 45° × distância + 0,35 m`,
   o passo é desfeito. Ela cobre quadros longos (FPS baixo), em que um escorregão rápido descolava
   o jogador do chão e o encaixe no chão o "subia".

## IA (animais, moradores, caçadores)

`steerAroundSlope` sonda 2 m à frente. Se ali é íngreme **e** a direção sobe, gira ±0,5 / 1,0 /
1,5 / 2,1 rad (alternando lados) até achar uma que não suba → contorna a montanha. Nenhuma
serve → para (o animal sorteia outro destino). Descer é livre.
Escorregão igual ao do jogador; animais balançam o corpo, moradores fazem o gesto `balance`
e a rotina pausa até o chão firme.

## Custo

Benchmark em Node (relevo senoidal, mais caro que o real): normal + escorregão ≈ 0,2 µs,
steering ≈ 0,4 µs por entidade → **≈ 0,1 ms por quadro para 200 entidades** (0,7% de 16,7 ms).
Moradores sem boneco só fazem o steering no tique de lógica (0,25 s).

## Testes

`tests/unit/physics/slope.test.js` (núcleo) e `tests/unit/physics/playerSlope.test.js`
(jogador num relevo sintético: paredão de 63°/80°, 60 e 10 FPS, rampa suave de 26,6°).
Sem o limite, o jogador subia 24 m de um paredão de 63° em 3 s.
