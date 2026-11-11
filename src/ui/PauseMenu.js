import { OCEAN } from '../config/ocean.js';
import { BOAT } from '../config/boat.js';

const STORE = 'agua-barco-ajustes';

/**
 * Menu do Esc: pausa o jogo e reúne o que antes ficava espalhado na tela.
 *  - **Jogo**: continuar, gráficos (G), mapa (M).
 *  - **Controles**: todas as teclas, por grupo (substitui a linha de comandos embaixo).
 *  - **Água e barco** (Etapa A6): ajustes que valem na hora — ondas, vento, espuma,
 *    transparência, cor do mar, ondas de costa; massa, empuxo, amortecimento, resistência e
 *    potência do barco. Ficam salvos neste navegador.
 *
 * @example
 *   const menu = new PauseMenu(game);
 *   menu.toggle();          // Esc
 *   if (menu.open) dt = 0;  // jogo pausado
 */
export class PauseMenu {
  /** @param {object} game */
  constructor(game) {
    this.game = game;
    this.open = false;
    this.tab = 'jogo';
    this.defaults = snapshot();
    this.root = document.createElement('div');
    this.root.className = 'pause hidden';
    this.root.innerHTML = `
      <div class="pause-card" role="dialog" aria-label="Menu">
        <div class="pause-head"><span class="pause-title">Pausado</span><span class="pause-esc"><kbd>Esc</kbd>volta ao jogo</span></div>
        <div class="pause-tabs">
          <button data-tab="jogo">Jogo</button><button data-tab="controles">Controles</button><button data-tab="agua">Água e barco</button>
        </div>
        <div class="pause-body"></div>
      </div>`;
    (game.ui?.root ?? document.body).appendChild(this.root);
    this.body = this.root.querySelector('.pause-body');
    this.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { this.tab = t.dataset.tab; this.render(); return; }
      const a = e.target.closest('[data-act]');
      if (a) this.action(a.dataset.act);
      if (e.target === this.root) this.toggle(false);
    });
    this.root.addEventListener('input', (e) => {
      const s = e.target.closest('[data-key]');
      if (s) this.apply(s.dataset.key, s.type === 'color' ? s.value : Number(s.value), s);
    });
    this.load();
    // Com o cursor travado o navegador usa o Esc para soltar a trava e não repassa a tecla:
    // trava caiu sem o jogo pedir (Alt, painéis) → foi o Esc → abre o menu.
    game.input?.onLockChange?.((locked) => {
      if (locked || this.open) return;
      if (performance.now() - (game.input.unlockedByGame ?? -1e9) < 300) return;
      if (game.dead || game.ui?.dialogue?.isOpen || game.ui?.graphicsOpen) return;
      this.toggle(true);
    });
  }

  /** Abre/fecha (pausa/retoma). */
  toggle(force) {
    this.open = force ?? !this.open;
    this.root.classList.toggle('hidden', !this.open);
    if (this.open) { this.game.input?.unlock?.(); this.render(); }
  }

  action(act) {
    const g = this.game;
    if (act === 'continuar') this.toggle(false);
    if (act === 'graficos') { this.toggle(false); g.ui.toggleGraphics(true); }
    if (act === 'mapa') { this.toggle(false); g.ui.toggleWorldMap(true); }
    if (act === 'barco') { const b = g.boat; if (b) { b.placeAt(b.home.x, b.home.z, b.home.yaw); g.ui.toast('O barco voltou para a ancoragem.'); } }
    if (act === 'padrao') { restore(this.defaults); this.afterChange(true); this.save(); this.render(); }
  }

  render() {
    this.root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    this.body.innerHTML = this.tab === 'jogo' ? this.gameTab() : this.tab === 'controles' ? CONTROLS_HTML : this.waterTab();
  }

  gameTab() {
    return `<div class="pause-actions">
      <button data-act="continuar" class="primary">Continuar</button>
      <button data-act="graficos">Gráficos <kbd>G</kbd></button>
      <button data-act="mapa">Mapa <kbd>M</kbd></button>
      <button data-act="barco">Trazer o barco de volta à ancoragem</button>
    </div>`;
  }

  waterTab() {
    const L = OCEAN.local, o = OCEAN.optics;
    const row = (key, label, min, max, step, value, fmt) => `
      <label class="pause-row"><span>${label}</span>
        <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
        <output>${fmt(value)}</output></label>`;
    const color = `#${[0, 1, 2].map((i) => Math.round(Math.min(1, o.scatter[i] * 6) * 255).toString(16).padStart(2, '0')).join('')}`;
    return `<div class="pause-cols">
      <section><h4>Oceano</h4>
        ${row('amplitude', 'Altura das ondas', 0, 2, 0.05, OCEAN.amplitude, (v) => `${Math.round(v * 100)}%`)}
        ${row('wind', 'Vento', 1, 20, 0.5, L.windSpeed, (v) => `${v} m/s`)}
        ${row('windDir', 'Direção das ondas', 0, 355, 5, L.windDirection, (v) => `${v}°`)}
        ${row('rhythm', 'Ritmo das ondas', 0.5, 2, 0.05, OCEAN.timeScale, (v) => `${v.toFixed(2)}×`)}
        ${row('foam', 'Espuma', 0, 2, 0.05, this.game.water.uniforms.uFoamAmount.value, (v) => `${Math.round(v * 100)}%`)}
        ${row('clarity', 'Transparência', 0.2, 3, 0.05, this.game.water.uniforms.uClarity.value, (v) => `${v.toFixed(2)}×`)}
        <label class="pause-row"><span>Cor do oceano</span><input type="color" data-key="color" value="${color}"><output></output></label>
        ${row('shore', 'Ondas na praia', 0, 1.5, 0.05, OCEAN.shore.height, (v) => `${v.toFixed(2)} m`)}
      </section>
      <section><h4>Barco</h4>
        ${row('mass', 'Massa', 1500, 6000, 50, BOAT.mass, (v) => `${(v / 1000).toFixed(2)} t`)}
        ${row('buoy', 'Força de empuxo', 0.6, 1.6, 0.02, BOAT.buoyancyScale ?? 1, (v) => `${Math.round(v * 100)}%`)}
        ${row('damp', 'Amortecimento', 0.2, 3, 0.05, BOAT.dampingScale ?? 1, (v) => `${v.toFixed(2)}×`)}
        ${row('drag', 'Resistência da água', 40, 250, 5, BOAT.resistance.k, (v) => `${v}`)}
        ${row('power', 'Potência do motor', 3000, 25000, 250, BOAT.engine.thrust, (v) => `${(v / 1000).toFixed(1)} kN`)}
        <p class="pause-note">Mudar vento e direção refaz o espectro das ondas (um instante). Os ajustes ficam salvos neste navegador.</p>
        <div class="pause-actions"><button data-act="padrao">Voltar ao padrão</button></div>
      </section></div>`;
  }

  /** Aplica um controle e atualiza o número ao lado. */
  apply(key, v, el) {
    const L = OCEAN.local, u = this.game.water.uniforms;
    let spectrum = false;
    switch (key) {
      case 'amplitude': OCEAN.amplitude = v; break;
      case 'wind': L.windSpeed = v; spectrum = true; break;
      case 'windDir': L.windDirection = v; OCEAN.swell.windDirection = (v - 20 + 360) % 360; spectrum = true; break;
      case 'rhythm': OCEAN.timeScale = v; break;
      case 'foam': u.uFoamAmount.value = v; OCEAN.foamAmount = v; break;
      case 'clarity': u.uClarity.value = v; OCEAN.clarity = v; break;
      case 'color': { const c = parseInt(v.slice(1), 16); OCEAN.optics.scatter = [((c >> 16) & 255) / 255 / 6, ((c >> 8) & 255) / 255 / 6, (c & 255) / 255 / 6]; break; }
      case 'shore': OCEAN.shore.height = v; break;
      case 'mass': BOAT.mass = v; break;
      case 'buoy': BOAT.buoyancyScale = v; break;
      case 'damp': BOAT.dampingScale = v; break;
      case 'drag': BOAT.resistance.k = v; break;
      case 'power': BOAT.engine.thrust = v; break;
      default: break;
    }
    const out = el?.parentElement?.querySelector('output');
    if (out && el.type === 'range') out.textContent = el.closest('.pause-row') ? formatFor(key, v) : '';
    this.afterChange(spectrum);
    this.save();
  }

  afterChange(spectrum) {
    const w = this.game.water;
    if (spectrum) { clearTimeout(this._t); this._t = setTimeout(() => w.ocean?.rebuildSpectrum(), 120); }
    if (w.uniforms.uFoamAmount) w.uniforms.uFoamAmount.value = OCEAN.foamAmount ?? 1;
    if (w.uniforms.uClarity) w.uniforms.uClarity.value = OCEAN.clarity ?? 1;
  }

  save() {
    try { localStorage.setItem(STORE, JSON.stringify(snapshot())); } catch { /* sem armazenamento: só nesta sessão */ }
  }

  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { s = null; }
    if (!s) return;
    restore(s);
    this.afterChange(true);
  }
}

function formatFor(key, v) {
  return {
    amplitude: `${Math.round(v * 100)}%`, wind: `${v} m/s`, windDir: `${v}°`, rhythm: `${v.toFixed(2)}×`, foam: `${Math.round(v * 100)}%`,
    clarity: `${v.toFixed(2)}×`, shore: `${v.toFixed(2)} m`, mass: `${(v / 1000).toFixed(2)} t`, buoy: `${Math.round(v * 100)}%`,
    damp: `${v.toFixed(2)}×`, drag: `${v}`, power: `${(v / 1000).toFixed(1)} kN`,
  }[key] ?? `${v}`;
}

/** Valores ajustáveis atuais (para salvar e para o "voltar ao padrão"). */
function snapshot() {
  return {
    amplitude: OCEAN.amplitude, wind: OCEAN.local.windSpeed, windDir: OCEAN.local.windDirection, swellDir: OCEAN.swell.windDirection,
    rhythm: OCEAN.timeScale, foam: OCEAN.foamAmount ?? 1, clarity: OCEAN.clarity ?? 1, scatter: [...OCEAN.optics.scatter], shore: OCEAN.shore.height,
    mass: BOAT.mass, buoy: BOAT.buoyancyScale ?? 1, damp: BOAT.dampingScale ?? 1, drag: BOAT.resistance.k, power: BOAT.engine.thrust,
  };
}

function restore(s) {
  OCEAN.amplitude = s.amplitude; OCEAN.local.windSpeed = s.wind; OCEAN.local.windDirection = s.windDir; OCEAN.swell.windDirection = s.swellDir;
  OCEAN.timeScale = s.rhythm; OCEAN.foamAmount = s.foam; OCEAN.clarity = s.clarity; OCEAN.optics.scatter = [...s.scatter]; OCEAN.shore.height = s.shore;
  BOAT.mass = s.mass; BOAT.buoyancyScale = s.buoy; BOAT.dampingScale = s.damp; BOAT.resistance.k = s.drag; BOAT.engine.thrust = s.power;
}

const key = (k) => `<kbd>${k}</kbd>`;
const CONTROLS_HTML = `<div class="pause-cols controls">
  <section><h4>Movimento</h4><ul>
    <li>${key('W')}${key('A')}${key('S')}${key('D')} andar</li><li>${key('Shift')} correr</li><li>${key('Espaço')} pular / subir nadando</li>
    <li>${key('Ctrl')} descer nadando</li><li>${key('V')} voar (teste)</li><li>${key('F')} viagem rápida</li></ul>
  <h4>Câmera</h4><ul><li>${key('T')} 1ª / 3ª pessoa</li><li>${key('Alt')} trava/destrava a câmera</li><li>${key('Roda')} zoom</li></ul></section>
  <section><h4>Ações</h4><ul>
    <li>${key('E')} interagir · embarcar</li><li>${key('Clique')} bater / arremessar</li><li>${key('1–8')} escolher item</li><li>${key('H')} poção</li></ul>
  <h4>Painéis</h4><ul><li>${key('I')} mochila</li><li>${key('J')} receitas</li><li>${key('N')} caderneta</li><li>${key('C')} corpo</li>
    <li>${key('M')} mapa</li><li>${key('G')} gráficos</li><li>${key('Esc')} este menu</li></ul></section>
  <section><h4>Barco</h4><ul>
    <li>${key('W')} alavanca para frente</li><li>${key('S')} alavanca para trás (ré)</li><li>${key('A')}${key('D')} leme</li><li>${key('E')} sair do barco</li></ul>
    <p class="pause-note">A alavanca fica onde você soltar. Para parar, puxe até "ponto morto".</p></section>
</div>`;
