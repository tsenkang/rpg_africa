/**
 * Velocidade vertical nadando (regra pura, testável).
 * Espaço sobe, Ctrl desce; andar para a frente em 1ª pessoa soma a
 * inclinação da câmera (pitch > 0 = olhando para baixo = desce). Sem nenhum
 * comando vertical, a flutuação (`buoyancy`) puxa para cima.
 *
 * @example
 *   const vy = swimVerticalSpeed(GAMEPLAY.swimming, { up: true, down: false, forward: 0, pitch: 0, speed: 2.1 });
 * @param {{ verticalSpeed: number, buoyancy: number }} cfg
 * @param {{ up: boolean, down: boolean, forward: number, pitch: number, speed: number }} input
 * @returns {number} m/s (positivo = sobe)
 */
export function swimVerticalSpeed(cfg, { up, down, forward, pitch, speed }) {
  let vy = (up ? cfg.verticalSpeed : 0) - (down ? cfg.verticalSpeed : 0);
  const dive = -Math.sin(pitch) * forward * speed;
  vy += dive;
  if (!up && !down && Math.abs(dive) < 0.05) vy += cfg.buoyancy;
  return vy;
}
