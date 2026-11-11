/**
 * Matemática de animação sem Three.js (regras puras, testáveis no Node).
 *
 * @example
 *   x = damp(x, alvo, 8, dt);                      // suave e independente do FPS
 *   const env = attackEnvelope(t, ANIMATION.attack.pounce);
 *   const { pitch, roll } = slopeTilt(groundAt, x, z, yaw, 1.2, 0.4);
 *   const { hip, knee } = twoBoneIK(0.44, 0.42, 0.8);
 */

/** Fator de amortecimento exponencial para `rate` (1/s) em `dt` s. */
export const dampFactor = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Aproxima `cur` de `target` sem depender do framerate. */
export const damp = (cur, target, rate, dt) => cur + (target - cur) * dampFactor(rate, dt);

/** Como `damp`, mas para ângulos (sempre pelo caminho mais curto). */
export function dampAngle(cur, target, rate, dt) {
  const d = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
  return cur + d * dampFactor(rate, dt);
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Hermite 0→1 entre e0 e e1. */
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOut = (t) => 1 - (1 - t) ** 3;
/** Passa um pouco do alvo e volta (impacto com "punch"). */
export const easeOutBack = (t, s = 1.6) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;

/** Parte fracionária positiva (fase em ciclos → [0, 1)). */
export const fract = (x) => x - Math.floor(x);

/**
 * Envelope de ataque em 3 fases.
 *  - antecipação: `wind` 0→1 (recua, encolhe, carrega o peso nas patas de trás)
 *  - impacto:     `wind` 1→0 e `lunge` 0→1 rápido (salta/projeta o tronco, boca abre)
 *  - recuperação: `lunge` 1→0 devagar (volta à postura de combate)
 * @param {number} t segundos desde o início do ataque
 * @param {{ anticipation: number, impact: number, recovery: number }} cfg
 * @returns {{ wind: number, lunge: number, phase: 'anticipation'|'impact'|'recovery'|'done', impactAt: number, total: number }}
 */
export function attackEnvelope(t, { anticipation, impact, recovery }) {
  const total = anticipation + impact + recovery;
  const impactAt = anticipation + impact * 0.5;
  if (t < 0) return { wind: 0, lunge: 0, phase: 'anticipation', impactAt, total };
  if (t < anticipation) return { wind: easeInOut(t / anticipation), lunge: 0, phase: 'anticipation', impactAt, total };
  if (t < anticipation + impact) {
    const u = (t - anticipation) / impact;
    return { wind: 1 - easeOut(u), lunge: Math.min(1.08, easeOutBack(u)), phase: 'impact', impactAt, total };
  }
  if (t < total) {
    const u = (t - anticipation - impact) / recovery;
    return { wind: 0, lunge: 1 - easeInOut(u), phase: 'recovery', impactAt, total };
  }
  return { wind: 0, lunge: 0, phase: 'done', impactAt, total };
}

/**
 * Inclinação do terreno sob um corpo de meio-comprimento `halfLen` e
 * meia-largura `halfWid`, virado para `yaw` (frente = (sin yaw, cos yaw)).
 * @param {(x: number, z: number) => number} groundAt
 * @returns {{ pitch: number, roll: number }} pitch > 0 = frente mais alta (subida);
 *   roll > 0 = lado +X local mais alto. Em radianos.
 */
export function slopeTilt(groundAt, x, z, yaw, halfLen, halfWid) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw); // +X local no mundo
  const hF = groundAt(x + fx * halfLen, z + fz * halfLen);
  const hB = groundAt(x - fx * halfLen, z - fz * halfLen);
  const hR = groundAt(x + rx * halfWid, z + rz * halfWid);
  const hL = groundAt(x - rx * halfWid, z - rz * halfWid);
  return {
    pitch: Math.atan2(hF - hB, 2 * halfLen),
    roll: Math.atan2(hR - hL, 2 * halfWid),
  };
}

/**
 * IK analítico de 2 ossos (coxa + canela) no plano da perna, alvo logo
 * abaixo do quadril a `dist` m.
 * @returns {{ hip: number, knee: number }} `hip`: quanto a coxa vai para a
 *   frente; `knee`: quanto o joelho dobra (0 = esticado). Radianos.
 */
export function twoBoneIK(l1, l2, dist) {
  const d = clamp(dist, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const cosKnee = clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1);
  const cosHip = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  return { hip: Math.acos(cosHip), knee: Math.PI - Math.acos(cosKnee) };
}

/**
 * Ângulo de uma pata num ciclo de passada, com apoio linear (pata parada no
 * chão enquanto o corpo passa) e balanço suave (pata sobe e volta à frente).
 * @param {number} p fase da pata em ciclos [0, 1)
 * @param {number} duty fração do ciclo com a pata no chão
 * @returns {{ swing: number, lift: number }} swing ∈ [-1, 1] (+1 = pata à frente),
 *   lift ∈ [0, 1] (quanto o joelho dobra para levantar a pata)
 */
export function legCycle(p, duty) {
  if (p < duty) return { swing: 1 - 2 * (p / duty), lift: 0 };
  const u = (p - duty) / (1 - duty);
  return { swing: -Math.cos(u * Math.PI), lift: Math.sin(u * Math.PI) };
}

/** Respiração: 0→1→0 com inspiração um pouco mais curta que a expiração. */
export function breathWave(t, hz) {
  const p = fract(t * hz);
  return p < 0.4 ? easeInOut(p / 0.4) : 1 - easeInOut((p - 0.4) / 0.6);
}
