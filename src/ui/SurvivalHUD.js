import { MACROS, MACRO_NAMES } from '../systems/Nutrition.js';
import { NUTRITION, SANITY, DIRT, WOUNDS, CONDITIONS, LIMBS } from '../config/survival.js';
import { icon, iconAt } from './Icons.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

const ICONS = { proteins: 'meat', carbs: 'fruit', fats: 'nut', water: 'drop' };
const COLORS = { proteins: '#d0594a', carbs: '#e8b85a', fats: '#c98a3a', water: '#4aa8e0' };
const R = 46, C = 2 * Math.PI * R, ARC = 0.22; // cada barra ocupa 22% do círculo

/**
 * HUD de sobrevivência (HTML/CSS sobre o canvas):
 * - relógio biométrico de pulso (canto inferior direito): 4 arcos dos
 *   macronutrientes em volta do mostrador, sanidade no centro, stamina,
 *   sujeira, febre e ícones das condições;
 * - pop-ups de condição nova com a lupa (inspecione o corpo — tecla C);
 * - alucinação (sanidade baixa), sussurros e desmaio (tela preta).
 *
 * @example
 * const hud = new SurvivalHUD(ui.root);
 * survival.on('alert', (a) => hud.alert(a));
 * hud.update(survival); // a cada quadro (só mexe no DOM quando um valor muda)
 */
export class SurvivalHUD {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.watch = el('div', 'bio-watch', root);
    const arcs = MACROS.map((k, i) => {
      const rot = -90 + i * 90 + (90 - ARC * 360) / 2; // um quadrante por barra
      return `<circle class="track" r="${R}" cx="60" cy="60" stroke-dasharray="${C * ARC} ${C}" transform="rotate(${rot} 60 60)"/>
        <circle class="arc arc-${k}" r="${R}" cx="60" cy="60" stroke="${COLORS[k]}" stroke-dasharray="0 ${C}" transform="rotate(${rot} 60 60)"/>`;
    }).join('');
    const labels = MACROS.map((k, i) => {
      const a = (-45 + i * 90) * Math.PI / 180;
      return iconAt(ICONS[k], 60 + Math.cos(a) * 58, 60 + Math.sin(a) * 58, 13, `macro-icon mi-${k}`);
    }).join('');
    this.watch.innerHTML = `
      <svg viewBox="-8 -8 136 136" class="dial">${arcs}${labels}
        <circle class="face" r="36" cx="60" cy="60"/>
        <text class="sanity-val" x="60" y="62">90</text>
        <text class="sanity-label" x="60" y="76">sanidade</text>
      </svg>
      <div class="bio-rows">
        <div class="bio-row"><span>Stamina</span><div class="meter"><div class="fill stamina"></div></div></div>
        <div class="bio-row"><span>Sujeira</span><div class="meter"><div class="fill dirt"></div></div></div>
        <div class="bio-macros"></div>
        <div class="bio-conds"></div>
      </div>`;
    this.arcs = Object.fromEntries(MACROS.map((k) => [k, this.watch.querySelector(`.arc-${k}`)]));
    this.sanityVal = this.watch.querySelector('.sanity-val');
    this.stamina = this.watch.querySelector('.fill.stamina');
    this.dirt = this.watch.querySelector('.fill.dirt');
    this.macroText = this.watch.querySelector('.bio-macros');
    this.conds = this.watch.querySelector('.bio-conds');
    this.alerts = el('div', 'med-alerts', root);
    this.halluc = el('div', 'halluc', root);
    this.faint = el('div', 'faint', root, '<span>Você desmaiou…</span>');
    this.whispers = el('div', 'whispers', root);
    this._key = '';
  }

  /**
   * Novo pop-up de condição médica.
   * @param {{ icon: string, title: string, text: string, inspect?: boolean }} a
   */
  alert({ icon: key, title, text, inspect }) {
    const card = el('div', 'med-alert', this.alerts, `
      <div class="med-icon">${icon(key)}</div>
      <div><b>${title}</b><p>${text}</p></div>
      ${inspect ? `<div class="lupa" title="Inspecionar o corpo (C)">${icon('search')}<kbd>C</kbd></div>` : ''}`);
    setTimeout(() => card.classList.add('out'), 6500);
    setTimeout(() => card.remove(), 7200);
    while (this.alerts.children.length > 3) this.alerts.firstChild.remove();
  }

  /** Sussurro de alucinação (some sozinho). */
  whisper(text) {
    const w = el('div', 'whisper', this.whispers, text);
    w.style.left = `${15 + Math.random() * 55}%`;
    w.style.top = `${25 + Math.random() * 40}%`;
    setTimeout(() => w.remove(), 4200);
  }

  /**
   * Atualiza o relógio. Só reescreve o DOM quando algo visível mudou.
   * @param {import('../systems/Survival.js').Survival} s
   */
  update(s) {
    const v = s.nutrition.values;
    for (const k of MACROS) {
      const f = Math.max(0, Math.min(1, v[k] / NUTRITION.max));
      this.arcs[k].setAttribute('stroke-dasharray', `${C * ARC * f} ${C}`);
      this.arcs[k].classList.toggle('low', v[k] < NUTRITION.deficient);
    }
    this.halluc.style.opacity = (s.hallucination * 0.85).toFixed(3);
    const lv = String(s.sanityMgr.level);
    if (this.halluc.dataset.level !== lv) this.halluc.dataset.level = lv;
    this.faint.classList.toggle('on', s.fainted);
    const fever = s.body.fever;
    const key = [Math.round(s.sanity), Math.round(s.stamina), Math.round(s.staminaMax), Math.round(s.dirt), ...MACROS.map((k) => Math.round(v[k])),
      fever.toFixed(1), s.body.wounds.map((w) => w.type + (w.bandage ? 'b' : '')).join(), [...s.body.conditions.keys()].join()].join('|');
    if (key === this._key) return;
    this._key = key;
    this.sanityVal.textContent = Math.round(s.sanity);
    this.sanityVal.classList.toggle('low', s.sanity < SANITY.hallucinate);
    this.stamina.style.width = `${s.stamina}%`;
    this.stamina.parentElement.style.width = `${s.staminaMax}%`;
    this.stamina.classList.toggle('exhausted', s.exhausted);
    this.dirt.style.width = `${s.dirt}%`;
    this.dirt.classList.toggle('dirty', s.dirt >= DIRT.dirtyWarning);
    this.macroText.innerHTML = MACROS.map((k) => `<span class="${v[k] < NUTRITION.deficient ? 'low' : ''}" title="${MACRO_NAMES[k]}">${icon(ICONS[k])}${Math.round(v[k])}</span>`).join('');
    const chips = [];
    if (fever > 0) chips.push(`<span class="cond fever" title="Febre${fever >= CONDITIONS.febre.high ? ' alta' : ''}">${icon(CONDITIONS.febre.icon)}${fever >= CONDITIONS.febre.high ? '!' : ''}</span>`);
    for (const id of s.body.conditions.keys()) chips.push(`<span class="cond" title="${CONDITIONS[id].name}">${icon(CONDITIONS[id].icon)}</span>`);
    for (const w of s.body.wounds) {
      chips.push(`<span class="cond wound${w.bandage ? ' bandaged' : ''}" title="${WOUNDS[w.type].name} — ${LIMBS[w.limb].name}${w.bandage ? ' (coberta)' : ''}">${icon(WOUNDS[w.type].icon)}</span>`);
    }
    this.conds.innerHTML = chips.join('');
    this.watch.classList.toggle('alarm', s.body.wounds.some((w) => !w.bandage) || fever > 0);
  }
}
