/**
 * Relógio do jogo e sorteio do clima (lógica pura, testável em Node).
 *
 * GameClock: segundos de jogo → dia, hora (fracionária), "HH:MM".
 * WeatherScheduler: a cada virada de hora sorteia o estado de cada bioma
 *   (limpo / nublado / tempestade) e faz a transição em 5–10 s — a névoa, as
 *   partículas e a luz acompanham `level(i)`, que anda em rampa linear.
 */

/** Relógio: 1 hora do jogo = `hourSeconds` segundos reais. */
export class GameClock {
  /**
   * @param {{ hourSeconds: number, start: { day: number, hour: number } }} cfg WEATHER_CYCLE
   * @example const c = new GameClock(WEATHER_CYCLE); c.update(dt); c.label() // "Dia 1 · 15:12"
   */
  constructor({ hourSeconds, start }) {
    this.hourSeconds = hourSeconds;
    this.totalHours = (start.day - 1) * 24 + start.hour;
  }

  update(dt) {
    this.totalHours += dt / this.hourSeconds;
  }

  /** Dia (começa em 1). */
  get day() { return Math.floor(this.totalHours / 24) + 1; }

  /** Hora do dia, fracionária (0..24). */
  get hour() { return ((this.totalHours % 24) + 24) % 24; }

  /** Número da hora inteira desde o início (muda a cada virada de hora). */
  get hourIndex() { return Math.floor(this.totalHours); }

  /** "Dia N · HH:MM" */
  label() {
    const h = this.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `Dia ${this.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}

/**
 * Estado do clima de cada bioma, sorteado a cada hora.
 * @example
 * const s = new WeatherScheduler(BIOMES.map((b) => WEATHER[b.id]), WEATHER_CYCLE, rng);
 * s.update(dt, clock.hourIndex); // a cada quadro
 * s.level(i)  // 0..1 já com a transição suave
 * s.state(i)  // 'limpo' | 'nublado' | 'tempestade'
 */
export class WeatherScheduler {
  /**
   * @param {Array<{roll:{storm:number, clear:number, stormHours:[number,number]}}|null>} biomes um por bioma
   * @param {{ levels: Record<string, number>, transition: [number, number] }} cfg
   * @param {() => number} rng
   */
  constructor(biomes, cfg, rng) {
    this.cfg = cfg;
    this.rng = rng;
    this.biomes = biomes.map((b) => b && { roll: b.roll, state: 'nublado', hoursLeft: 0, value: 0, target: 0, rate: 1 });
    this.lastHour = null;
  }

  /** Sorteia o próximo estado de um bioma (tempestade tem duração). */
  roll(b) {
    if (b.state === 'tempestade' && b.hoursLeft > 1) { b.hoursLeft--; return; }
    const r = this.rng();
    const { storm, clear, stormHours } = b.roll;
    if (r < storm) {
      b.state = 'tempestade';
      b.hoursLeft = stormHours[0] + Math.floor(this.rng() * (stormHours[1] - stormHours[0] + 1));
    } else {
      b.state = r < storm + clear ? 'limpo' : 'nublado';
      b.hoursLeft = 0;
    }
    this.retarget(b);
  }

  /** Nova intensidade alvo e quanto tempo (5–10 s) para chegar lá. */
  retarget(b) {
    b.target = this.cfg.levels[b.state];
    const [t0, t1] = this.cfg.transition;
    const secs = t0 + this.rng() * (t1 - t0);
    b.rate = Math.max(1e-3, Math.abs(b.target - b.value) / secs);
  }

  /**
   * @param {number} dt s
   * @param {number} hourIndex GameClock.hourIndex — ao mudar, sorteia de novo
   */
  update(dt, hourIndex) {
    if (hourIndex !== this.lastHour) {
      const first = this.lastHour === null;
      this.lastHour = hourIndex;
      for (const b of this.biomes) {
        if (!b) continue;
        this.roll(b);
        if (first) b.value = b.target; // começo do jogo: já no estado sorteado
      }
    }
    for (const b of this.biomes) {
      if (!b || b.value === b.target) continue;
      const step = b.rate * dt;
      b.value = Math.abs(b.target - b.value) <= step ? b.target : b.value + Math.sign(b.target - b.value) * step;
    }
  }

  /** Intensidade atual (0..1) do bioma i, com a transição. */
  level(i) { return this.biomes[i]?.value ?? 0; }

  /** Estado sorteado do bioma i. */
  state(i) { return this.biomes[i]?.state ?? 'limpo'; }

  /**
   * Força um estado agora (console/testes), com a transição normal.
   * @example game.weather.scheduler.force(2, 'tempestade', 2)
   */
  force(i, state, hours = 1) {
    const b = this.biomes[i];
    if (!b) return;
    b.state = state;
    b.hoursLeft = state === 'tempestade' ? hours : 0;
    this.retarget(b);
  }
}
