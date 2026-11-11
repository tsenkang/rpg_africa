import * as THREE from 'three';
import { Animal } from '../entities/Animal.js';
import { SPECIES, BIOME_FAUNA, FAUNA, GUARDIANS } from '../config/fauna.js';
import { BIOMES } from '../config/biomes.js';
import { WORLD } from '../config/worldConfig.js';
import { pickWeighted, groupSize, spawnTable } from './FaunaRules.js';
import { PACKS, CARCASS } from '../config/ecosystem.js';
import { CarcassSystem } from './fauna/CarcassSystem.js';
import { AnimalSounds } from '../audio/AnimalSounds.js';
import { EcosystemManager } from './fauna/EcosystemManager.js';
import { ECOSYSTEM } from '../config/ecosystem.js';
import { CombatAnimationSystem } from './fauna/CombatAnimationSystem.js';
import { FAUNA_COMBAT } from '../config/faunaCombat.js';

/**
 * Fauna regional: mantém grupos de animais vivos em volta do jogador, sorteados
 * pelo bioma do ponto onde nascem (`BIOME_FAUNA`). Atualiza a IA de cada um,
 * aplica o dano dos ataques no jogador, alerta o bando (hienas) e remove quem
 * ficou longe, se enterrou, voou ou morreu.
 *
 * Integração no loop (Game.update):
 *   this.fauna.update(dt, this.player.position, { active: areaId === 'overworld', playerAlive });
 *
 * Serviços do `game` usados: scene, terrain (weightsAt, heightAt),
 * villages, combat (register/unregister para o soco), damagePlayer(n, origem).
 */
export class Fauna {
  /**
   * @param {object} game
   * @param {{ rng?: () => number, config?: object, models?: { instance: (id: string) => object|null } }} [opts]
   *   `models`: modelos 3D (`AnimalModels`); sem ele (ou antes de carregar) o corpo é procedural.
   */
  constructor(game, { rng = Math.random, config = FAUNA, models = null } = {}) {
    this.models = models;
    this.game = game;
    this.rng = rng;
    this.config = config;
    this.animals = [];
    this.spawnTimer = 0;
    this.groupSeq = 0;
    this._w = new Float32Array(BIOMES.length);
    this.sounds = typeof window !== 'undefined' ? new AnimalSounds() : null;
    this.laughed = new Set(); // bandos de hiena que já riram
    /** Guardiões vivos por espécie e quando podem voltar (GUARDIANS). */
    this.guardians = new Map();
    /** Cadeia alimentar, fome/energia, alvo/ameaça de cada animal e LOD estatístico. */
    this.ecosystem = new EcosystemManager(ECOSYSTEM, { rng });
    /** Agarrões (mordida no pescoço, rolamento da morte). */
    this.grapples = new CombatAnimationSystem();
    /** Carcaças: comida para predadores e necrófagos até decompor (F4). */
    this.carcasses = new CarcassSystem();
    this._playerDot = 0;
  }

  /**
   * O jogador como "corpo" para o combate entre espécies (agarrão, efeitos).
   * Usa a posição e os efeitos do Player.
   */
  get playerBody() {
    const g = this.game;
    if (!this._pb) this._pb = { isPlayer: true, get position() { return g.player.position; }, get alive() { return !g.dead; }, get status() { return g.player.status; } };
    return this._pb;
  }

  /**
   * Compila os shaders de todas as espécies ANTES do jogo começar (um de cada
   * numa cena temporária): sem travadinha quando o primeiro leão aparece.
   */
  warmup(renderer, camera) {
    const temp = [];
    for (const id of Object.keys(SPECIES)) {
      const a = new Animal({ spec: SPECIES[id], speciesId: id, fauna: this.config, x: 0, z: 0, groundAt: () => -500, model: this.models?.instance(id) ?? null });
      this.game.scene.add(a.root);
      temp.push(a);
    }
    renderer.compile(this.game.scene, camera);
    for (const a of temp) this.game.scene.remove(a.root);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos
   * @param {{ active: boolean, playerAlive: boolean }} state
   *   `active` = jogador na superfície (no subsolo os animais somem)
   */
  update(dt, playerPos, { active, playerAlive }) {
    if (!active) {
      if (this.animals.length) this.clear();
      return;
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.config.spawnInterval;
      if (this.animals.length < this.config.maxAnimals) this.trySpawn(playerPos);
    }
    this.updateGuardians(playerPos);
    // Ecossistema: quem caça quem, quem foge de quem; caçadas longe resolvidas por estatística.
    const st = this.game.state;
    const events = this.ecosystem.update(dt, this.animals, { position: playerPos, alive: playerAlive, health01: st ? st.health / st.maxHealth : 1 });
    for (const e of events) {
      if (e.type === 'kill') this.applyKill(e.predator, e.prey);
      else if (e.type === 'howl' || e.type === 'alarm') this.groupCall(e, playerPos);
    }
    // Carcaças (F4): quem tem fome vem comer; necrófagos esperam o superpredador; decompõe.
    for (const c of this.carcasses.update(dt, this.animals)) if (this.animals.includes(c.animal)) this.remove(c.animal);
    // Agarrões em andamento: dano por segundo, arrasto do jacaré para a água.
    this.grapples.update(dt, {
      damage: (v, n, a) => {
        if (v.isPlayer) { this._playerDot += n; if (this._playerDot >= 2) { this.game.damagePlayer(this._playerDot, `${a.spec.nome} (${a.combat.clamp?.label ?? 'agarrão'})`, null, a); this._playerDot = 0; } }
        else if (v.alive) { v.health -= n; if (v.health <= 0) { v.brain.die(); this.applyKill(a, v, false); } }
      },
      waterDir: (v) => this.waterDir(v.position),
    });
    const pfw = this.game.player?.facing;
    for (const a of [...this.animals]) {
      a.playerFwd = pfw;
      const { strike, state, victim, kick } = a.update(dt, playerPos, playerAlive);
      if (strike && victim) this.hitAnimal(a, victim);
      else if (strike) this.hitPlayer(a);
      if (kick === 'player') this.hitPlayer(a);
      else if (kick) this.hitAnimal(a, kick);
      if (strike && a.combat.aoe) this.groundPound(a, victim ?? (playerAlive ? this.playerBody : null));
      if (a.agent) this.game.physics?.moveAgent(a.agent, a.position.x, a.position.y, a.position.z, dt);
      if (state !== a.reported) this.onStateChange(a, state, playerPos);
      // Bando: quem entra em perseguição chama os outros do mesmo grupo.
      if (a.spec.behavior === 'pack' && (state === 'chase' || state === 'attack')) {
        for (const b of this.animals) if (b !== a && b.group === a.group && b.brain.state !== 'chase' && b.brain.state !== 'attack') b.brain.alert();
      }
      const far = Math.hypot(a.position.x - playerPos.x, a.position.z - playerPos.z) > this.config.despawn;
      if (far || a.brain.gone || (!a.alive && !a.carcass && a.deadTime > this.config.corpseSeconds)) this.remove(a);
    }
    for (const c of this.carcasses.list) this.decayLook(c);
  }

  /**
   * Golpe de animal em animal. A vítima reage (foge ou revida contra o agressor);
   * morreu → o predador come.
   */
  hitAnimal(a, v, scale = 1) {
    if (!v.alive) return;
    const dx = v.position.x - a.position.x, dz = v.position.z - a.position.z, l = Math.hypot(dx, dz) || 1;
    v.takeHit({ damage: a.spec.damage * scale, direction: { x: dx / l, z: dz / l } });
    if (v.eco && v.alive && (!v.brain.fearful || v.eco.level === 3)) v.eco.retaliate = a; // girafa/alce/gorila/urso revidam
    if (!v.alive) { this.applyKill(a, v, false); return; }
    const fx = a.combat.effect;
    if (fx) {
      v.status.apply(fx);
      if (fx.knockback) { v.position.x += (dx / l) * fx.knockback; v.position.z += (dz / l) * fx.knockback; }
    }
    if (a.combat.clamp) this.grapples.startGrapple(a, v, a.combat.clamp);
  }

  /** Golpe no jogador: dano + efeito da espécie (atordoa, lentidão, empurrão) + agarrão. */
  hitPlayer(a, scale = 1) {
    const g = this.game;
    g.damagePlayer(a.spec.damage * scale, a.spec.nome, a.speciesId, a);
    if (g.dead) return;
    const fx = a.combat.effect;
    if (fx) {
      // Veneno no jogador vem do sistema de ferimentos (picada venenosa); aqui só o resto.
      g.player.status?.apply({ stun: fx.stun, slow: fx.slow });
      if (fx.knockback) {
        const dx = g.player.position.x - a.position.x, dz = g.player.position.z - a.position.z, l = Math.hypot(dx, dz) || 1;
        g.player.knockback?.((dx / l) * fx.knockback, (dz / l) * fx.knockback);
      }
    }
    if (a.combat.clamp) this.grapples.startGrapple(a, this.playerBody, a.combat.clamp);
  }

  /** Gorila: os punhos no chão atingem todos em volta (menos a própria espécie). */
  groundPound(a, main) {
    const R = a.combat.aoe;
    for (const o of this.animals) {
      if (o === a || o === main || !o.alive || o.speciesId === a.speciesId) continue;
      if (Math.hypot(o.position.x - a.position.x, o.position.z - a.position.z) <= R) this.hitAnimal(a, o, 0.5);
    }
    const p = this.game.player.position;
    if (!main?.isPlayer && !this.game.dead && Math.hypot(p.x - a.position.x, p.z - a.position.z) <= R) this.hitPlayer(a, 0.5);
  }

  /** Direção (unitária) até a água mais perto, num raio curto — arrasto do jacaré. */
  waterDir(pos) {
    const T = this.game.terrain, WL = WORLD.waterLevel;
    for (let r = 2; r <= 14; r += 3) {
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2, x = pos.x + Math.cos(ang) * r, z = pos.z + Math.sin(ang) * r;
        if (T.heightAt(x, z) < WL - 0.3) return { x: Math.cos(ang), z: Math.sin(ang) };
      }
    }
    return null;
  }

  /** Abate entre animais (golpe final ou estatístico): a presa morre e o predador se alimenta. */
  applyKill(pred, prey, lethal = true) {
    if (lethal && prey.alive) prey.takeHit({ damage: prey.health + 1, direction: { x: 0, z: 1 } });
    prey.killedBy = pred;
    // Perto do jogador: vira carcaça e o predador come aos poucos (F4). Longe: refeição na hora.
    const p = this.game.player?.position;
    if (p && Math.hypot(prey.position.x - p.x, prey.position.z - p.z) <= this.ecosystem.cfg.detailRadius) {
      this.carcasses.add(prey);
      pred.eco && (pred.eco.target = null, pred.eco.hunting = false);
    } else this.ecosystem.feed(pred, prey);
    if (pred.alive && (pred.brain.state === 'chase' || pred.brain.state === 'attack')) pred.brain.calmDown();
  }

  /** Carcaça perdendo carne afunda e escurece até virar ossos. */
  decayLook(c) {
    const a = c.animal, k = 1 - CarcassSystem.fresh(c);
    if (!a.root) return;
    a.root.position.y = a.groundAt(a.position.x, a.position.z) - k * CARCASS.sink;
    a.root.scale.y = 1 - k * 0.55;
  }

  /** Uivo do líder da matilha / grito de alarme do vigia da manada (F3). */
  groupCall(e, playerPos) {
    const a = e.leader ?? e.sentinel;
    if (!a) return;
    const d = Math.hypot(a.position.x - playerPos.x, a.position.z - playerPos.z);
    const loud = Math.max(0, 1 - d / PACKS.pack.howlRadius);
    if (e.type === 'howl') { if (a.spec.laughs) this.sounds?.laugh(loud); else this.sounds?.howl?.(loud); }
    else this.sounds?.alarm?.(loud);
    this.lastCall = { type: e.type, species: a.speciesId, t: this.game.time };
  }

  /** Sons e reações quando a IA muda de estado. */
  onStateChange(a, state, playerPos) {
    a.reported = state;
    const d = Math.hypot(a.position.x - playerPos.x, a.position.z - playerPos.z);
    const loud = Math.max(0, 1 - d / 60);
    // Hiena: o bando ri ao avistar o jogador (uma vez por bando).
    if (a.spec.laughs && (state === 'chase' || state === 'attack') && !this.laughed.has(a.group)) {
      this.laughed.add(a.group);
      this.sounds?.laugh(loud);
    }
    if (state === 'threat' && a.spec.threat) this.sounds?.chestBeat(loud); // gorila
    if (state === 'dead') this.game.onAnimalDeath?.(a); // sanidade: morte presenciada
    if (state === 'dead' && a.guardianOf) this.guardians.set(a.guardianOf.species, { animal: null, back: this.game.time + a.guardianOf.respawn });
  }

  /** Guardiões presos a um lugar (cérbero nas Ruínas de Kaelen). */
  updateGuardians(playerPos) {
    for (const g of GUARDIANS) {
      const v = this.game.villages?.[g.village];
      if (!v) continue;
      const cur = this.guardians.get(g.species);
      if (cur?.animal && this.animals.includes(cur.animal)) continue;
      if (cur && !cur.animal && this.game.time < cur.back) continue;
      if (Math.hypot(playerPos.x - v.x, playerPos.z - v.z) > g.trigger) continue;
      for (let t = 0; t < 12; t++) {
        const a = this.rng() * Math.PI * 2, r = this.rng() * g.spread;
        const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
        if (this.game.collisions?.overlaps(x, z, 2)) continue;
        const [animal] = this.spawnGroup(g.species, x, z, 1, { force: true });
        animal.guardianOf = g;
        this.guardians.set(g.species, { animal, back: 0 });
        break;
      }
    }
  }

  /** Bioma dominante (objeto de `BIOMES`) no ponto. */
  biomeAt(x, z) {
    const w = this.game.terrain.weightsAt(x, z, this._w);
    let best = 0;
    for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
    return BIOMES[best];
  }

  nearVillage(x, z) {
    const m = this.config.villageMargin;
    return Object.values(this.game.villages).some((v) => Math.hypot(x - v.x, z - v.z) < v.radius + m);
  }

  /** Tenta nascer um grupo num anel em volta do jogador. */
  trySpawn(playerPos) {
    const { spawnMin, spawnMax } = this.config;
    const half = { x: WORLD.width / 2 - 10, z: WORLD.depth / 2 - 10 };
    for (let tries = 0; tries < 6; tries++) {
      const ang = this.rng() * Math.PI * 2;
      const d = spawnMin + (spawnMax - spawnMin) * this.rng();
      const x = playerPos.x + Math.cos(ang) * d, z = playerPos.z + Math.sin(ang) * d;
      if (Math.abs(x) > half.x || Math.abs(z) > half.z) continue;
      const h = this.game.terrain.heightAt(x, z);
      // Água funda: só aquáticos (jacaré); beira d'água rasa: ninguém nasce.
      const inWater = h < WORLD.waterLevel - 0.6;
      if ((!inWater && h < WORLD.waterLevel + 0.3) || this.nearVillage(x, z)) continue;
      const biome = this.biomeAt(x, z);
      const id = pickWeighted(spawnTable(BIOME_FAUNA[biome.id], SPECIES, inWater), this.rng());
      if (!id) continue;
      this.spawnGroup(id, x, z);
      return;
    }
  }

  /**
   * Cria um grupo da espécie `id` em volta de (x, z). Também serve para testar
   * no console: `game.fauna.spawnGroup('leao', x, z)`.
   */
  spawnGroup(id, x, z, count, { force = false } = {}) {
    const spec = SPECIES[id];
    if (!spec) throw new Error(`Espécie desconhecida: ${id}`);
    const n = force ? (count ?? 1) : Math.min(count ?? groupSize(spec.group, this.rng()), this.config.maxAnimals + 4 - this.animals.length);
    const group = ++this.groupSeq;
    const made = [];
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, r = i === 0 ? 0 : 1.5 + this.rng() * 3 * spec.size;
      const animal = new Animal({
        spec, speciesId: id, group, fauna: this.config, rng: this.rng,
        model: this.models?.instance(id) ?? null,
        x: x + Math.cos(a) * r, z: z + Math.sin(a) * r,
        // Manadas (F3): parte do grupo nasce filhote (nunca o primeiro).
        young: i > 0 && PACKS.herd.species.includes(id) && this.rng() < PACKS.young.chance,
        groundAt: (px, pz) => this.game.terrain.heightAt(px, pz),
      });
      this.game.scene.add(animal.root);
      // Corpo físico (cinemático): empurra barris e caixotes pelo caminho.
      if (this.game.physics) {
        animal.agent = this.game.physics.addAgent({ x: animal.position.x, y: animal.position.y, z: animal.position.z, radius: animal.bodyRadius ?? 0.4, height: animal.bodyHeight ?? 1 });
      }
      this.game.combat.register({
        name: spec.nome, object: animal.root,
        enabled: () => animal.alive,
        onHit: (hit) => animal.takeHit(hit),
      });
      this.animals.push(animal);
      this.ecosystem.register(animal);
      made.push(animal);
    }
    return made;
  }

  remove(a) {
    if (a.carcass) this.carcasses.list = this.carcasses.list.filter((c) => c.animal !== a);
    if (a.agent) this.game.physics?.removeAgent(a.agent);
    this.game.scene.remove(a.root);
    this.game.combat.unregister(a.root);
    this.animals = this.animals.filter((x) => x !== a);
  }

  clear() {
    for (const a of [...this.animals]) this.remove(a);
  }
}
