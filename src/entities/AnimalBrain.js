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
 *   threat  (gorila) bate no peito / (urso) encara → chase
 *   circle  (arara) voa em círculos sobre o ninho  → pousa (idle)
 *   home    (guardião) volta para o lugar que protege → idle
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
    return b === 'aggressive' || b === 'pack' || b === 'stalker' || b === 'guardian' || ((b === 'neutral' || b === 'territorial' || b === 'ambush') && this.angry);
  }

  /** Foge quando apanha (passivos também: camelo, girafa; e a arara voa). */
  get fearful() {
    const b = this.spec.behavior;
    return b === 'flee' || b === 'burrow' || b === 'fly' || b === 'passive' || b === 'soar';
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
    // Gorila: bate no peito antes de partir para cima.
    if (this.spec.threat && this.state !== 'chase' && this.state !== 'attack') this.set('threat', this.spec.threat);
    else this.set('chase');
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
    if (b === 'soar') return this.set('circle', 10); // arara: sobe e circula, não some
    this.fleeing = 0;
    this.set('flee', this.fauna.fleeTime);
  }

  /**
   * Um passo da IA.
   * @param {number} dt segundos
   * @param {number} dist distância horizontal até o jogador (m); Infinity se não há jogador vivo
   * @param {{ fromHome?: number, atHome?: boolean }} [ctx] guardião: distância do JOGADOR até a
   *   casa do guardião; `atHome` = o guardião já voltou
   * @returns {{ state: string, strike: boolean }} `strike` = desferir o golpe agora
   */
  tick(dt, dist, ctx = {}) {
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
        if (near) this.react(dist, ctx);
        else if (this.timer <= 0) {
          // Arara: de vez em quando sai para voar em círculos.
          if (s.behavior === 'soar' && this.state === 'idle' && this.rng() < 0.5) this.set('circle', this.range([8, 16]));
          else if (this.state === 'idle') this.set('wander', this.range(this.fauna.wanderTime));
          else this.set('idle', this.range(this.fauna.idleTime));
        }
        break;
      case 'circle':
        if (near) this.timer = Math.max(this.timer, 4); // gente perto: continua no alto
        else if (this.timer <= 0) this.set('idle', this.range(this.fauna.idleTime));
        break;
      case 'threat':
        // Gorila batendo no peito / urso encarando.
        if (s.behavior === 'territorial' && !this.angry) {
          if (dist <= s.territory) { this.angry = true; this.set('chase'); } else if (!near) this.calmDown();
        } else if (this.timer <= 0) this.set('chase');
        break;
      case 'home':
        if (ctx.atHome) this.set('idle', this.range(this.fauna.idleTime));
        else if (near && (ctx.fromHome ?? 0) <= s.guardRadius) this.set('chase');
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
        if (s.behavior === 'guardian' && (ctx.fromHome ?? 0) > s.guardRadius) this.set('home'); // jogador saiu do território
        else if (dist <= s.attackRange) this.set('attack');
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
  react(dist = 0, ctx = {}) {
    const s = this.spec, b = s.behavior;
    if (b === 'passive') return; // camelo, girafa: ignoram quem passa
    if (b === 'ambush') { // víbora, jacaré: só dão o bote bem de perto
      if (dist <= s.strikeRange) { this.angry = true; this.set('chase'); }
      return;
    }
    if (b === 'territorial') { // urso: encara; ataca se invadirem o território
      if (dist <= s.territory) { this.angry = true; this.set('chase'); } else this.set('threat', 0);
      return;
    }
    if (b === 'guardian' && (ctx.fromHome ?? 0) > s.guardRadius) return; // fora do território: ignora
    if (this.fearful) this.startFleeing();
    else if (b === 'stalker') this.set('stalk');
    else if (this.aggressive) this.set('chase');
    // neutro calmo: ignora
  }

  calmDown() {
    const b = this.spec.behavior;
    if (b === 'neutral' || b === 'territorial' || b === 'ambush') this.angry = false;
    this.set(b === 'guardian' ? 'home' : 'idle', this.range(this.fauna.idleTime));
  }
}
