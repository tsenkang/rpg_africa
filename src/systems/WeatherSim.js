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
  const size = new Float32Array(capacity);
  const alpha = new Float32Array(capacity);
  const classes = spec.sizes ?? [[1, 1, 1]];
  const total = classes.reduce((t, c) => t + c[1], 0);
  for (let i = 0; i < capacity; i++) {
    seed[i] = rng();
    // Classe de tamanho sorteada pela fração (ex.: neve pequena/média/grande).
    let r = rng() * total, k = 0;
    while (k < classes.length - 1 && (r -= classes[k][1]) > 0) k++;
    const [sizeMul, , fallMul = 1] = classes[k];
    size[i] = sizeMul;
    speed[i] = spec.fall * fallMul + spec.jitter * (rng() * 2 - 1);
    alpha[i] = 1 - (spec.alphaVar ?? 0) * rng();
  }
  return {
    pos: new Float32Array(capacity * 3),
    speed,
    seed,
    size,
    alpha,
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
      // Volta para o céu. Módulo (não só +h): mesmo num quadro longo ou com a
      // câmera subindo rápido (voo) a partícula cai de volta dentro da caixa.
      y = center.y + wrap(y - center.y, h);
      x = center.x + (rng() - 0.5) * w;
      z = center.z + (rng() - 0.5) * d;
      recycled++;
    } else if (y > top) {
      y = center.y + wrap(y - center.y, h);
    }
    p[k] = center.x + wrap(x - center.x, w);
    p[k + 1] = y;
    p[k + 2] = center.z + wrap(z - center.z, d);
  }
  return recycled;
}

/**
 * Distância (no chão, x/z) até a criatura paranormal mais próxima.
 * Aceita `{ position: {x,z} }` (Object3D, entidades) ou `{x,z}` direto.
 * `reach` (m, opcional) aumenta o alcance de uma criatura/presença: conta
 * como se o jogador estivesse `reach` metros mais perto (ruínas inteiras).
 * @param {{x:number,z:number}} pos jogador
 * @param {Array<object>} creatures lista (pode estar vazia)
 * @returns {number} Infinity se não há criaturas
 */
export function nearestCreatureDistance(pos, creatures) {
  let best = Infinity;
  for (const c of creatures) {
    if (c.active === false || c.alive === false) continue;
    const p = c.position ?? c;
    const dist = Math.max(0, Math.hypot(p.x - pos.x, p.z - pos.z) - (c.reach ?? 0));
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

/**
 * Respingos de chuva: pool fixo; cada respingo nasce no chão perto da câmera,
 * vive `life` segundos (o anel abre e some) e renasce em outro lugar.
 * @param {{pos: Float32Array, age: Float32Array, count: number}} s estado
 * @param {number} dt
 * @param {{x:number, z:number}} center câmera
 * @param {{radius:number, life:number}} cfg
 * @param {number} active quantos respingos podem estar vivos (0..count)
 * @param {(x:number, z:number) => number} groundAt altura do chão
 * @param {() => number} rng
 */
export function stepSplashes(s, dt, center, cfg, active, groundAt, rng) {
  for (let i = 0; i < s.count; i++) {
    let a = s.age[i] + dt / cfg.life;
    if (a >= 1 || s.age[i] < 0) {
      if (i >= active) { s.age[i] = -1; continue; } // fora do limite atual: fica apagado
      const ang = rng() * Math.PI * 2, r = Math.sqrt(rng()) * cfg.radius;
      const x = center.x + Math.cos(ang) * r, z = center.z + Math.sin(ang) * r;
      s.pos[i * 3] = x; s.pos[i * 3 + 1] = groundAt(x, z) + 0.03; s.pos[i * 3 + 2] = z;
      a = rng() * 0.3; // nascem em fases diferentes
    }
    s.age[i] = a;
  }
}
