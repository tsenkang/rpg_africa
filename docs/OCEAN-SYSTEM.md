# Água, ondas e barco (Etapas A1–A6)

Porte para **WebGL2 / Three.js** dos algoritmos do **Tidewater** (Daniel Greenheck,
https://github.com/dgreenheck/tidewater, licença MIT — ver `CREDITS-OCEAN.md`), que roda em
WebGPU com shaders de computação. Onde o porte simplifica, o código diz `[jogo]`; onde segue o
original, `[Tidewater]`.

## Módulos

| Pedido | Arquivo | O que faz |
|---|---|---|
| WaveSpectrum | `src/systems/ocean/WaveSpectrum.js` | JONSWAP + TMA, espalhamento Horvath, 2 sistemas (vento local + swell), h0 por cascata (CPU) |
| (referência) | `src/systems/ocean/OceanFFTReference.js` | a mesma FFT na CPU — testes e conferência da GPU |
| OceanSimulation | `src/render/ocean/OceanSimulation.js` | evolução + IFFT radix-2 em passes de fragment shader com MRT; espuma pelo Jacobiano |
| WaterRenderer | `src/world/Water.js` | malha polar em volta da câmera, deslocamento, normais, Fresnel, refração, absorção, reflexo, Snell, mergulho |
| (malha) | `src/render/ocean/OceanGrid.js` | anéis com espaçamento crescente; mip por espaçamento (sem serrilhado) |
| WaterInteraction (consultas) | `src/render/ocean/WaterQuery.js` | altura euleriana da água em até 64 pontos, leitura assíncrona (PBO + fence) |
| (cáusticas) | `src/render/ocean/Caustics.js` | splatting de fótons em 2 planos focais |
| (luz subaquática) | `src/render/ocean/UnderwaterLighting.js` | Beer-Lambert + cáusticas no terreno; areia molhada |
| ShallowWaterSimulation | `src/systems/ocean/ShoreField.js`, `src/render/ocean/ShoreWaves.js` | campo de percurso (eikonal), lei de Green, quebra, corredeira, espraiado |
| BoatWakeSystem | `src/render/ocean/WakeSim.js` | ondas lineares com dispersão exata por FFT; casco como pressão (Kelvin); espuma |
| (spray) | `src/render/boat/BoatSpray.js` | gotas balísticas na proa e na popa |
| BoatPhysics + BuoyancySystem | `src/systems/boat/BoatPhysics.js` | corpo rígido a 120 Hz, 21 pontos de empuxo, quilha, hélice, leme, trim, encalhe |
| (barco no jogo) | `src/systems/boat/BoatController.js`, `src/render/boat/BoatModel.js` | consultas por ponto do casco, controles, painel, modelo procedural |
| Painel | `src/ui/PauseMenu.js` (Esc → Água e barco) | ajustes em tempo real, salvos no navegador |
| números | `src/config/ocean.js` (`OCEAN`, `WAKE`), `src/config/boat.js` (`BOAT`) | |

## Por quadro

```text
Game.update()
 ├─ water.update(time, env, camera)
 │   ├─ ocean.update(t)        evolve (1) + 8 linhas + 8 colunas + final por cascata (4) = 21 desenhos
 │   ├─ shore.update(t)        só o relógio (o campo de percurso é feito ao carregar)
 │   ├─ caustics.update()      quadros alternados: 2 desenhos (planos raso/fundo)
 │   ├─ query.update()         1 desenho 64×1 + leitura assíncrona (resultado em 1–3 quadros)
 │   └─ reflexo planar         só Alto/Ultra: a cena de novo a meia resolução
 ├─ boat.update(dt, input)
 │   ├─ pede a altura da água nos pontos do casco (adiantados pela latência)
 │   ├─ BoatPhysics a passo fixo de 120 Hz + interpolação
 │   └─ wake.update()          ~36 desenhos 256² (dorme com o barco parado 30 s sem piloto)
 └─ render (a água copia a tela antes de se desenhar: refração)
```

## Verificação

- `npm test`: espectro (altura plausível, vento), FFT CPU contra DFT, derivadas, campo de
  percurso (frentes paralelas, baía, lago sem onda), lei de Green, física do barco (flutua
  nivelado, acelera e para, vira, arfa e balança em ondas, encalha, carga afunda).
- `tools/ocean/gpu-check.html`: FFT da GPU contra a da CPU (erro ~0,04%).
- `tools/ocean/wake-check.html`: FFT ida e volta (erro ~0,05%) e o campo da esteira (imagem).
- Evidências: `production/qa/evidence/oceano-*`, `barco-a3-*`, `esteira-a4-*`, `costa-a5-*`, `menu-a6-*`.

## Limites conhecidos

- Refração pela cópia da tela (o Tidewater desenha a cena submersa à parte).
- Sem lábio da onda lançado nem espuma que fica na areia (Breakers, ShoreSim).
- A esteira não entra nas consultas (o barco não sente as próprias ondas).
- Um operador de profundidade na esteira (o original mistura 4).
- Bordas do espraiado com degraus pequenos onde a costa é íngreme (textura de profundidade de 4 m).
- Desempenho medido só no ambiente de teste (GPU emulada); não há números de placa de vídeo real.
