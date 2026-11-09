/**
 * Sol e lua pelo relógio do jogo (puro, sem alocação).
 *
 * Arco de cada astro: nasce no leste (+X), sobe passando pelo sul (+Z) e se
 * põe no oeste (−X). Durante o dia o sol percorre o arco entre `sunrise` e
 * `sunset`; durante a noite a lua percorre o mesmo arco.
 */

/**
 * Direção (unitária, y = para cima) de um astro na fração `t` do seu arco.
 * t = 0 nascendo, 0,5 no alto, 1 se pondo; fora de [0,1] fica abaixo do horizonte.
 */
function arc(t, maxEl, out) {
  const th = t * Math.PI;
  // Fora do arco o astro fica SEMPRE abaixo do horizonte (o seno voltaria a
  // ficar positivo depois de t = 2 — a noite é mais curta que o dia).
  const up = t >= 0 && t <= 1 ? Math.sin(th) : -Math.max(0.05, Math.abs(Math.sin(th)));
  out.x = Math.cos(th);
  out.y = up * Math.sin(maxEl);
  out.z = up * Math.cos(maxEl);
  const len = Math.hypot(out.x, out.y, out.z);
  out.x /= len; out.y /= len; out.z /= len;
  return out;
}

/**
 * @param {number} hour hora do dia (0..24)
 * @param {typeof import('../config/sky.js').DAY_NIGHT} cfg
 * @param {{x:number,y:number,z:number}} sun recebe a direção do sol
 * @param {{x:number,y:number,z:number}} moon recebe a direção da lua
 * @returns {{ sunElevation: number, moonElevation: number }} rad
 * @example celestial(game.gameClock.hour, DAY_NIGHT, env.sunDir, env.moonDir)
 */
export function celestial(hour, cfg, sun, moon) {
  const day = cfg.sunset - cfg.sunrise;
  arc((hour - cfg.sunrise) / day, cfg.maxElevation, sun);
  // A noite vai do pôr do sol até o nascer do dia seguinte.
  const night = 24 - day;
  const tn = ((((hour - cfg.sunset) % 24) + 24) % 24) / night;
  arc(tn, cfg.moonElevation, moon);
  return { sunElevation: Math.asin(sun.y), moonElevation: Math.asin(moon.y) };
}

/** smoothstep para a luz acender/apagar no horizonte. */
export function horizonFade(elevation, twilight) {
  const t = Math.min(1, Math.max(0, elevation / twilight));
  return t * t * (3 - 2 * t);
}
