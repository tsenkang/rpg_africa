import * as THREE from 'three';
import { Input } from './Input.js';
import { CameraRig } from './CameraRig.js';
import { CAMERA } from '../config/camera.js';
import { WORLD, RENDER, REFERENCE_MAP, uvToWorld } from '../config/worldConfig.js';
import { BIOMES } from '../config/biomes.js';
import { VILLAGES, EXTRA_FLAT_ZONES } from '../config/villages.js';
import { ReferenceMap } from '../world/ReferenceMap.js';
import { WorldGenerator } from '../world/WorldGenerator.js';
import { Terrain } from '../world/Terrain.js';
import { Water } from '../world/Water.js';
import { Environment } from '../world/Environment.js';
import { Vegetation } from '../world/Vegetation.js';
import { Grass } from '../world/Grass.js';
import { CollisionWorld } from '../world/CollisionWorld.js';
import { Bridges } from '../world/Bridges.js';
import { createMaterials } from '../render/Materials.js';
import { loadPhotoTextures } from '../render/PhotoTextures.js';
import { loadOakModels } from '../render/TreeModels.js';
import { Player } from '../entities/Player.js';
import { PlayerState } from '../systems/PlayerState.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { Inventory } from '../systems/Inventory.js';
import { Combat } from '../systems/Combat.js';
import { TrainingDummy } from '../entities/TrainingDummy.js';
import { FirstPersonArm } from '../entities/FirstPersonArm.js';
import { GAMEPLAY } from '../config/gameplay.js';
import { Fauna } from '../systems/Fauna.js';
import { AnimalModels } from '../render/AnimalModels.js';
import { ANIMAL_MODELS } from '../config/animalModels.js';
import { Oxygen } from '../systems/Oxygen.js';
import { ITEM_USES } from '../systems/Items.js';
import { buildRenascimento } from '../villages/Renascimento.js';
import { buildPerseguicao } from '../villages/Perseguicao.js';
import { buildAbstracao } from '../villages/Abstracao.js';
import { buildBussola } from '../villages/Bussola.js';
import { Dungeons } from '../villages/Dungeons.js';
import { buildPresaDeGelo } from '../villages/PresaDeGelo.js';
import { buildAlZahir } from '../villages/AlZahir.js';
import { buildCopaAlta } from '../villages/CopaAlta.js';
import { buildAreiasVivas } from '../villages/AreiasVivas.js';
import { buildZambaRios } from '../villages/ZambaRios.js';
import { buildRuinasKaelen } from '../villages/RuinasKaelen.js';
import { FireLights } from '../render/FireLights.js';
import { Surfaces } from '../world/Surfaces.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { PropMeshes } from '../physics/PropMeshes.js';
import { Landmarks } from '../world/Landmarks.js';
import { LANDMARKS } from '../config/landmarks.js';
import { UI } from '../ui/UI.js';
import { WeatherManager } from '../render/WeatherManager.js';
import { PostFX } from '../render/PostFX.js';
import { Thunder } from '../audio/Thunder.js';
import { Minimap } from '../render/Minimap.js';
import { MINIMAP } from '../config/minimap.js';
import { Clouds } from '../world/Clouds.js';
import { VILLAGE_SHELTER, WEATHER_CYCLE, DEBUFFS, DEBUFF_RULES } from '../config/weather.js';
import { GameClock } from '../systems/WeatherClock.js';
import { computeDebuffs } from '../systems/WeatherDebuffs.js';
import { GRAPHICS_PRESETS, LOW_FPS_HINT } from '../config/graphics.js';
import { GraphicsStore, FpsMeter, presetById, stepPreset, applyGraphics } from '../render/GraphicsSettings.js';

import { yieldToBrowser as nextFrame } from './yieldToBrowser.js';

/**
 * Orquestra o jogo: gera o mundo (terreno → vilas → malha → água →
 * vegetação), cria jogador/câmera/UI e roda o loop principal.
 *
 * Serviços expostos para vilas e mecânicas:
 *   scene, terrain, collisions, materials, interactions, state, flags, time,
 *   ui, villages, groundHeight(x,z), enterArea(id), travelTo(x,z),
 *   inventory (hotbar de 8 slots), combat (soco), adicionarItem(item),
 *   cameraRig (1ª/3ª pessoa, C alterna; ALT trava o cursor),
 *   fauna (animais por bioma), oxygen (fôlego na água),
 *   damagePlayer(n, origem), killPlayer(msg), random() (injetável)
 */
export class Game {
  /** Nome dos objetos dinâmicos no aviso do soco. */
  static PROP_NAMES = { barrel: 'Barril', crate: 'Caixote', plank: 'Tábua', log: 'Tora', sack: 'Saco', lantern: 'Lanterna', branch: 'Galho' };

  /** Posição longe de tudo (subsolo): nenhuma fogueira ganha luz. */
  static NOWHERE = { x: Infinity, z: Infinity };

  constructor(container) {
    this.container = container;
    // Nível gráfico salvo (tecla G). O antialias só pode ser escolhido aqui.
    this.graphicsStore = new GraphicsStore();
    this.graphics = presetById(this.graphicsStore.load());
    this.fpsMeter = new FpsMeter(LOW_FPS_HINT);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.graphics.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.graphics.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.1, RENDER.far);
    this.clock = new THREE.Clock();
    this.input = new Input(this.renderer.domElement);
    this.state = new PlayerState();
    this.inventory = new Inventory({ slots: GAMEPLAY.inventory.slots });
    this.combat = new Combat(GAMEPLAY.combat);
    this.dummies = [];
    this.random = Math.random; // trocável em testes (sorteios do jogo)
    this.oxygen = new Oxygen(GAMEPLAY.swimming);
    /** Relógio do jogo (dias/horas): move o sol e sorteia o clima a cada hora. */
    this.gameClock = new GameClock(WEATHER_CYCLE);
    this._weatherDamage = 0;
    this.dead = false;
    this.respawnAt = 0;
    this.lastVillage = null; // vila onde o jogador renasce
    this._wasBusy = false;
    this.flags = {};
    this.time = 0;
    this.areaId = 'overworld';
    this.areas = {};
    this.ready = false;
    this.timeUniform = { value: 0 };
    this._w = new Float32Array(BIOMES.length);
    this.player = { position: new THREE.Vector3(), facing: new THREE.Vector3(0, 0, -1), fastTravel: false };
    /** Chão com andares: plataformas, pontes de corda, escadas, palafitas (as vilas registram). */
    this.surfaces = new Surfaces();
    this.ui = new UI(this, container);
    this.inventory.onChange((inv) => {
      this.ui.refreshHotbar(inv);
      this._applyCameraMode?.(); // braço de 1ª pessoa só com Mãos Livres
    });
    this.ui.refreshHotbar(this.inventory);

    window.addEventListener('resize', () => this.onResize());
  }

  /** Gera o mundo inteiro (assíncrono, com barra de progresso). */
  async init() {
    const ui = this.ui;
    const step = async (pct, text) => { ui.setLoading(pct, text); await nextFrame(); };

    await step(0.02, 'Lendo o mapa de referência…');
    // >>> IMAGEM BASE: configure REFERENCE_MAP em src/config/worldConfig.js
    //     (textura do minimapa, máscara de biomas e/ou heightmap).
    this.referenceMap = await ReferenceMap.load(REFERENCE_MAP);
    await step(0.03, 'Carregando texturas fotográficas e árvores 3D…');
    [this.photos, this.oaks] = await Promise.all([
      loadPhotoTextures(this.renderer),
      // Sem os carvalhos 3D o jogo continua com as árvores procedurais.
      loadOakModels(this.renderer).catch((err) => { console.warn('Árvores 3D indisponíveis:', err.message); return null; }),
    ]);
    this.generator = new WorldGenerator(this.referenceMap);
    for (const v of Object.values(VILLAGES)) {
      const c = uvToWorld(v.u, v.v);
      this.generator.addFlatZone({ x: c.x, z: c.z, ...v.flatten });
    }
    for (const z of EXTRA_FLAT_ZONES) {
      const c = uvToWorld(z.u, z.v);
      this.generator.addFlatZone({ x: c.x, z: c.z, radius: z.radius, blend: z.blend });
    }

    // Marcos do mapa (torre, templo, fortaleza, árvores anciãs…): chão aplainado antes do relevo.
    this.landmarks = new Landmarks(LANDMARKS, uvToWorld);
    this.landmarks.registerFlatZones(this.generator);

    this.terrain = new Terrain(this.generator);
    await this.terrain.generate((p) => ui.setLoading(0.04 + p * 0.4, `Esculpindo relevo, rios e o lago… ${Math.round(p * 100)}%`));

    await step(0.46, 'Construindo pontes e vilas…');
    this.collisions = new CollisionWorld();
    this.materials = createMaterials(this.timeUniform);
    this.interactions = new InteractionSystem();
    this.bridges = new Bridges(this.terrain, this.generator);
    this.scene.add(this.bridges.build(this.materials, this.collisions));
    this.pierDecks = [];

    this.villages = {};
    // Uma vila por bioma (+ as quatro originais) e as ruínas da Floresta Preta.
    const builders = {
      renascimento: buildRenascimento, perseguicao: buildPerseguicao, abstracao: buildAbstracao, bussola: buildBussola,
      presaDeGelo: buildPresaDeGelo, alZahir: buildAlZahir, copaAlta: buildCopaAlta,
      areiasVivas: buildAreiasVivas, zambaRios: buildZambaRios, ruinasKaelen: buildRuinasKaelen,
    };
    let k = 0;
    for (const [id, build] of Object.entries(builders)) {
      await step(0.48 + k * 0.02, `Construindo ${VILLAGES[id].name}…`);
      this.villages[id] = build(this);
      k++;
    }
    this.dungeons = new Dungeons(this);
    this.areas = this.dungeons.areas;
    await step(0.68, 'Erguendo os marcos do mapa…');
    this.scene.add(this.landmarks.build(this));

    await step(0.7, 'Pintando o chão (biomas, ruas e praças)…');
    const paints = [...Object.values(this.villages).map((v) => v.paint()), ...this.bridges.paints()];
    this.scene.add(this.terrain.buildMesh(this.materials.textures, paints, this.photos));

    this.water = new Water();
    this.scene.add(this.water.mesh);
    this.environment = new Environment(this.scene, this.renderer);
    // Clima por bioma + névoa paranormal (roda depois do Environment no loop).
    this.weather = new WeatherManager({
      scene: this.scene, environment: this.environment, renderer: this.renderer, rng: this.random, audio: new Thunder(),
      groundAt: (x, z) => this.groundHeight(x, z),
    });
    /** Criaturas paranormais: empurre aqui (`game.paranormalCreatures.push(obj)`) — a névoa engrossa perto delas. */
    this.paranormalCreatures = this.weather.creatures;
    // Presenças fixas (Ruínas de Kaelen): a névoa paranormal engrossa perto.
    for (const v of Object.values(this.villages)) this.paranormalCreatures.push(...v.presences);
    // Fogueiras e luzes errantes: poucas PointLights reais vão para as mais próximas.
    this.fireLights = new FireLights(this.scene);
    for (const v of Object.values(this.villages)) for (const f of v.fires) this.fireLights.add(f);
    this.postfx = new PostFX(this.renderer);
    this.clouds = new Clouds({ seed: WORLD.seed });
    this.scene.add(this.clouds.mesh);

    const villageList = Object.values(this.villages);
    const extraFlat = EXTRA_FLAT_ZONES.map((z) => ({ ...uvToWorld(z.u, z.v), r: z.radius * 0.8 }));
    const inVillage = (x, z, pad = 0) => villageList.some((v) => Math.hypot(x - v.x, z - v.z) < v.radius + 8 + pad)
      || extraFlat.some((f) => Math.hypot(x - f.x, z - f.z) < f.r);
    this.vegetation = new Vegetation({
      terrain: this.terrain, generator: this.generator, timeUniform: this.timeUniform, photos: this.photos, oaks: this.oaks,
      isBlocked: (x, z, pad = 0) => inVillage(x, z, pad) || this.landmarks.isClear(x, z, pad) || this.bridges.distanceTo(x, z) < 8 + pad || this.collisions.overlaps(x, z, pad),
    });
    await this.vegetation.build((p) => ui.setLoading(0.72 + p * 0.22, `Plantando a vegetação de cada bioma… ${Math.round(p * 100)}%`));
    this.vegetation.plant([...this.landmarks.plants, ...Object.values(this.villages).flatMap((v) => v.plants)]);
    this.scene.add(this.vegetation.group);

    this.grass = new Grass({
      terrain: this.terrain, timeUniform: this.timeUniform, photos: this.photos,
      isGrassBlocked: (x, z) => {
        for (const v of villageList) {
          const d = Math.hypot(x - v.x, z - v.z);
          if (d < v.radius * 0.92) return true;
        }
        return this.bridges.distanceTo(x, z) < 4 || this.collisions.overlaps(x, z, 0.2);
      },
    });
    this.scene.add(this.grass.mesh);

    // Física (cannon-es): objetos dinâmicos das vilas + estáticos transmitidos em volta do jogador.
    // O terreno físico ignora plataformas altas (feetY = −∞): só chão, pontes e píeres.
    this.physics = new PhysicsWorld({ groundAt: (x, z) => this.groundHeight(x, z, -Infinity), collisions: this.collisions, surfaces: this.surfaces });
    for (const v of Object.values(this.villages)) {
      for (const p of v.props) {
        const base = p.y ?? this.groundHeight(p.x, p.z, -Infinity) + (p.lift ?? 0);
        this.physics.addProp(p.type, { x: p.x, z: p.z, y: base, rot: p.rot ?? 0, scale: p.scale ?? 1 });
      }
    }
    this.propMeshes = new PropMeshes(this.physics.byType, this.materials);
    this.propMeshes.sync(this.physics.props);
    this.scene.add(this.propMeshes.group);

    // Minimapa em tempo real: terreno, água, pontes e ícones das construções.
    this.minimap = new Minimap(this.renderer, this.scene);
    this.minimap.show(this.terrain.mesh, this.water.mesh, this.bridges.group);
    this.minimap.setLighting(this.environment.sun, this.environment.hemi);
    this.minimap.buildIcons(this.collisions.all, (x, z) => this.terrain.heightAt(x, z));

    await step(0.97, 'Acordando os moradores…');
    this.player = new Player({
      groundAt: (x, z) => this.groundHeight(x, z),
      collisions: this.collisions,
      state: this.state,
      isUnderground: () => this.areaId !== 'overworld',
    });
    this.scene.add(this.player.root);
    const ren = this.villages.renascimento;
    this.player.teleport(ren.x + 3, ren.z + 17, Math.PI); // borda sul da praça, olhando para o poço e a igreja
    this.cameraRig = new CameraRig(this.camera, { groundAt: (x, z) => this.groundHeight(x, z) });
    this.cameraRig.yaw = Math.PI;
    this.setupCamera();
    this.setupCombat();
    // Modelos 3D dos animais carregam em segundo plano; até chegarem, corpo procedural.
    this.animalModels = new AnimalModels(ANIMAL_MODELS);
    this.animalModels.loadAll();
    this.fauna = new Fauna(this, { rng: this.random, models: this.animalModels });

    applyGraphics(this, this.graphics);
    this.ready = true;
    ui.setLoading(1, 'Pronto! Pressione ALT para travar a câmera no mouse.');
    ui.hideLoading();
    ui.toast('Bem-vindo à Vila Renascimento. ALT trava/destrava a câmera · C alterna 1ª/3ª pessoa.');
  }

  /**
   * Coloca um item na hotbar (primeiro slot vazio).
   * Teste no console: `game.adicionarItem({ id: 'faca', nome: 'Faca', icone: '🔪' })`.
   * @returns {number} slot usado, ou -1 se a hotbar estiver cheia.
   */
  adicionarItem(item) {
    return this.inventory.adicionarItem(item);
  }

  /**
   * Liga a câmera dupla (1ª/3ª pessoa) à UI, ao braço de 1ª pessoa e à trava
   * do cursor (ALT).
   */
  setupCamera() {
    this.scene.add(this.camera); // o braço de 1ª pessoa é filho da câmera
    this.fpArm = new FirstPersonArm();
    this.fpArm.root.visible = false;
    this.camera.add(this.fpArm.root);
    this._camFwd = new THREE.Vector3();
    const applyMode = () => {
      const first = this.cameraRig.isFirstPerson;
      this.player.root.visible = !first;
      this.fpArm.root.visible = first && this.inventory.maosLivres;
      this.ui.setCameraStatus({ locked: this.input.locked, firstPerson: first });
    };
    this.cameraRig.onModeChange((mode) => {
      if (mode === 'first') this.player.faceDirection(this.cameraRig.forward(this._camFwd));
      applyMode();
      this.ui.toast(mode === 'first' ? 'Câmera em 1ª pessoa (C volta)' : 'Câmera em 3ª pessoa (C volta)');
    });
    this.input.onLockChange((locked, error) => {
      this.ui.setCameraStatus({ locked, firstPerson: this.cameraRig.isFirstPerson });
      if (error) this.ui.toast('O navegador recusou travar o cursor aqui. Arraste com o mouse para girar a câmera.');
    });
    this._applyCameraMode = applyMode;
    applyMode();
  }

  /** Alvos do soco: NPCs de todas as vilas e um boneco de treino em Renascimento. */
  setupCombat() {
    const knockback = GAMEPLAY.combat.punch.knockback;
    for (const v of Object.values(this.villages)) {
      v.group.userData.hitName = `Construção (${v.config.name})`;
      for (const npc of v.npcs) {
        this.combat.register({
          name: npc.name,
          object: npc.root,
          enabled: () => npc.area === this.areaId,
          onHit: (hit) => npc.takeHit(hit, knockback),
          // Clicar num NPC que conversa abre o diálogo (igual à tecla E).
          talk: npc.onInteract ? () => npc.onInteract(this) : null,
        });
      }
    }
    // Boneco ao lado de onde o jogador começa (borda sul da praça).
    const ren = this.villages.renascimento;
    const dx = ren.x + 5.5, dz = ren.z + 15.5;
    const dummy = new TrainingDummy({ x: dx, z: dz, y: this.groundHeight(dx, dz), facing: Math.PI, ...GAMEPLAY.trainingDummy });
    this.scene.add(dummy.root);
    this.collisions.addCircle?.(dx, dz, 0.4);
    this.combat.register({
      name: dummy.name,
      object: dummy.hitbox,
      enabled: () => this.areaId === 'overworld' && dummy.alive,
      onHit: (hit) => dummy.hit(hit),
    });
    this.dummies.push(dummy);
  }

  /**
   * Clique esquerdo. Ordem:
   *  1. item equipado com uso (ex.: Injeção Suspeita) → usa o item;
   *  2. Mãos Livres mirando um NPC que conversa (Raycaster, `GAMEPLAY.talk.range`) → abre o diálogo;
   *  3. senão → soco para onde a câmera olha (NPCs sem diálogo, animais, boneco).
   */
  tryAttack() {
    if (this.dead) return;
    if (!this.inventory.maosLivres) {
      this.useEquipped(this.inventory.equipado);
      return;
    }
    if (this.player.flying || this.player.swimming) return;
    const punch = GAMEPLAY.combat.punch;
    const dir = this.cameraRig.forward(new THREE.Vector3());
    const origin = this.player.punchOrigin();
    // Só as construções das vilas perto entram no teste (malhas grandes).
    const p = this.player.position;
    this.combat.obstacles = this.areaId === 'overworld'
      ? Object.values(this.villages).filter((v) => Math.hypot(p.x - v.x, p.z - v.z) < v.radius + 30).map((v) => v.group)
      : [];
    const talk = this.combat.pick(origin, dir, GAMEPLAY.talk.range);
    if (talk?.target?.talk) {
      this.player.faceDirection(dir);
      talk.target.talk();
      return;
    }
    if (!this.combat.canPunch(this.time)) return;
    this.player.startPunch(dir, punch.duration);
    if (this.cameraRig.isFirstPerson) this.fpArm.punch(punch.duration);
    const { hit } = this.combat.punch(origin, dir, this.time);
    const prop = this.areaId === 'overworld' ? this.physics.punch(origin, dir) : null;
    if (!hit && prop) {
      this.cameraRig.kick(punch.cameraKick * 0.7);
      this.ui.showHit(`Acertou: ${Game.PROP_NAMES[prop.type] ?? prop.type}`, true);
      return;
    }
    this.cameraRig.kick(hit ? punch.cameraKick : punch.cameraKick * 0.4);
    if (hit) {
      const dummy = this.dummies.find((d) => d.hitbox === hit.target?.object);
      const animal = this.fauna.animals.find((a) => a.root === hit.target?.object);
      const extra = dummy ? ` · ${dummy.health}/${dummy.maxHealth}`
        : animal ? (animal.alive ? ` · ${Math.max(0, animal.health)}/${animal.spec.health}` : ' · abatido') : '';
      this.ui.showHit(`Acertou: ${hit.name}${extra}`, true);
    } else {
      this.ui.showHit('Soco no ar', false);
    }
  }

  /** Usa o item do slot ativo (`ITEM_USES`); se ele for gasto, sai da hotbar. */
  useEquipped(item) {
    const use = ITEM_USES[item.id];
    if (!use) {
      this.ui.showHit(`${item.nome}: ainda sem uso`, false);
      return;
    }
    if (use(this, item)) this.inventory.removerItem(this.inventory.selected);
  }

  /**
   * Dano no jogador (ataque de animal…). Zerou a vida → morte e respawn.
   * @param {number} amount
   * @param {string} source quem causou (vai na mensagem de morte)
   */
  damagePlayer(amount, source) {
    if (this.dead) return;
    this.state.damage(amount);
    this.player.model.flinch();
    this.cameraRig.kick(0.05);
    this.ui.flashDamage(`-${amount} · ${source}`);
    if (this.state.health <= 0) this.killPlayer(`Você foi morto: ${source}`);
  }

  /** Tela escurece com a mensagem; depois de `GAMEPLAY.death.respawnSeconds` renasce na última vila. */
  killPlayer(message) {
    if (this.dead) return;
    this.dead = true;
    this.respawnAt = this.time + GAMEPLAY.death.respawnSeconds;
    this.ui.dialogue.close();
    this.input.unlock();
    this.ui.showDeath(message);
  }

  /** Volta à vida na última vila visitada (ou Renascimento), com vida e fôlego cheios. */
  respawn() {
    if (this.areaId !== 'overworld') this.enterArea('overworld');
    const v = this.lastVillage ?? this.villages.renascimento;
    const off = GAMEPLAY.death.respawnOffset;
    if (v === this.villages.renascimento) this.player.teleport(v.x + 3, v.z + 17, Math.PI);
    else this.player.teleport(v.x + off, v.z + v.radius * 0.5, Math.PI);
    this.player.swimming = false;
    this.player.submerged = false;
    this.state.healFull();
    this.oxygen.reset();
    this.fauna.clear();
    this.cameraRig.yaw = Math.PI;
    this.cameraRig.snap();
    this.dead = false;
    this.ui.hideDeath();
    this.ui.toast(`Você acordou em ${v.config.name}.`);
  }

  /**
   * Altura do chão onde o personagem pisa: terreno, tabuleiro das pontes,
   * píeres e, no subsolo, o piso da masmorra ativa.
   */
  groundHeight(x, z, feetY = Infinity) {
    if (this.areaId !== 'overworld') return this.areas[this.areaId].floorY;
    let h = this.terrain.heightAt(x, z);
    // Superfícies com andar (plataformas, pontes de corda, degraus): só contam
    // se o pé alcança (feetY); sem feetY = a mais alta (chuva, NPCs).
    const s = this.surfaces.heightAt(x, z, feetY);
    if (s > h) h = s;
    const deck = this.bridges?.deckHeightAt(x, z);
    if (deck !== null && deck !== undefined && deck > h) h = deck;
    for (const p of this.pierDecks ?? []) {
      const abx = p.bx - p.ax, abz = p.bz - p.az;
      const t = ((x - p.ax) * abx + (z - p.az) * abz) / (abx * abx + abz * abz);
      if (t < 0 || t > 1) continue;
      if (Math.hypot(p.ax + abx * t - x, p.az + abz * t - z) < p.width / 2 && p.y > h) h = p.y;
    }
    return h;
  }

  /** Teleporta para uma área subterrânea, ou de volta à superfície ('overworld'). */
  enterArea(id) {
    if (id === this.areaId) return;
    if (id === 'overworld') {
      const from = this.areas[this.areaId];
      this.areaId = 'overworld';
      this.player.teleport(from.returnTo.x, from.returnTo.z, from.returnTo.facing);
      this.ui.toast('De volta à superfície.');
    } else {
      const area = this.areas[id];
      this.areaId = id;
      this.player.teleport(area.spawn.x, area.spawn.z, area.spawn.facing, area.floorY);
      this.ui.toast(area.name);
      area.onEnter?.(this);
    }
    const over = this.areaId === 'overworld';
    for (const o of [this.terrain.mesh, this.water.mesh, this.vegetation.group, this.grass.mesh, this.bridges.group, this.clouds.mesh]) o.visible = over;
    this.cameraRig.yaw = this.player.root.rotation.y;
    this.cameraRig.snap();
  }

  /** Viagem pelo mapa-múndi (M). */
  travelTo(x, z) {
    if (this.areaId !== 'overworld') {
      this.ui.toast('Saia do subsolo antes de viajar.');
      return;
    }
    const half = { x: WORLD.width / 2 - 20, z: WORLD.depth / 2 - 20 };
    x = THREE.MathUtils.clamp(x, -half.x, half.x);
    z = THREE.MathUtils.clamp(z, -half.z, half.z);
    this.player.teleport(x, z, this.player.root.rotation.y);
    this.cameraRig.snap();
  }

  /**
   * Troca o nível gráfico na hora e salva a escolha.
   * @param {string} id um dos ids de GRAPHICS_PRESETS (ex.: 'medio')
   * @example game.setGraphics('baixo')
   */
  setGraphics(id) {
    this.graphics = presetById(id);
    this.graphicsStore.save(this.graphics.id);
    const { needsReload } = applyGraphics(this, this.graphics);
    this.fpsMeter.reset();
    this.ui.refreshGraphics(this.graphics, needsReload);
    this.ui.toast(`Gráficos: ${this.graphics.name}${needsReload ? ' · a suavização de bordas muda ao recarregar a página' : ''}`);
  }

  /**
   * Debuffs do clima no personagem (config/weather.js → DEBUFFS):
   * velocidade/pulo via PlayerState, dano por segundo (nunca abaixo de
   * DEBUFF_RULES.minHealth) e exposição paranormal. Perto de uma fogueira o
   * frio some ("Aquecido").
   */
  applyWeatherDebuffs(dt) {
    const pos = this.player.position, r2 = DEBUFF_RULES.fireRadius ** 2;
    const nearFire = this.fireLights.sources.some((f) => f.warm && (f.x - pos.x) ** 2 + (f.z - pos.z) ** 2 < r2);
    const d = this.dead || this.player.flying ? null : computeDebuffs(this.weather.climates, DEBUFFS, DEBUFF_RULES, { nearFire });
    this.debuffs = d;
    this.state.setEnvironmentModifiers(d ? { speed: d.speed, jump: d.jump } : null);
    if (!d) return;
    this._weatherDamage += d.dps * dt;
    if (this._weatherDamage >= 1) {
      const n = Math.floor(this._weatherDamage);
      this._weatherDamage -= n;
      if (this.state.health > DEBUFF_RULES.minHealth) this.state.damage(n, DEBUFF_RULES.minHealth);
    }
    if (d.exposure > 0) {
      this._weatherExposure = (this._weatherExposure ?? 0) + d.exposure * dt;
      if (this._weatherExposure >= 1) { this.state.addParanormalExposure(1); this._weatherExposure -= 1; }
    }
  }

  /**
   * 0..1: quanto o ponto está dentro de uma vila (1 dentro, cai a 0 em
   * `VILLAGE_SHELTER.fade` metros fora da borda). O clima fica mais fraco.
   */
  villageShelter(pos) {
    let best = 0;
    for (const v of Object.values(this.villages)) {
      if (v.config.abandoned) continue; // ruínas não abrigam ninguém
      const out = Math.hypot(pos.x - v.x, pos.z - v.z) - v.radius;
      best = Math.max(best, THREE.MathUtils.clamp(1 - out / VILLAGE_SHELTER.fade, 0, 1));
    }
    return best;
  }

  /** Metros mostrados no minimapa (mais longe ao voar/viajar rápido). */
  minimapViewMeters() {
    const v = MINIMAP.viewMeters;
    return this.player.flying ? v.fly : this.player.fastTravel ? v.fast : v.walk;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.postfx?.setSize();
  }

  start() {
    this.renderer.setAnimationLoop(() => this.update());
  }

  update() {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    if (!this.ready) return;
    if (this.fpsMeter.tick(rawDt) && this.graphics.id !== GRAPHICS_PRESETS[0].id && !this._fpsHinted) {
      this._fpsHinted = true;
      this.ui.toast(`O jogo está lento (${Math.round(this.fpsMeter.fps)} FPS). Aperte <b>G</b> para baixar os gráficos.`);
    }
    this.ui.setFps(this.fpsMeter.fps);
    this.time += dt;
    this.timeUniform.value = this.time;
    const input = this.input;
    const ui = this.ui;
    if (input.pressed('KeyG') && !ui.dialogue.isOpen) ui.toggleGraphics();
    if (ui.graphicsOpen) {
      // Com o menu aberto: 1–5 escolhem, ←/→ descem/sobem um degrau, Esc fecha.
      GRAPHICS_PRESETS.forEach((p, i) => { if (input.pressed(`Digit${i + 1}`) || input.pressed(`Numpad${i + 1}`)) this.setGraphics(p.id); });
      if (input.pressed('ArrowLeft')) this.setGraphics(stepPreset(this.graphics.id, -1).id);
      if (input.pressed('ArrowRight')) this.setGraphics(stepPreset(this.graphics.id, 1).id);
      if (input.pressed('Escape')) ui.toggleGraphics(false);
    }
    const busy = this.dead || ui.dialogue.isOpen || ui.graphicsOpen || !ui.worldMap.classList.contains('hidden');
    if (this.dead && this.time >= this.respawnAt) this.respawn();

    if (input.pressed('KeyM')) ui.toggleWorldMap();
    if (input.pressed('KeyV') && this.areaId === 'overworld') ui.toast(this.player.flying ? 'Modo voo desligado.' : 'Modo voo: Espaço sobe · Ctrl desce · Shift acelera · roda afasta a câmera · V sai');
    if (input.pressed('Escape') && !ui.worldMap.classList.contains('hidden')) ui.toggleWorldMap(false);
    if (!busy) {
      if (input.pressed('KeyC')) this.cameraRig.toggleMode();
      if (input.pressed('KeyE')) this.interactions.interact(this);
      if (input.pressed('KeyH')) this.state.usePotion();
      // 1–8 escolhem o slot. No quadro em que um diálogo fecha, o número
      // foi a resposta do diálogo, não troca de slot.
      if (!this._wasBusy) {
        for (let i = 0; i < this.inventory.slots.length; i++) if (input.pressed(`Digit${i + 1}`) || input.pressed(`Numpad${i + 1}`)) this.inventory.selecionar(i);
      }
      if (input.attackPressed()) this.tryAttack();
    }
    this._wasBusy = busy;
    ui.hotbarWrap.classList.toggle('dim', busy);

    if (busy) this.player.model.update(dt, 0);
    else {
      this.player.update(dt, input, this.cameraRig);
      // Em 1ª pessoa o corpo acompanha para onde se olha (o soco sai daí).
      if (this.cameraRig.isFirstPerson) this.player.faceDirection(this.cameraRig.forward(this._camFwd));
    }
    this.cameraRig.update(dt, this.player.position, busy ? null : input, {
      flying: this.player.flying,
      underground: this.areaId !== 'overworld',
      sprinting: !busy && this.player.sprinting,
      speed: busy ? 0 : this.player.speed,
      grounded: this.player.grounded,
    });
    this.state.update(dt);

    // Fôlego: só aparece na água; zerou → afogou.
    if (!this.dead && this.oxygen.update(dt, { inWater: this.player.swimming, submerged: this.player.submerged })) {
      this.killPlayer('Você se afogou');
    }
    ui.setOxygen(this.oxygen.fraction, this.player.swimming || this.oxygen.fraction < 0.999, GAMEPLAY.swimming.warnFraction);
    ui.setUnderwater(this.areaId === 'overworld' && this.camera.position.y < WORLD.waterLevel - 0.05);

    const item = this.interactions.update(this.player.position, this.player.facing, this.areaId);
    ui.setPrompt(item);

    const pos = this.player.position;
    this.gameClock.update(dt);
    this.environment.setHour(this.gameClock.hour);
    const hourIndex = this.gameClock.hourIndex;
    if (this.areaId === 'overworld') {
      const w = this.terrain.weightsAt(pos.x, pos.z, this._w);
      this.environment.update(dt, pos, this.camera, w, false);
      this.weather.update(dt, { time: this.time, camera: this.camera, player: pos, weights: w, underground: false, shelter: this.villageShelter(pos), hourIndex });
      this.clouds.update(dt, this.environment, this.weather.overcast);
      let best = 0;
      for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
      ui.setBiome(best);
      this.vegetation.update(this.camera.position, true);
      this.grass.update(pos, !this.player.fastTravel && pos.y - this.terrain.heightAt(pos.x, pos.z) < 40);
      this.water.update(this.time, this.environment);
      let near = null;
      for (const v of Object.values(this.villages)) {
        v.update(dt, pos);
        if (Math.hypot(pos.x - v.x, pos.z - v.z) < v.radius + 25) near = v;
        if (!v.config.abandoned && Math.hypot(pos.x - v.x, pos.z - v.z) < v.radius) this.lastVillage = v;
      }
      const key = near ? `${near.config.id}-${near.gate?.open ?? ''}-${this.state.trust.bussola}` : null;
      if (key !== this._villageKey) {
        this._villageKey = key;
        const extra = near?.gate ? `<div class="gate ${near.gate.open ? 'open' : ''}">Portão: ${near.gate.open ? 'aberto' : 'fechado'} · confiança do prefeito ${this.state.trust.bussola}/100</div>` : '';
        ui.setVillage(null);
        if (near) ui.setVillage(near.config, extra);
      }
      // Aviso ao chegar perto de um marco do mapa.
      const lm = this.landmarks.nearest(pos.x, pos.z);
      const lmId = lm?.config.id ?? null;
      if (lmId !== this._landmarkId) {
        this._landmarkId = lmId;
        if (lm) ui.toast(`${lm.config.name} — ${lm.config.description}`);
      }
    } else {
      this.environment.update(dt, pos, this.camera, this._w, true);
      this.weather.update(dt, { time: this.time, camera: this.camera, player: pos, weights: this._w, underground: true, hourIndex });
      if (this._villageKey !== 'under') { this._villageKey = 'under'; ui.setVillage(null); }
    }
    this.applyWeatherDebuffs(dt);
    ui.setWeather(this.gameClock.label(), this.weather.status, this.weather.overlays, this.weather.flash, this.debuffs);
    this.dungeons.update(dt, this.time, this.areaId);
    this.fireLights.update(this.time, this.areaId === 'overworld' ? pos : Game.NOWHERE);
    if (this.areaId === 'overworld') {
      this.physics.update(dt, pos); // transmite + simula (passo fixo 1/60)
      this.propMeshes.sync(this.physics.props); // corpo → InstancedMesh
    }
    for (const d of this.dummies) d.update(dt);
    this.fauna.update(dt, this.player.position, { active: this.areaId === 'overworld', playerAlive: !this.dead });
    if (this.cameraRig.isFirstPerson) this.fpArm.update(dt, busy ? 0 : this.player.speed, this.player.sprinting);
    ui.update(dt);

    this.postfx.render(this.scene, this.camera, this.weather.bloomStrength);
    if (this.areaId === 'overworld') this.minimap.render(this.player.position, ui.minimapRect(), { viewMeters: this.minimapViewMeters() });
    input.endFrame();
  }
}
