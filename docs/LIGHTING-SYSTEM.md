# Iluminação e pós-processamento cinematográfico (L1–L4)

## Visão geral

| Módulo | Arquivo | Papel |
|---|---|---|
| Configuração | `src/config/lighting.js` | `LIGHTING` (Kelvin, IBL, fogo), `MATERIAL_PROFILES`, `WETNESS`, `GLINT`, `POST`, `PROBE` |
| Temperatura de cor | `src/systems/lighting/ColorTemperature.js` | `kelvinToRGB`, `sunKelvin` (puro, testado) |
| `EnvironmentLighting` | `src/render/lighting/EnvironmentLighting.js` | céu procedural → PMREM → `scene.environment` (refeito só quando o céu muda) |
| `MaterialFactory` | `src/render/lighting/MaterialFactory.js` | perfis PBR por material + camada de shader (molhado/poças, veios, gelo, cintilação); umidade global `uWet` |
| `ReflectionProbe` | `src/render/lighting/ReflectionProbe.js` | `CubeCamera` perto do jogador, 1 face por vez → PMREM → `envMap` dos metais e do vidro |
| `RenderPipeline` | `src/render/RenderPipeline.js` | cena → GTAO → SSR → raios de sol → bloom → ACES/sRGB → cor → SMAA |
| Níveis | `src/config/graphics.js` | `post: { ao, godrays, bloom, ssr, grade, probe }` por nível |

## Níveis

| Nível | Pós | AO | Raios | SSR | Sonda |
|---|---|---|---|---|---|
| Muito baixo, Baixo, Médio | — (desenho direto) | | | | |
| Alto | sim | | sim | | |
| Ultra | sim | sim | sim | | sim |
| **Cinemático** | sim | sim | sim | sim | sim |

IBL, Kelvin, fogo e materiais (L1/L2) valem em todos os níveis (custo quase nulo).

## O quadro (`Game.update`)

```
gameClock → environment.update()          // sol/lua (Kelvin), névoa, hemi
            └─ ibl.update()               // regen PMREM só se o céu mudou (≥0,6 s)
weather.update() → materialFactory.update() // uWet sobe na chuva, seca devagar
… mundo, fauna, UI …
probe.update()                             // 1 face a cada 2 quadros; PMREM a cada 6 faces
pipeline.update(env, pesos, uWet, bloomDoClima)
pipeline.render()                          // ou renderer.render() se post = null
minimap.render()
```

## Decisões

- **Sem `MeshPhysicalMaterial`**: clearcoat/transmissão custam em todo pixel; o molhado é
  emulado com rugosidade baixa + IBL + SSR.
- **Alvo da cena sem MSAA** (meia-precisão + profundidade em textura): a refração da água
  copia a tela (`copyFramebufferToTexture` não funciona com MSAA); bordas com SMAA.
  A cópia usa o tipo do alvo (bug corrigido na L3).
- **GTAO reconstrói normais da profundidade**: não redesenha a cena.
- **SSR próprio** (não o `SSRPass` do Three, que redesenha a cena 3×): só superfícies planas
  viradas para cima; força = `POST.ssr.base + POST.ssr.wet × uWet`; ignora a faixa da água
  (que tem reflexo planar próprio).
- **Bloom com limiar 1,6 em HDR linear** (antes do ACES): 0,85 pegava o céu inteiro.
- **Raios de sol em espaço de tela**: somem com o sol fora da tela; força por bioma.

## Ajustes rápidos

Tudo em `src/config/lighting.js`: `POST.bloom.strength`, `POST.godrays.exposure`,
`POST.godrays.biomes`, `POST.ao.intensity`, `POST.grade.*`, `POST.ssr.wet`, `PROBE.faceEvery`.

## Verificação

Testes: `tests/unit/lighting/*`, `tests/unit/render/renderPipeline.test.js`.
Imagens: `production/qa/evidence/luz-l1-*`, `materiais-l2-*`, `pos-l3-*`, `pos-l4-*`.
Página de lookdev: `tools/lighting/material-check.html`.
O ambiente de teste emula a GPU (SwiftShader): FPS não foi medido.
