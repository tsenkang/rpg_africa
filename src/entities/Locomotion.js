/**
 * Regras puras de locomoção (sem Three.js), para serem testadas em separado.
 *
 * @example
 *   const sprinting = wantsSprint(input, moving, { swimming });
 *   const speed = resolveMoveSpeed(PLAYER, { sprinting, swimming, modifier: 1 });
 */

/**
 * Shift segurado + andando (W/A/S/D) = correndo. Nadando não corre.
 * @param {{ isDown: (code: string) => boolean }} input
 * @param {boolean} moving há direção de movimento neste quadro
 * @param {{ swimming?: boolean }} [state]
 */
export function wantsSprint(input, moving, { swimming = false } = {}) {
  return moving && !swimming && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
}

/**
 * Velocidade horizontal em m/s. A direção já vem normalizada pelo chamador,
 * então a diagonal nunca é mais rápida que andar reto.
 * @param {{ walkSpeed: number, sprintMultiplier: number, swimSpeed: number, fastTravelMultiplier: number }} cfg
 * @param {{ sprinting?: boolean, swimming?: boolean, modifier?: number, fastTravel?: boolean }} state
 */
export function resolveMoveSpeed(cfg, { sprinting = false, swimming = false, modifier = 1, fastTravel = false } = {}) {
  let speed = swimming ? cfg.swimSpeed : cfg.walkSpeed * (sprinting ? cfg.sprintMultiplier : 1);
  speed *= modifier;
  if (fastTravel) speed *= cfg.fastTravelMultiplier;
  return speed;
}

/**
 * Aproxima `current` de `target` por tempo (lerp exponencial): suave e
 * independente do framerate.
 * @param {number} rate quanto maior, mais rápido (1/s)
 */
export function approach(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
