import * as THREE from 'three';
import { Animal } from '../entities/Animal.js';
import { SPECIES, BIOME_FAUNA, FAUNA, GUARDIANS } from '../config/fauna.js';
import { BIOMES } from '../config/biomes.js';
import { WORLD } from '../config/worldConfig.js';
import { pickWeighted, groupSize, spawnTable } from './FaunaRules.js';
import { AnimalSounds } from '../audio/AnimalSounds.js';

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
    for (const a of [...this.animals]) {
      const { strike, state } = a.update(dt, playerPos, playerAlive);
      if (strike) this.game.damagePlayer(a.spec.damage, a.spec.nome);
      if (a.agent) this.game.physics?.moveAgent(a.agent, a.position.x, a.position.y, a.position.z, dt);
      if (state !== a.reported) this.onStateChange(a, state, playerPos);
      // Bando: quem entra em perseguição chama os outros do mesmo grupo.
      if (a.spec.behavior === 'pack' && (state === 'chase' || state === 'attack')) {
        for (const b of this.animals) if (b !== a && b.group === a.group && b.brain.state !== 'chase' && b.brain.state !== 'attack') b.brain.alert();
      }
      const far = Math.hypot(a.position.x - playerPos.x, a.position.z - playerPos.z) > this.config.despawn;
      if (far || a.brain.gone || (!a.alive && a.deadTime > this.config.corpseSeconds)) this.remove(a);
    }
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
      made.push(animal);
    }
    return made;
  }

  remove(a) {
    if (a.agent) this.game.physics?.removeAgent(a.agent);
    this.game.scene.remove(a.root);
    this.game.combat.unregister(a.root);
    this.animals = this.animals.filter((x) => x !== a);
  }

  clear() {
    for (const a of [...this.animals]) this.remove(a);
  }
}
