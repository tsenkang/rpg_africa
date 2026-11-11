import { ROUTINE, ENERGY } from '../../config/npcLife.js';

/**
 * Rotina diária (regra pura): qual atividade vale numa hora do dia.
 *
 * @example
 * activityAt(9);                                   // 'WORK'
 * activityAt(23);                                  // 'HOME'
 * activityAt(3, { profession: 'guarda', shift: 'night' }); // 'WORK' (guarda da noite)
 * activityAt(9, { age: 'child' });                 // 'PLAY'
 */
export function activityAt(hour, { jitter = 0, profession = null, shift = 'day', age = 'adult', cfg = ROUTINE } = {}) {
  const h = (((hour - jitter) % 24) + 24) % 24;
  if (profession === 'guarda') {
    const [a, b] = cfg.guardShifts[shift];
    const on = a < b ? h >= a && h < b : h >= a || h < b;
    if (on) return 'WORK';
    // Fora do turno: o guarda do dia vive o fim do dia normal; o da noite dorme de dia.
    if (shift === 'night') return h >= b && h < a - 1 ? 'HOME' : 'WAKE';
  }
  let act = 'HOME';
  for (const b of cfg.blocks) if (h >= b.from) act = b.activity;
  if (h < cfg.blocks[0].from) act = 'HOME';
  // Crianças brincam no lugar do trabalho; idosos sentam na praça.
  if (age === 'child' && (act === 'WORK' || act === 'WORK_PM')) return 'PLAY';
  if (age === 'elder' && (act === 'WORK' || act === 'WORK_PM')) return 'REST';
  return act;
}

/**
 * Energia depois de `hours` horas do jogo na atividade (0..1).
 * @param {number} energy
 * @param {string} activity
 * @param {number} hours
 * @param {boolean} [sleeping] dormindo recupera tudo
 */
export function energyStep(energy, activity, hours, sleeping = false, cfg = ENERGY) {
  if (sleeping) return 1;
  let e = energy;
  if (activity === 'WORK' || activity === 'WORK_PM') e -= cfg.workPerHour * hours;
  else if (activity === 'LEISURE' || activity === 'PLAY') e -= cfg.leisurePerHour * hours;
  return Math.max(0, Math.min(1, e));
}

/** Rótulo do estado de cansaço (para diálogos e postura). */
export function tirednessOf(energy, cfg = ENERGY) {
  if (energy < cfg.exhausted) return 'EXAUSTO';
  if (energy < cfg.tired) return 'CANSADO';
  return 'DISPOSTO';
}
