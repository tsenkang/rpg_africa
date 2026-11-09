import * as THREE from 'three';
import { Animal } from '../entities/Animal.js';
import { SPECIES, BIOME_FAUNA, FAUNA } from '../config/fauna.js';
import { BIOMES } from '../config/biomes.js';
import { WORLD } from '../config/worldConfig.js';
import { pickWeighted, groupSize } from './FaunaRules.js';

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
    for (const a of [...this.animals]) {
      const { strike, state } = a.update(dt, playerPos, playerAlive);
      if (strike) this.game.damagePlayer(a.spec.damage, a.spec.nome);
      // Bando: quem entra em perseguição chama os outros do mesmo grupo.
      if (a.spec.behavior === 'pack' && (state === 'chase' || state === 'attack')) {
        for (const b of this.animals) if (b !== a && b.group === a.group && b.brain.state !== 'chase' && b.brain.state !== 'attack') b.brain.alert();
      }
      const far = Math.hypot(a.position.x - playerPos.x, a.position.z - playerPos.z) > this.config.despawn;
      if (far || a.brain.gone || (!a.alive && a.deadTime > this.config.corpseSeconds)) this.remove(a);
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
      if (this.game.terrain.heightAt(x, z) < WORLD.waterLevel + 0.3 || this.nearVillage(x, z)) continue;
      const biome = this.biomeAt(x, z);
      const id = pickWeighted(BIOME_FAUNA[biome.id], this.rng());
      if (!id) return;
      this.spawnGroup(id, x, z);
      return;
    }
  }

  /**
   * Cria um grupo da espécie `id` em volta de (x, z). Também serve para testar
   * no console: `game.fauna.spawnGroup('leao', x, z)`.
   */
  spawnGroup(id, x, z, count) {
    const spec = SPECIES[id];
    if (!spec) throw new Error(`Espécie desconhecida: ${id}`);
    const n = Math.min(count ?? groupSize(spec.group, this.rng()), this.config.maxAnimals + 4 - this.animals.length);
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
    this.game.scene.remove(a.root);
    this.game.combat.unregister(a.root);
    this.animals = this.animals.filter((x) => x !== a);
  }

  clear() {
    for (const a of [...this.animals]) this.remove(a);
  }
}
