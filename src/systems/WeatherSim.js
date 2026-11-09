/**
 * Lógica pura do clima (sem WebGL): partículas recicladas na caixa em volta
 * da câmera, intensidade dos eventos e névoa paranormal. Tudo aqui roda em
 * Node nos testes e não aloca nada por quadro.
 */

/**
 * Cria o estado de uma camada de partículas (arrays fixos = pool).
 * @param {object} spec item de `WEATHER[bioma].particles`
 * @param {number} capacity quantas partículas cabem no pool
 * @param {() => number} rng sorteio 0..1 (injetável)
 * @returns {object} estado usado por seedParticles/stepParticles
 * @example const s = createParticleState(WEATHER.taiga.particles[0], 5200, Math.random)
 */
export function createParticleState(spec, capacity, rng) {
  const speed = new Float32Array(capacity);
  const seed = new Float32Array(capacity);
  for (let i = 0; i < capacity; i++) {
    seed[i] = rng();
    speed[i] = spec.fall + spec.jitter * (rng() * 2 - 1);
  }
  return {
    pos: new Float32Array(capacity * 3),
    speed,
    seed,
    capacity,
    active: capacity,
    box: spec.box,
    flutter: spec.flutter,
    seeded: false,
  };
}

/**
 * Espalha todas as partículas dentro da caixa centrada em `center`.
 * @param {object} s estado
 * @param {{x:number,y:number,z:number}} center normalmente a câmera
 * @param {() => number} rng
 */
export function seedParticles(s, center, rng) {
  const [w, h, d] = s.box;
  for (let i = 0; i < s.capacity; i++) {
    s.pos[i * 3] = center.x + (rng() - 0.5) * w;
    s.pos[i * 3 + 1] = center.y + (rng() - 0.5) * h;
    s.pos[i * 3 + 2] = center.z + (rng() - 0.5) * d;
  }
  s.seeded = true;
}

/** Módulo sempre positivo: coloca `v` em [-half, half). */
function wrap(v, size) {
  const half = size / 2;
  return ((((v + half) % size) + size) % size) - half;
}

/**
 * Move as partículas ativas e RECICLA as que saem da caixa:
 * - caiu abaixo do fundo da caixa (chão) → volta para o topo (céu) num
 *   ponto x/z novo — object pooling, nunca cria nem destrói partículas;
 * - subiu acima do topo (cinzas/brasas que flutuam) → volta para o fundo;
 * - saiu pelos lados (vento ou a câmera andou) → reaparece do lado oposto.
 * Por isso a caixa "anda" junto com a câmera sem custo extra.
 *
 * @param {object} s estado
 * @param {number} dt segundos
 * @param {{x:number,y:number,z:number}} center centro da caixa (câmera)
 * @param {number} windX vento em x (m/s), já com rajada
 * @param {number} windZ vento em z (m/s)
 * @param {number} time tempo do jogo (s), para o balanço
 * @param {() => number} rng
 * @returns {number} quantas partículas foram recicladas para o céu
 */
export function stepParticles(s, dt, center, windX, windZ, time, rng) {
  const [w, h, d] = s.box;
  const p = s.pos, n = s.active, fl = s.flutter;
  const top = center.y + h / 2, bottom = center.y - h / 2;
  let recycled = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 3, sd = s.seed[i];
    const drift = 0.75 + 0.5 * sd; // cada partícula pega o vento de um jeito
    let x = p[k] + (windX * drift + Math.sin(time * 1.3 + sd * 40) * fl) * dt;
    let y = p[k + 1] - s.speed[i] * dt;
    let z = p[k + 2] + (windZ * drift + Math.cos(time * 1.1 + sd * 30) * fl) * dt;
    if (y < bottom) {
      y += h;
      x = center.x + (rng() - 0.5) * w;
      z = center.z + (rng() - 0.5) * d;
      recycled++;
    } else if (y > top) {
      y -= h;
    }
    p[k] = center.x + wrap(x - center.x, w);
    p[k + 1] = y;
    p[k + 2] = center.z + wrap(z - center.z, d);
  }
  return recycled;
}

/**
 * Intensidade do evento ao longo do tempo (vai e volta entre `min` e 1).
 * Duas senoides fora de fase para não parecer um relógio.
 * @param {number} time s
 * @param {{period:number, min:number}} cycle
 * @param {number} [phase] deslocamento por bioma
 * @returns {number} min..1
 */
export function cycleIntensity(time, cycle, phase = 0) {
  if (!cycle || cycle.min >= 1) return 1;
  const t = (time / cycle.period + phase) * Math.PI * 2;
  const wave = 0.5 + 0.35 * Math.sin(t) + 0.15 * Math.sin(t * 2.7 + 1.3);
  return cycle.min + (1 - cycle.min) * Math.min(1, Math.max(0, wave));
}

/**
 * Distância (no chão, x/z) até a criatura paranormal mais próxima.
 * Aceita `{ position: {x,z} }` (Object3D, entidades) ou `{x,z}` direto.
 * @param {{x:number,z:number}} pos jogador
 * @param {Array<object>} creatures lista (pode estar vazia)
 * @returns {number} Infinity se não há criaturas
 */
export function nearestCreatureDistance(pos, creatures) {
  let best = Infinity;
  for (const c of creatures) {
    if (c.active === false || c.alive === false) continue;
    const p = c.position ?? c;
    const dist = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (dist < best) best = dist;
  }
  return best;
}

/**
 * Quanto a névoa paranormal deve pesar a esta distância: 0 fora do raio,
 * 1 dentro de `innerRadius`, curva suave entre os dois.
 * @param {number} dist m
 * @param {{radius:number, innerRadius:number}} cfg PARANORMAL_FOG
 * @returns {number} 0..1 (alvo; o jogo faz o lerp até ele)
 */
export function paranormalTarget(dist, cfg) {
  if (!(dist < cfg.radius)) return 0;
  const t = Math.min(1, Math.max(0, (cfg.radius - dist) / (cfg.radius - cfg.innerRadius)));
  return t * t * (3 - 2 * t);
}

/**
 * Envelope do clarão do relâmpago: pico, queda e um segundo pulso.
 * @param {number} t segundos desde o raio
 * @returns {number} 0..~1
 */
export function lightningEnvelope(t) {
  if (t < 0) return 0;
  const second = t > 0.16 ? 0.7 * Math.exp(-(t - 0.16) * 11) : 0;
  return Math.exp(-t * 14) + second;
}
