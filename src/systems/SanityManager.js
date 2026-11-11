import { CHARACTER_PROFILE, COMFORT, DISLIKE_MULTIPLIER, SANITY_TRIGGERS, HALLUCINATION_LEVELS } from '../config/character.js';

/**
 * Sanidade do personagem (regra pura): 100 = mente sã, 0 = insensatez total.
 * Perde com trauma e paranormal, recupera com as atividades de conforto da
 * ficha do personagem (CharacterProfile).
 *
 * Eventos (`on`): 'drain' { amount, reason }, 'restore' { amount, reason, activity },
 * 'level' { level, previous } (nível de alucinação mudou).
 *
 * @example
 * const sm = new SanityManager({ profile: CHARACTER_PROFILE });
 * sm.drainSanity(5, 'Morte de animal', { tags: ['SANGUE'] }); // × 1,8 se detesta sangue
 * sm.comfort('FOGUEIRA', 1);    // contínua: dt em segundos
 * sm.comfort('LER_LIVROS');     // pontual (com recarga)
 * sm.update(dt, { paranormal: [{ dist: 10, reach: 30 }], cursed: false, dark: true, now });
 * sm.level; // 0..3 (alucinação)
 */
export class SanityManager {
  /**
   * @param {{ profile?: typeof CHARACTER_PROFILE, start?: number, max?: number }} [o]
   */
  constructor({ profile = CHARACTER_PROFILE, start = 90, max = 100 } = {}) {
    this.profile = profile;
    this.max = max;
    this.value = start;
    this.lastUse = {}; // atividade → instante do último uso que contou
    /** Últimas causas (para a HUD/caderneta). */
    this.log = [];
    this.listeners = new Map();
    this._level = this.level;
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  emit(event, data) {
    for (const fn of this.listeners.get(event) ?? []) fn(data);
  }

  /** Fração 0..1. */
  get fraction() {
    return this.value / this.max;
  }

  /** Nível de alucinação 0..3 (HALLUCINATION_LEVELS). */
  get level() {
    let lv = 0;
    for (const h of HALLUCINATION_LEVELS) if (this.value < h.below) lv = Math.max(lv, h.level);
    return lv;
  }

  /** O personagem detesta alguma destas tags? */
  dislikes(tags = []) {
    return tags.some((t) => this.profile.dislikes?.includes(t));
  }

  /** O personagem gosta desta atividade? */
  likes(activity) {
    return this.profile.comfortActivities?.includes(activity) ?? false;
  }

  /**
   * Tira sanidade.
   * @param {number} amount
   * @param {string} reason causa (vai no log/HUD)
   * @param {{ tags?: string[], quiet?: boolean }} [o] tags (ex.: 'SANGUE') multiplicam
   *   se o personagem detesta; `quiet` = não registra no log (drenos contínuos)
   * @returns {number} quanto saiu de fato
   */
  drainSanity(amount, reason, { tags = [], quiet = false } = {}) {
    if (amount <= 0) return 0;
    const mult = this.dislikes(tags) ? DISLIKE_MULTIPLIER : 1;
    const before = this.value;
    this.value = Math.max(0, this.value - amount * mult);
    const lost = before - this.value;
    if (!quiet && lost > 0) this.record(-lost, reason);
    if (lost > 0) this.emit('drain', { amount: lost, reason, disliked: mult > 1, quiet });
    this.checkLevel();
    return lost;
  }

  /** Devolve sanidade (sem regra de ficha). */
  restoreSanity(amount, reason, { quiet = false, activity = null } = {}) {
    if (amount <= 0) return 0;
    const before = this.value;
    this.value = Math.min(this.max, this.value + amount);
    const got = this.value - before;
    if (!quiet && got > 0) this.record(got, reason);
    if (got > 0) this.emit('restore', { amount: got, reason, activity, quiet });
    this.checkLevel();
    return got;
  }

  /**
   * Atividade de conforto. Contínua (FOGUEIRA): passe `dt`. Pontual: respeita a
   * recarga (`cooldown`) — usada antes da hora não recupera de novo.
   * @param {keyof typeof COMFORT.activities} activity
   * @param {number} [dt] s (só nas contínuas)
   * @param {number} [now] tempo do jogo (s), para a recarga
   * @returns {number} sanidade recuperada (0 = não contou)
   */
  comfort(activity, dt = 0, now = 0) {
    const a = COMFORT.activities[activity];
    if (!a) return 0;
    const factor = this.likes(activity) ? 1 : COMFORT.unlikedFactor;
    if (a.perSecond) return this.restoreSanity(a.perSecond * factor * dt, a.label, { quiet: true, activity });
    const last = this.lastUse[activity];
    if (last !== undefined && now - last < a.cooldown) return 0;
    this.lastUse[activity] = now;
    return this.restoreSanity(a.amount * factor, a.label, { activity });
  }

  /**
   * Drenos contínuos do quadro.
   * @param {number} dt
   * @param {{ paranormal?: {dist:number, reach:number}[], cursed?: boolean, dark?: boolean }} env
   */
  update(dt, { paranormal = [], cursed = false, dark = false } = {}) {
    const T = SANITY_TRIGGERS;
    let near = 0;
    for (const p of paranormal) if (p.dist < p.reach) near = Math.max(near, 1 - p.dist / p.reach);
    if (near > 0) this.drainSanity(T.paranormalPerSecond * near * dt, 'Presença paranormal', { quiet: true });
    if (cursed) this.drainSanity(T.cursedPerSecond * dt, 'Local amaldiçoado', { quiet: true });
    if (dark) this.drainSanity(T.darkPerSecond * dt, 'Escuridão', { tags: ['ESCURIDAO'], quiet: true });
  }

  record(delta, reason) {
    this.log.push({ delta, reason });
    if (this.log.length > 12) this.log.shift();
  }

  checkLevel() {
    const lv = this.level;
    if (lv !== this._level) {
      const previous = this._level;
      this._level = lv;
      this.emit('level', { level: lv, previous });
    }
  }
}
