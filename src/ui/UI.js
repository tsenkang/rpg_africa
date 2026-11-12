import { ITEMS } from '../systems/PlayerState.js';
import { VILLAGES } from '../config/villages.js';
import { BIOMES } from '../config/biomes.js';
import { WORLD, REFERENCE_MAP, worldToUv, uvToWorld } from '../config/worldConfig.js';
import { GRAPHICS_PRESETS } from '../config/graphics.js';
import { minimapPoint } from './minimapMath.js';
import { icon } from './Icons.js';
import { UI_TIMING } from '../config/gameplay.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

/**
 * Toda a interface em HTML sobre o canvas:
 * vida/moedas/exposição/relíquias, efeitos (buff/doença), faixa do bioma,
 * painel da vila, diálogos com opções (1-9 ou clique), avisos, prompt "E",
 * minimapa, mapa-múndi (M) com viagem e tela de carregamento.
 */
export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = el('div', 'ui', root);
    this.mapImage = new Image();
    this.mapImage.src = REFERENCE_MAP.imageUrl;

    // Carregamento
    this.loading = el('div', 'loading', this.root, `
      <div class="loading-card">
        <h1>Continente</h1>
        <p class="loading-sub">Gerando um continente de ${(WORLD.width / 1000).toFixed(1)} × ${(WORLD.depth / 1000).toFixed(1)} km na escala do personagem…</p>
        <div class="bar"><div class="bar-fill"></div></div>
        <p class="loading-step">Preparando…</p>
      </div>`);

    // Status
    this.vitals = el('div', 'panel vitals', this.root, `
      <div class="row"><span class="label">Vida</span><div class="meter"><div class="fill hp"></div></div><span class="val hp-val"></span></div>
      <div class="row san-row" title="Sanidade: 100 = mente sã · 0 = insensatez total"><span class="label">Sanidade</span><div class="meter"><div class="fill san"></div></div><span class="val san-val"></span></div>
      <div class="row"><span class="label">Exposição</span><div class="meter"><div class="fill exp"></div></div><span class="val exp-val"></span></div>
      <div class="row small"><span>Moedas <b class="coins"></b></span><span>Relíquias <b class="relic"></b></span><span>Confiança Bússola <b class="trust"></b></span></div>
      <div class="inventory"></div>
      <div class="effects"></div>
      <div class="weather-debuffs"></div>`);
    this.debuffBox = this.vitals.querySelector('.weather-debuffs');

    this.biome = el('div', 'biome-banner', this.root);
    this.village = el('div', 'panel village hidden', this.root);
    this.prompt = el('div', 'prompt hidden', this.root);
    this.toasts = el('div', 'toasts', this.root);
    // os comandos foram para o menu do Esc (aba Controles); aqui fica só a dica
    this.help = el('div', 'help', this.root, '<kbd>Esc</kbd> menu · controles · ajustes');
    this.speedTag = el('div', 'speed-tag hidden', this.root, 'VIAGEM RÁPIDA');
    this.sickOverlay = el('div', 'sick-overlay', this.root);
    // Água: tinta azul debaixo d'água + barra de fôlego (só aparece na água).
    this.underwater = el('div', 'underwater', this.root);
    this.oxygenWrap = el('div', 'oxygen hidden', this.root, '<span class="oxygen-label">Fôlego</span><div class="oxygen-bar"><div class="oxygen-fill"></div></div><span class="oxygen-time"></span>');
    this.oxygenFill = this.oxygenWrap.querySelector('.oxygen-fill');
    this.oxygenTime = this.oxygenWrap.querySelector('.oxygen-time');
    // Dano recebido e tela de morte.
    this.damageFlash = el('div', 'damage-flash', this.root);
    this.deathScreen = el('div', 'death-screen hidden', this.root, '<h2></h2><p>Voltando à última vila…</p>');

    // Hotbar (8 slots) + o que está equipado + aviso de acerto
    this.hotbarWrap = el('div', 'hotbar-wrap', this.root);
    this.lockHint = el('div', 'lock-hint', this.hotbarWrap);
    this.equipLabel = el('div', 'equip-label', this.hotbarWrap);
    this.hotbar = el('div', 'hotbar', this.hotbarWrap);
    this.hitMark = el('div', 'hit-mark', this.root);
    // Mira (1ª pessoa) e aviso da trava do cursor
    this.crosshair = el('div', 'crosshair hidden', this.root);

    // Minimapa
    const mm = el('div', 'minimap', this.root);
    this.minimap = el('canvas', '', mm);
    this.minimap.width = this.minimap.height = 200;
    this.coords = el('div', 'coords', mm);
    this.clockTag = el('div', 'clock-tag', mm);

    // Clima na tela: vinhetas (areia, gelo, chuva, calor, cinzas) e clarão do raio.
    this.weatherFx = el('div', 'weather-fx', this.root);
    this.fx = Object.fromEntries(['sand', 'frost', 'rain', 'heat', 'ash', 'flash'].map((k) => [k, el('div', `ov ov-${k}`, this.weatherFx)]));
    this._fx = {};
    this._debuffKey = '';

    // Mapa-múndi
    this.worldMap = el('div', 'worldmap hidden', this.root);
    const wmCard = el('div', 'worldmap-card', this.worldMap);
    el('div', 'worldmap-title', wmCard, 'Mapa do continente <span>clique em um lugar para viajar · M fecha</span>');
    this.worldCanvas = el('canvas', '', wmCard);
    this.worldCanvas.width = 1024;
    this.worldCanvas.height = 576;
    this.worldCanvas.addEventListener('click', (e) => {
      const r = this.worldCanvas.getBoundingClientRect();
      const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
      const p = uvToWorld(u, v);
      this.toggleWorldMap(false);
      game.travelTo(p.x, p.z);
    });

    // Menu de gráficos (tecla G)
    this.graphicsBox = el('div', 'graphics hidden', this.root, `
      <div class="graphics-card">
        <div class="graphics-title">Gráficos <span class="graphics-fps"></span></div>
        <p class="graphics-sub">Escolha com o mouse, <kbd>1</kbd>–<kbd>5</kbd> ou <kbd>←</kbd><kbd>→</kbd>. Muda na hora · <kbd>G</kbd> ou <kbd>Esc</kbd> fecha.</p>
        <div class="graphics-options"></div>
        <p class="graphics-note hidden">A suavização de bordas deste nível só muda ao recarregar a página.</p>
      </div>`);
    this.graphicsFps = this.graphicsBox.querySelector('.graphics-fps');
    this.graphicsOptions = this.graphicsBox.querySelector('.graphics-options');
    this.graphicsNote = this.graphicsBox.querySelector('.graphics-note');
    this.graphicsBox.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (b) game.setGraphics(b.dataset.id);
      else if (e.target === this.graphicsBox) this.toggleGraphics(false);
    });
    this._fpsShown = -1;

    // Diálogo
    this.dialogueBox = el('div', 'dialogue hidden', this.root);
    this.dialogue = {
      open: (d) => this.openDialogue(d),
      close: () => this.closeDialogue(),
      get isOpen() { return !this._ui.dialogueBox.classList.contains('hidden'); },
      _ui: this,
    };
    window.addEventListener('keydown', (e) => {
      if (!this.dialogue.isOpen) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this._options.length) this.choose(n - 1);
      if (e.key === 'Escape') this.closeDialogue();
    });

    const s = game.state;
    s.on('change', () => this.refreshVitals());
    s.on('message', (m) => this.toast(m));
    s.on('effect-added', (e) => this.toast(e?.def?.kind === 'disease' ? `Você contraiu: ${e.def.name}` : `Efeito ativo: ${e?.def?.name ?? ''}`));
    this.refreshVitals();
    this._effTimer = 0;
    this._options = [];
  }

  // ---------- carregamento ----------
  setLoading(pct, text) {
    this.loading.querySelector('.bar-fill').style.width = `${Math.round(pct * 100)}%`;
    this.loading.querySelector('.loading-step').textContent = text;
  }

  hideLoading() {
    this.loading.classList.add('fade');
    setTimeout(() => this.loading.remove(), 900);
  }

  // ---------- status ----------
  /**
   * Barra de sanidade (abaixo da vida). Só mexe no DOM quando o valor
   * arredondado muda; abaixo de `pulseBelow` pulsa com brilho elétrico.
   */
  setSanity(value, max, pulseBelow) {
    const v = Math.round(value);
    if (v === this._san) return;
    this._san = v;
    if (!this._sanEls) this._sanEls = { row: this.vitals.querySelector('.san-row'), fill: this.vitals.querySelector('.fill.san'), val: this.vitals.querySelector('.san-val') };
    const { row, fill, val } = this._sanEls;
    fill.style.width = `${(value / max) * 100}%`;
    val.textContent = `${v}/${max}`;
    row.classList.toggle('critical', value / max < pulseBelow);
  }

  refreshVitals() {
    const s = this.game.state;
    const q = (c) => this.vitals.querySelector(c);
    q('.hp').style.width = `${(s.health / s.maxHealth) * 100}%`;
    q('.hp-val').textContent = `${Math.round(s.health)}/${s.maxHealth}`;
    q('.exp').style.width = `${s.paranormalExposure}%`;
    q('.exp-val').textContent = `${s.paranormalExposure}%`;
    q('.coins').textContent = s.coins;
    q('.relic').textContent = `${Math.round(s.relicPower * 100)}%`;
    q('.trust').textContent = `${s.trust.bussola}/100`;
    // Aqui só os itens de missão; o resto vive na mochila (I).
    const key = [...s.inventory].filter(([id]) => (ITEMS[id]?.kind ?? 'key') === 'key');
    const rest = [...s.inventory].reduce((n, [id, c]) => n + ((ITEMS[id]?.kind ?? 'key') === 'key' ? 0 : c), 0);
    q('.inventory').innerHTML = key.map(([id, n]) => `<span class="item" title="${ITEMS[id]?.description ?? ''}">${ITEMS[id]?.name ?? id} ×${n}</span>`).join('')
      + (rest ? `<span class="item dim">${icon('backpack')} Mochila: ${rest} itens · <b>I</b></span>` : '');
    this.refreshEffects();
  }

  refreshEffects() {
    const s = this.game.state;
    const sick = s.effects.some((e) => e.def.kind === 'disease');
    this.vitals.querySelector('.effects').innerHTML = s.effects.map((e) => `
      <div class="effect ${e.def.kind}" title="${e.def.description}">
        <span class="dot"></span>${e.def.name}
        <span class="time">${e.remaining === null ? 'até ser curada' : `${Math.ceil(e.remaining)} s`}</span>
      </div>`).join('');
    this.sickOverlay.classList.toggle('on', sick);
  }

  // ---------- hotbar ----------
  /**
   * Redesenha os slots e o texto "Equipado: …".
   * @param {import('../systems/Inventory.js').Inventory} inv
   */
  refreshHotbar(inv) {
    this.hotbar.innerHTML = inv.slots.map((item, i) => `
      <div class="slot${i === inv.selected ? ' active' : ''}${item ? ' filled' : ''}" title="${item?.nome ?? 'Vazio'}">
        <span class="key">${i + 1}</span>
        ${item ? `<span class="icon">${icon(item.icone ?? 'dot')}</span><span class="name">${item.nome}</span>` : ''}
      </div>`).join('');
    const eq = inv.equipado;
    this.equipLabel.innerHTML = `Equipado: <b>${eq.nome}</b>`;
  }

  /**
   * Aviso da trava do cursor + modo da câmera, e a mira de 1ª pessoa.
   * @param {{ locked: boolean, firstPerson: boolean }} status
   */
  setCameraStatus({ locked, firstPerson }) {
    const view = firstPerson ? '1ª pessoa' : '3ª pessoa';
    this.lockHint.innerHTML = locked
      ? `<b>Câmera travada</b> · ALT ou Esc solta · ${view} · <b>T</b> alterna`
      : `Pressione <b>ALT</b> para travar/destravar a câmera · ${view} · <b>T</b> alterna`;
    this.lockHint.classList.toggle('locked', locked);
    this.crosshair.classList.toggle('hidden', !firstPerson);
  }

  /**
   * Barra de fôlego.
   * @param {number} fraction 0..1
   * @param {boolean} visible na água (ou ainda recuperando)
   * @param {number} warn abaixo disto a barra fica vermelha e pisca
   */
  setOxygen(fraction, visible, warn = 0.25) {
    this.oxygenWrap.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.oxygenFill.style.width = `${(fraction * 100).toFixed(1)}%`;
    this.oxygenWrap.classList.toggle('low', fraction < warn);
    const secs = Math.ceil(fraction * this.game.oxygen.max);
    this.oxygenTime.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }

  /** Tinta azul quando a câmera está debaixo d'água. */
  setUnderwater(on) {
    if (on !== this._underwater) this.underwater.classList.toggle('on', (this._underwater = on));
  }

  /** Borda vermelha rápida + aviso do dano. */
  flashDamage(text) {
    this.damageFlash.classList.remove('show');
    void this.damageFlash.offsetWidth;
    this.damageFlash.classList.add('show');
    this.showHit(text, false);
  }

  /** Tela escura de morte ("Você se afogou", "Você foi morto: Leão"). */
  showDeath(message) {
    this.deathScreen.querySelector('h2').textContent = message;
    this.deathScreen.classList.remove('hidden');
    void this.deathScreen.offsetWidth;
    this.deathScreen.classList.add('show');
  }

  hideDeath() {
    this.deathScreen.classList.remove('show');
    this.deathScreen.classList.add('hidden');
  }

  /** Aviso rápido no centro da tela: "Acertou: X" ou "Soco no ar". */
  showHit(text, landed) {
    this.hitMark.textContent = text;
    this.hitMark.classList.toggle('miss', !landed);
    this.hitMark.classList.remove('show');
    void this.hitMark.offsetWidth; // reinicia a animação
    this.hitMark.classList.add('show');
  }

  // ---------- avisos ----------
  toast(text) {
    const t = el('div', 'toast', this.toasts, text);
    setTimeout(() => t.classList.add('out'), 3800);
    setTimeout(() => t.remove(), 4400);
  }

  setPrompt(item) {
    if (!item || this.dialogue.isOpen) {
      this.prompt.classList.add('hidden');
      return;
    }
    this.prompt.classList.remove('hidden');
    this.prompt.innerHTML = `<kbd>E</kbd> ${item.label}`;
  }

  // ---------- diálogo ----------
  openDialogue({ speaker, title = '', text, options = [{ label: 'Sair' }] }) {
    this._options = options;
    this.dialogueBox.innerHTML = `
      <div class="dlg-head"><span class="speaker">${speaker}</span>${title ? `<span class="dlg-title">${title}</span>` : ''}</div>
      <p class="dlg-text">${text}</p>
      <div class="dlg-options"></div>`;
    const box = this.dialogueBox.querySelector('.dlg-options');
    options.forEach((o, i) => {
      const b = el('button', 'dlg-opt', box, `<kbd>${i + 1}</kbd>${o.label}`);
      b.disabled = !!o.disabled;
      b.addEventListener('click', () => this.choose(i));
    });
    this.dialogueBox.classList.remove('hidden');
    this.game.input.enabled = false;
    this.game.input.unlock();
    this.prompt.classList.add('hidden');
  }

  choose(i) {
    const o = this._options[i];
    if (!o || o.disabled) return;
    this.closeDialogue();
    o.onSelect?.();
  }

  closeDialogue() {
    this.dialogueBox.classList.add('hidden');
    this.game.input.enabled = true;
  }

  // ---------- bioma / vila ----------
  setBiome(index) {
    if (index === this._biome) return;
    this._biome = index;
    const b = BIOMES[index];
    this.biome.innerHTML = `<span>${b.name}</span><small>${b.description ?? ''}</small>`;
    this.biome.classList.remove('show');
    void this.biome.offsetWidth;
    this.biome.classList.add('show');
  }

  setVillage(cfg, extra = '') {
    if (!cfg) {
      this.village.classList.add('hidden');
      this._village = null;
      return;
    }
    if (this._village === cfg.id && !extra) return;
    this._village = cfg.id;
    const demo = cfg.demographics
      ? `<div class="demo">${Object.entries(cfg.demographics).map(([k, v]) => `<span><b>${v}%</b> ${k}</span>`).join('')}</div>`
      : '';
    this.village.innerHTML = `
      <h3>${cfg.name}</h3>
      <div class="region">${cfg.region}</div>
      <div class="pop">${cfg.abandoned ? `<b>Abandonada</b> · ${cfg.populationNote ?? ''}` : `<b>${cfg.population.toLocaleString('pt-BR')}</b> habitantes${cfg.populationNote ? ` · ${cfg.populationNote}` : ''}`}</div>
      ${demo}
      ${cfg.faction ? `<div class="faction">${cfg.faction}</div>` : ''}
      <p>${cfg.description}</p>
      <ul>${cfg.structures.map((s) => `<li>${s}</li>`).join('')}</ul>${extra}`;
    this.village.classList.toggle('ruins', !!cfg.abandoned);
    this.village.classList.remove('hidden', 'compact');
    // Depois de alguns segundos recolhe para não cobrir a tela (nome e região ficam).
    clearTimeout(this._villageCompact);
    this._villageCompact = setTimeout(() => this.village.classList.add('compact'), UI_TIMING.villageCardSeconds * 1000);
  }

  // ---------- mapas ----------
  // ---------- gráficos ----------
  /** @returns {boolean} menu de gráficos aberto */
  get graphicsOpen() {
    return !this.graphicsBox.classList.contains('hidden');
  }

  /**
   * Relógio, clima atual, vinhetas e debuffs (a cada quadro; só mexe no DOM
   * quando algo muda de verdade).
   * @param {string} clock "Dia 2 · 14:35"
   * @param {{name: string, state: string}} status clima dominante
   * @param {Record<string, number>} overlays 0..1 por vinheta
   * @param {number} flash 0..1 clarão do relâmpago
   * @param {ReturnType<import('../systems/WeatherDebuffs.js').computeDebuffs>|null} debuffs
   */
  setWeather(clock, status, overlays, flash, debuffs) {
    const label = `${clock} · ${status.name}`;
    if (label !== this._clockLabel) {
      this._clockLabel = label;
      this.clockTag.innerHTML = `<b>${clock}</b> · <span class="wx-${status.state}">${status.name}</span>`;
    }
    for (const [k, v] of Object.entries({ ...overlays, flash: flash * 0.55 })) {
      const o = Math.round(v * 100) / 100;
      if (this._fx[k] !== o) { this._fx[k] = o; this.fx[k].style.opacity = o; }
    }
    const key = debuffs ? debuffs.active.map((d) => `${d.id}${Math.round(d.strength * 10)}`).join() + (debuffs.warmed ? '+w' : '') : '';
    if (key === this._debuffKey) return;
    this._debuffKey = key;
    const chips = (debuffs?.active ?? []).map((d) => `
      <div class="debuff" title="${d.description}">
        <span class="icon">${icon(d.icon)}</span>${d.name}<span class="pct">${Math.round(d.strength * 100)}%</span>
      </div>`);
    if (debuffs?.warmed) chips.push(`<div class="debuff warm" title="Perto do fogo o frio não pega."><span class="icon">${icon('flame')}</span>Aquecido</div>`);
    this.debuffBox.innerHTML = chips.join('');
  }

  /** Abre/fecha o menu de gráficos (G). */
  toggleGraphics(force) {
    const show = force ?? !this.graphicsOpen;
    this.graphicsBox.classList.toggle('hidden', !show);
    if (show) {
      this.game.input.unlock();
      this.toggleWorldMap(false);
      this.refreshGraphics(this.game.graphics, this._needsReload ?? false);
    }
  }

  /**
   * Redesenha os botões do menu de gráficos.
   * @param {object} current preset ativo
   * @param {boolean} needsReload mostra o aviso do antialias
   */
  refreshGraphics(current, needsReload) {
    this._needsReload = needsReload;
    const list = GRAPHICS_PRESETS;
    this.graphicsOptions.innerHTML = list.map((p, i) => `
      <button data-id="${p.id}" class="${p.id === current.id ? 'active' : ''}">
        <span class="g-key">${i + 1}</span>
        <span class="g-name">${p.name}</span>
        <span class="g-hint">${p.hint}</span>
        <span class="g-bars">${'▮'.repeat(i + 1)}${'▯'.repeat(list.length - i - 1)}</span>
      </button>`).join('');
    this.graphicsNote.classList.toggle('hidden', !needsReload);
  }

  /** FPS atual no título do menu (só redesenha quando muda). */
  setFps(fps) {
    const v = Math.round(fps);
    if (v === this._fpsShown || !this.graphicsOpen) return;
    this._fpsShown = v;
    this.graphicsFps.textContent = `${v} FPS`;
  }

  toggleWorldMap(force) {
    const show = force ?? this.worldMap.classList.contains('hidden');
    this.worldMap.classList.toggle('hidden', !show);
    if (show) { this.game.input.unlock(); this.drawWorldMap(); }
  }

  drawWorldMap() {
    const c = this.worldCanvas.getContext('2d');
    const W = c.canvas.width, H = c.canvas.height;
    c.fillStyle = '#1b3a52';
    c.fillRect(0, 0, W, H);
    if (this.mapImage.complete) c.drawImage(this.mapImage, 0, 0, W, H);
    c.font = 'bold 15px system-ui';
    c.textAlign = 'center';
    for (const v of Object.values(VILLAGES)) {
      const x = v.u * W, y = v.v * H;
      c.fillStyle = v.abandoned ? '#c8a8ff' : '#ffe9a8'; // ruínas em roxo
      c.strokeStyle = '#000';
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); c.stroke();
      c.strokeText(v.name, x, y - 12);
      c.fillText(v.name, x, y - 12);
    }
    const p = this.game.player.position;
    const uv = worldToUv(p.x, p.z);
    this.drawArrow(c, uv.u * W, uv.v * H, 10);
  }

  drawArrow(c, x, y, s) {
    const f = this.game.player.facing;
    const a = Math.atan2(f.x, -f.z);
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = '#ff4d3a';
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.7, s * 0.8); c.lineTo(0, s * 0.4); c.lineTo(-s * 0.7, s * 0.8); c.closePath();
    c.fill(); c.stroke();
    c.restore();
  }

  /**
   * Retângulo (px CSS) do minimapa na tela — onde o WebGL desenha a câmera
   * de cima (scissor). Guardado e refeito a cada atualização da UI.
   */
  minimapRect() {
    if (!this._mmRect) {
      const r = this.minimap.getBoundingClientRect();
      this._mmRect = { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    return this._mmRect;
  }

  /**
   * Camada 2D por cima do minimapa 3D: fundo transparente; só nomes das
   * vilas, seta do jogador e moldura. No subsolo cobre tudo de escuro.
   */
  drawMinimap() {
    const c = this.minimap.getContext('2d');
    const S = c.canvas.width;
    const p = this.game.player.position;
    const viewM = this.game.minimapViewMeters?.() ?? 600; // metros mostrados
    const under = this.game.areaId !== 'overworld';
    c.clearRect(0, 0, S, S);
    c.save();
    if (under) {
      c.fillStyle = '#100d0c';
      c.fillRect(0, 0, S, S);
    }
    const k = S / viewM;
    c.font = 'bold 10px system-ui';
    c.textAlign = 'center';
    for (const v of Object.values(VILLAGES)) {
      const w = uvToWorld(v.u, v.v);
      const x = S / 2 + (w.x - p.x) * k, y = S / 2 + (w.z - p.z) * k;
      if (x < -20 || y < -20 || x > S + 20 || y > S + 20) continue;
      c.strokeStyle = v.abandoned ? 'rgba(180,140,255,0.9)' : 'rgba(255,233,168,0.9)';
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, v.radius * k, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#fff';
      c.fillText(v.name.replace('Vila ', ''), x, y - v.radius * k - 4);
    }
    // Zonas de busca (procurado): círculo vermelho em volta da última posição conhecida.
    for (const z of this.game.bounty?.searches.values() ?? []) {
      const x = S / 2 + (z.x - p.x) * k, y = S / 2 + (z.z - p.z) * k, r = Math.max(6, z.r * k);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
      c.fillStyle = `rgba(214, 60, 44, ${0.16 + 0.08 * pulse})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.setLineDash([5, 4]);
      c.strokeStyle = 'rgba(255, 96, 76, 0.95)';
      c.lineWidth = 1.6;
      c.stroke();
      c.setLineDash([]);
    }
    if (!under) this.drawBoatMarker(c, S, k, p);
    this.drawArrow(c, S / 2, S / 2, 7);
    c.restore();
    // Norte
    c.font = 'bold 11px system-ui';
    c.fillStyle = '#fff';
    c.fillText('N', S / 2, 13);
    this.coords.textContent = this.game.areaId === 'overworld'
      ? `${Math.round(p.x)} m L · ${Math.round(p.z)} m S · alt. ${Math.round(p.y)} m`
      : this.game.areas[this.game.areaId]?.name ?? '';
  }

  /**
   * Barco no minimapa: casco virado para a proa; fora do quadro, um ponto na borda apontando
   * para onde ele ficou. Não aparece enquanto o jogador pilota (a seta já é o barco).
   */
  drawBoatMarker(c, S, k, p) {
    const boat = this.game.boat;
    if (!boat?.physics || boat.piloting) return;
    const b = boat.physics.renderPosition;
    const { x, y, clamped } = minimapPoint(b.x - p.x, b.z - p.z, k, S);
    c.save();
    c.translate(x, y);
    if (clamped) {
      c.rotate(Math.atan2(y - S / 2, x - S / 2));
      c.fillStyle = 'rgba(120, 200, 255, 0.95)';
      c.beginPath(); c.moveTo(7, 0); c.lineTo(-3, -5); c.lineTo(-3, 5); c.closePath(); c.fill();
    } else {
      const yaw = boat.physics.angles().yaw;
      c.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw))); // proa (sin, cos) no plano xz → canvas
      const L = Math.max(12, 7.6 * k), B = Math.max(6, 2.7 * k); // tamanho mínimo legível
      c.fillStyle = '#7a4a28';
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(L / 2, 0);
      c.quadraticCurveTo(L * 0.1, -B / 2, -L / 2, -B / 2);
      c.lineTo(-L / 2, B / 2);
      c.quadraticCurveTo(L * 0.1, B / 2, L / 2, 0);
      c.closePath(); c.fill(); c.stroke();
    }
    c.restore();
  }

  update(dt) {
    this.drawMinimap(); // todo quadro: acompanha o mapa 3D sem atraso
    this._effTimer -= dt;
    if (this._effTimer <= 0) {
      this._effTimer = 0.25;
      if (this.game.state.effects.length) { this.refreshEffects(); this.vitals.querySelector('.relic').textContent = `${Math.round(this.game.state.relicPower * 100)}%`; }
      this._mmRect = null; // re-mede onde o minimapa está (resize, layout)
      this.speedTag.textContent = this.game.player.flying ? 'VOANDO' : 'VIAGEM RÁPIDA';
      this.speedTag.classList.toggle('hidden', !this.game.player.fastTravel && !this.game.player.flying);
    }
  }
}
