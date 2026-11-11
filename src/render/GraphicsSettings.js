import { GRAPHICS_PRESETS, DEFAULT_GRAPHICS, GRAPHICS_STORAGE_KEY } from '../config/graphics.js';

/**
 * Procura um nível de qualidade pelo id; id desconhecido → o padrão.
 * @param {string|null|undefined} id
 * @param {object[]} [presets]
 * @returns {object} o preset
 * @example presetById('medio').grassRadius // 45
 */
export function presetById(id, presets = GRAPHICS_PRESETS) {
  return presets.find((p) => p.id === id) ?? presets.find((p) => p.id === DEFAULT_GRAPHICS) ?? presets.at(-1);
}

/**
 * Nível vizinho (para baixar/subir um degrau).
 * @param {string} id nível atual
 * @param {number} step -1 = mais leve, +1 = mais bonito
 * @returns {object} o preset vizinho (preso às pontas da lista)
 */
export function stepPreset(id, step, presets = GRAPHICS_PRESETS) {
  const i = presets.findIndex((p) => p.id === id);
  const j = Math.max(0, Math.min(presets.length - 1, (i < 0 ? presets.length - 1 : i) + step));
  return presets[j];
}

/**
 * Lê/grava o nível escolhido. O armazenamento é injetável (testes) e
 * qualquer falha (aba anônima, cookies bloqueados) cai no padrão.
 */
export class GraphicsStore {
  /** @param {Storage|null} [storage] normalmente `window.localStorage` */
  constructor(storage = safeLocalStorage()) {
    this.storage = storage;
  }

  /** @returns {string} id salvo ou o padrão */
  load() {
    try {
      return presetById(this.storage?.getItem(GRAPHICS_STORAGE_KEY)).id;
    } catch {
      return DEFAULT_GRAPHICS;
    }
  }

  /** @param {string} id */
  save(id) {
    try { this.storage?.setItem(GRAPHICS_STORAGE_KEY, id); } catch { /* sem armazenamento: vale só nesta sessão */ }
  }
}

function safeLocalStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/**
 * Média de FPS numa janela curta + detecção de "lento por tempo demais".
 * Sem alocação por quadro.
 * @example
 * const m = new FpsMeter({ minFps: 28, seconds: 6 });
 * if (m.tick(dt)) ui.toast('Jogo lento? Aperte G');
 */
export class FpsMeter {
  constructor({ minFps, seconds }) {
    this.minFps = minFps;
    this.seconds = seconds;
    this.fps = 60;
    this._acc = 0;
    this._frames = 0;
    this._slow = 0;
  }

  /**
   * @param {number} dt segundos do quadro (sem limite artificial)
   * @returns {boolean} true no quadro em que ficou lento por `seconds` seguidos
   */
  tick(dt) {
    this._acc += dt;
    this._frames++;
    if (this._acc < 0.5) return false;
    this.fps = this._frames / this._acc;
    const window = this._acc;
    this._acc = 0;
    this._frames = 0;
    if (this.fps >= this.minFps) { this._slow = 0; return false; }
    const before = this._slow;
    this._slow += window;
    return before < this.seconds && this._slow >= this.seconds;
  }

  /** Recomeça a contagem (após trocar o nível). */
  reset() {
    this._slow = 0;
    this._acc = 0;
    this._frames = 0;
  }
}

/**
 * Aplica um nível ao jogo já criado (sem recarregar): resolução, sombras,
 * capim, alcance das árvores, partículas de clima e bloom. Antialias só vale ao recarregar.
 * @param {object} game precisa de renderer, environment, grass, vegetation
 * @param {object} preset item de GRAPHICS_PRESETS
 * @param {number} [devicePixelRatio]
 * @returns {{ needsReload: boolean }} true se o antialias pedido difere do atual
 */
export function applyGraphics(game, preset, devicePixelRatio = globalThis.devicePixelRatio ?? 1) {
  const r = game.renderer;
  r.setPixelRatio(Math.min(devicePixelRatio, preset.pixelRatio));
  r.setSize(globalThis.innerWidth, globalThis.innerHeight);
  game.environment?.setShadows(preset);
  game.grass?.setRadius(preset.grassRadius);
  game.vegetation?.setDistances(preset.treeViewDistance, preset.treeHighDetailDistance);
  game.weather?.setQuality(preset);
  game.postfx?.setEnabled(preset.bloom);
  game.postfx?.setSize();
  game.minimap?.setInterval(preset.minimapInterval);
  game.water?.setReflection?.(preset.waterReflection ?? 'sky');
  game.water?.setQuality?.(preset.id);
  const aa = r.getContextAttributes?.()?.antialias ?? preset.antialias;
  return { needsReload: aa !== preset.antialias };
}
