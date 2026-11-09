/**
 * Direção do sol no tempo t (s): arco lento ida-e-volta entre fim de manhã
 * e fim de tarde (sem noite). Pura e sem alocação.
 * @param {number} t tempo do jogo (s)
 * @param {{period:number, azimuthCenter:number, azimuthSwing:number, elevationMin:number, elevationMax:number}} cfg SUN_CYCLE
 * @param {{x:number,y:number,z:number}} out recebe o vetor unitário (y = para cima)
 * @returns {object} `out`
 * @example sunDirection(game.time, SUN_CYCLE, environment.sunDir)
 */
export function sunDirection(t, cfg, out) {
  const ph = (t / cfg.period) * Math.PI * 2;
  // Azimute vai e volta; a elevação é máxima no meio do arco (meio-dia).
  const az = cfg.azimuthCenter + Math.sin(ph) * cfg.azimuthSwing;
  const mid = Math.cos(Math.sin(ph) * Math.PI / 2); // 1 no meio, 0 nas pontas
  const el = cfg.elevationMin + (cfg.elevationMax - cfg.elevationMin) * mid;
  const c = Math.cos(el);
  out.x = Math.cos(az) * c;
  out.y = Math.sin(el);
  out.z = Math.sin(az) * c;
  return out;
}
