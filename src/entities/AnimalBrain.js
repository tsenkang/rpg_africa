/**
 * Máquina de estados da IA dos animais (regra pura, sem Three.js; testável).
 *
 * Estados:
 *   idle    parado (pasta, olha em volta)        → wander depois de um tempo
 *   wander  anda devagar até um ponto perto de casa → idle
 *   flee    corre para longe do jogador          → idle quando se acalma
 *   stalk   (onça/leopardo) se aproxima agachado → chase ao ficar perto
 *   chase   corre até o jogador                  → attack ao alcançar
 *   attack  parado golpeando (pede `strike` quando o intervalo permite)
 *   burrow  (suricato) se enterra                → some (`gone`)
 *   fly     (corvo) levanta voo                  → some (`gone`)
 *   dead    morto
 *
 * O comportamento (`spec.behavior`) decide como o animal reage ao jogador
 * perto (`dist < spec.sense`) e ao apanhar (`hurt()`); veja `config/fauna.js`.
 *
 * @example
 *   const brain = new AnimalBrain(SPECIES.leao, FAUNA, Math.random);
 *   const { state, strike } = brain.tick(dt, distanciaAteOJogador);
 *   if (strike) player.damage(SPECIES.leao.damage);
 */
export class AnimalBrain {
  /**
   * @param {object} spec espécie (`SPECIES.x`)
   * @param {object} fauna tempos gerais (`FAUNA`)
   * @param {() => number} rng gerador em [0,1) (injetado para testes)
   */
  constructor(spec, fauna, rng = Math.random) {
    this.spec = spec;
    this.fauna = fauna;
    this.rng = rng;
    this.state = 'idle';
    this.timer = this.range(fauna.idleTime);
    this.cooldown = 0;
    this.angry = false; // neutro que apanhou, ou bando alertado
    this.fleeing = 0;
    this.gone = false; // enterrou/voou para longe: o spawner remove
  }

  range([a, b]) {
    return a + (b - a) * this.rng();
  }

  get aggressive() {
    const b = this.spec.behavior;
    return b === 'aggressive' || b === 'pack' || b === 'stalker' || (b === 'neutral' && this.angry);
  }

  get fearful() {
    const b = this.spec.behavior;
    return b === 'flee' || b === 'burrow' || b === 'fly';
  }

  set(state, timer = 0) {
    this.state = state;
    this.timer = timer;
  }

  /** Levou um golpe. Medrosos fogem; os outros (até o neutro) partem para cima. */
  hurt() {
    if (this.state === 'dead') return;
    if (this.fearful) {
      this.startFleeing();
      return;
    }
    this.angry = true;
    this.set('chase');
  }

  /** Alerta do bando (hienas): entra em perseguição junto. */
  alert() {
    if (this.state === 'dead' || this.fearful) return;
    this.angry = true;
    if (this.state !== 'attack') this.set('chase');
  }

  die() {
    this.set('dead');
  }

  startFleeing() {
    const b = this.spec.behavior;
    if (b === 'fly') return this.set('fly', 3);
    this.fleeing = 0;
    this.set('flee', this.fauna.fleeTime);
  }

  /**
   * Um passo da IA.
   * @param {number} dt segundos
   * @param {number} dist distância horizontal até o jogador (m); Infinity se não há jogador vivo
   * @returns {{ state: string, strike: boolean }} `strike` = desferir o golpe agora
   */
  tick(dt, dist) {
    const s = this.spec;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.timer -= dt;
    let strike = false;
    const near = dist < s.sense;

    switch (this.state) {
      case 'dead':
        break;
      case 'idle':
      case 'wander':
        if (near) this.react(dist);
        else if (this.timer <= 0) this.state === 'idle' ? this.set('wander', this.range(this.fauna.wanderTime)) : this.set('idle', this.range(this.fauna.idleTime));
        break;
      case 'flee':
        this.fleeing += dt;
        if (s.behavior === 'burrow' && this.fleeing >= (s.burrowAfter ?? 1.5)) this.set('burrow', this.fauna.burrowSeconds);
        else if (near) this.timer = Math.max(this.timer, this.fauna.fleeTime * 0.5); // continua com medo
        else if (this.timer <= 0) this.set('idle', this.range(this.fauna.idleTime));
        break;
      case 'stalk':
        if (dist <= s.pounceRange) this.set('chase');
        else if (dist > s.sense * 1.5) this.set('idle', this.range(this.fauna.idleTime));
        break;
      case 'chase':
        if (dist <= s.attackRange) this.set('attack');
        else if (dist > (s.giveUp ?? s.sense * 2)) this.calmDown();
        break;
      case 'attack':
        if (dist > s.attackRange * 1.35) this.set('chase');
        else if (this.cooldown === 0) {
          strike = true;
          this.cooldown = s.attackCooldown;
        }
        break;
      case 'burrow':
      case 'fly':
        if (this.timer <= 0) this.gone = true;
        break;
      default:
        break;
    }
    return { state: this.state, strike };
  }

  /** Jogador entrou no raio de percepção. */
  react() {
    const b = this.spec.behavior;
    if (this.fearful) this.startFleeing();
    else if (b === 'stalker') this.set('stalk');
    else if (this.aggressive) this.set('chase');
    // neutro calmo: ignora
  }

  calmDown() {
    if (this.spec.behavior === 'neutral') this.angry = false;
    this.set('idle', this.range(this.fauna.idleTime));
  }
}
