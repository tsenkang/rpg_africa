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
import { ANIMAL_MODELS, ANIMAL_LOADER } from '../config/animalModels.js';
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
import { Ladders } from '../world/Ladders.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { applyWorldPhysics } from '../physics/WorldColliders.js';
import { PropMeshes } from '../physics/PropMeshes.js';
import { InteriorManager } from '../render/Interiors.js';
import { BIOME_STYLE } from '../config/interiors.js';
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
import { Survival } from '../systems/Survival.js';
import { WoundVisuals } from '../render/WoundVisuals.js';
import { SurvivalHUD } from '../ui/SurvivalHUD.js';
import { DIRT, HAZARDS, INSPECTION, LIMBS } from '../config/survival.js';
import { STARTER_KIT, SHOP_MATERIALS as SHOP_MATERIALS_LIST } from '../config/items.js';
import { SHOP_FOOD as SHOP_FOOD_LIST, WOUNDS as WOUNDS_TABLE } from '../config/survival.js';
const WOUNDS_BLEED = Object.fromEntries(Object.entries(WOUNDS_TABLE).map(([k, w]) => [k, w.bleed ?? 0]));
import { SPECIES } from '../config/fauna.js';
import { ITEMS } from '../systems/PlayerState.js';
import { Notebook } from '../systems/Notebook.js';
import { Crafting } from '../systems/Crafting.js';
import { BackpackUI } from '../ui/BackpackUI.js';
import { NotebookUI } from '../ui/NotebookUI.js';
import { BodyInspection } from '../ui/BodyInspection.js';
import { RecipeBookUI } from '../ui/RecipeBookUI.js';
import { NPCManager } from '../systems/npc/NPCManager.js';
import { PROFESSIONS } from '../config/npcLife.js';
import { DialogueEngine } from '../systems/npc/DialogueEngine.js';
import { DIALOGUE_MENU, PERCEPTION } from '../config/dialogues.js';
import { SpeechBubbles } from '../ui/SpeechBubbles.js';
import { SHOP_SMITH } from '../config/items.js';
import { Mechanics } from '../systems/Mechanics.js';
import { Projectiles, classifyZone, zoneDamage } from '../systems/Projectiles.js';
import { Resources } from '../systems/Resources.js';
import { Skinning, lootFor } from '../systems/Skinning.js';
import { Trails } from '../render/Trails.js';
import { ResourceMeshes } from '../render/ResourceMeshes.js';
import { ProjectileMeshes } from '../render/ProjectileMeshes.js';
import { WEAPONS, ZONE_EFFECTS, BLEED, SKINNING, COOKING, WATER, PROJECTILE } from '../config/hunting.js';
import { RESOURCES } from '../config/resources.js';
import { PROP_TYPES } from '../config/physics.js';
import { CHARACTER_PROFILE, SANITY_TRIGGERS, CURSED_AREAS, PHANTOMS, PHANTOM_SOUNDS, SANITY_BAR } from '../config/character.js';
import { Hallucinations } from '../render/Hallucinations.js';
import { Skeletons } from '../render/Skeletons.js';
import { PhantomSounds } from '../audio/PhantomSounds.js';
import { LAW } from '../config/law.js';
import { CrimeLog, humanZone, rollLoot, TrespassTracker } from '../systems/law/Crimes.js';
import { findWitnesses, WitnessSystem } from '../systems/law/Witness.js';
import { WitnessMarkers } from '../ui/WitnessMarkers.js';
import { BountyManager } from '../systems/law/Bounty.js';
import { canSee } from '../systems/law/Witness.js';
import { WantedHUD } from '../ui/WantedHUD.js';
import { GuardAIController } from '../systems/law/GuardAI.js';
import { Whistle } from '../audio/Whistle.js';
import { SkidSound } from '../audio/SkidSound.js';
import { SlopeHint } from '../ui/SlopeHint.js';
import { HunterDirector, ambushPoint } from '../systems/law/Hunters.js';
import { payQuote } from '../systems/law/Redemption.js';
import { grudgeReaction } from '../systems/law/Grudge.js';
import { BountyHunter } from '../entities/BountyHunter.js';

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
    /** Escadas de mão subíveis (torres, cordas, terraços). */
    this.ladders = new Ladders();
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
    // Preloader: animais carregam junto com as texturas (cache cheio antes do jogo).
    this.animalModels = new AnimalModels(ANIMAL_MODELS, { dracoPath: ANIMAL_LOADER.dracoPath });
    const animalsReady = this.animalModels.loadAll((done, total) => ui.setLoading(0.03, `Carregando animais 3D… ${done}/${total}`));
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

    this.water = new Water({ renderer: this.renderer, terrain: this.terrain });
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
      collisions: this.collisions, // troncos e rochas: colisão sólida
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
    // Pegadas inteiras das casas só serviam para dispor a vila e a vegetação:
    // agora quem bloqueia são as paredes com o vão da porta (dá para entrar).
    for (const c of this.collisions.all) if (c.footprint) c.enabled = false;

    // Interiores: cada casa registra sua planta; a mobília nasce perto do jogador.
    this.interiors = new InteriorManager({ scene: this.scene, M: this.materials, collisions: this.collisions, fireLights: this.fireLights });
    for (const v of Object.values(this.villages)) {
      for (const desc of v.interiors) {
        const biome = v.config.biome ?? BIOMES[this.terrain.dominantBiome(desc.x, desc.z)]?.id;
        this.interiors.add(desc, BIOME_STYLE[biome] ?? 'common');
      }
    }

    // FÍSICA UNIVERSAL: varre a cena e dá colisor a toda peça sólida que ainda
    // não tem (WorldColliders). Fora da varredura, cada um com física própria:
    // terreno (heightfield), água, capim, nuvens, vegetação (TREE_COLLIDERS)
    // e o que se mexe (NPCs, animais, portões, chamas — grupos `dynamic`).
    for (const o of [this.terrain.mesh, this.water.mesh, this.grass.mesh, this.clouds.mesh, this.vegetation.group, this.environment.sky, this.weather.group, this.weather.lantern]) {
      if (o) o.userData.noCollide = true;
    }
    for (const v of Object.values(this.villages)) v.dynamic.userData.noCollide = true;
    for (const a of Object.values(this.areas)) a.group.userData.floorY = a.floorY; // subterrâneos: chão fixo
    const auto = applyWorldPhysics(this.scene, {
      collisions: this.collisions,
      groundAt: (x, z) => this.terrain.heightAt(x, z),
      surfaceAt: (x, z, feetY) => this.surfaces.heightAt(x, z, feetY),
      ladders: this.ladders,
    });
    console.info(`[física] ${auto.added} colisores automáticos de ${auto.pieces} peças`, auto.skipped);

    // Física (cannon-es): objetos dinâmicos das vilas + estáticos transmitidos em volta do jogador.
    // O terreno físico ignora plataformas altas (feetY = −∞): só chão, pontes e píeres.
    this.physics = new PhysicsWorld({ groundAt: (x, z) => this.groundHeight(x, z, -Infinity), collisions: this.collisions, surfaces: this.surfaces });
    for (const v of Object.values(this.villages)) {
      for (const p of v.props) {
        const base = p.y ?? this.groundHeight(p.x, p.z, -Infinity) + (p.lift ?? 0);
        this.physics.addProp(p.type, { x: p.x, z: p.z, y: base, rot: p.rot ?? 0, scale: p.scale ?? 1 });
      }
    }
    // Estoque de peças de carcaça (esfolamento): nascem longe do mapa e vêm quando um animal é esfolado.
    this.lootPool = {};
    for (const type of ['carne', 'pele', 'osso', 'tripas', 'pena']) {
      this.lootPool[type] = [];
      for (let k = 0; k < SKINNING.poolPerType; k++) this.lootPool[type].push(this.physics.addProp(type, { ...PhysicsWorld.POOL }));
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
      // Repassa a altura do pé: sem ela valia a superfície MAIS ALTA (laje do 2º
      // andar, degrau do topo, plataforma acima) e o jogador "teleportava" para lá.
      groundAt: (x, z, feetY) => this.groundHeight(x, z, feetY),
      collisions: this.collisions,
      state: this.state,
      isUnderground: () => this.areaId !== 'overworld',
      ladders: this.ladders,
      terrainAt: (x, z) => this.terrain.heightAt(x, z),
    });
    this.scene.add(this.player.root);
    // Limite de inclinação: som de derrapagem e aviso de encosta íngreme.
    this.skid = new SkidSound();
    this.player.onSkid = (angle) => this.skid.play((angle - 45) / 35);

    // Sobrevivência avançada: corpo (ferimentos por membro), macros, stamina,
    // sanidade, sujeira. Ferimentos aparecem na malha do personagem.
    this.survival = new Survival({ state: this.state, rng: this.random });
    this.player.stamina = this.survival;
    this.woundVisuals = new WoundVisuals(this.player.model, this.survival.body);
    this.survivalHUD = new SurvivalHUD(ui.root);
    this.survival.on('alert', (a) => this.survivalHUD.alert(a));
    this.survival.on('whisper', (t) => this.survivalHUD.whisper(t));
    this.survival.on('message', (t) => ui.toast(t));
    this.survival.on('faint', () => ui.toast('Fraqueza: você desmaiou. Coma e beba algo.'));
    // Caderneta, mochila (I) com mesa de crafting livre e inspeção corporal 3D (C).
    this.notebook = new Notebook();
    this.notebook.on('entry', ({ section, id }) => ui.toast(`Caderneta: ${notebookLabel(section, id)}`));
    this.crafting = new Crafting();
    this.state.on('item-added', ({ id }) => { if (ITEMS[id]?.plant) this.notebook.record('plantas', id); });
    for (const [id, n] of Object.entries(STARTER_KIT)) this.state.addItem(id, n);
    this.backpack = new BackpackUI(this);
    this.notebookUI = new NotebookUI(this);
    this.recipeBook = new RecipeBookUI(this); // estilo JEI: J
    this.setupHunting();
    this.setupSanity();
    this.setupLivingWorld();
    const ren = this.villages.renascimento;
    this.player.teleport(ren.x + 3, ren.z + 17, Math.PI); // borda sul da praça, olhando para o poço e a igreja
    this.cameraRig = new CameraRig(this.camera, { groundAt: (x, z, feetY) => this.groundHeight(x, z, feetY) });
    this.cameraRig.reach = (focus, cam) => (this.areaId === 'overworld'
      ? this.interiors.cameraReach(focus, cam, this.player.position, CAMERA.third.interior.margin)
      : 1);
    this.cameraRig.yaw = Math.PI;
    this.setupCamera();
    this.inspection = new BodyInspection(this); // precisa da câmera, do braço de 1ª pessoa e da mochila
    this.setupCombat();
    // Animais: cache já cheio (preloader acima); espécie sem modelo usa o corpo procedural.
    await animalsReady;
    this.fauna = new Fauna(this, { rng: this.random, models: this.animalModels });
    this.fauna.warmup(this.renderer, this.camera); // compila os shaders de todas as espécies agora

    applyGraphics(this, this.graphics);
    this.ready = true;
    ui.setLoading(1, 'Pronto! Pressione ALT para travar a câmera no mouse.');
    ui.hideLoading();
    ui.toast('Bem-vindo à Vila Renascimento. ALT trava/destrava a câmera · T alterna 1ª/3ª pessoa · C examina o corpo.');
  }

  /**
   * Coloca um item na hotbar (primeiro slot vazio).
   * Teste no console: `game.adicionarItem({ id: 'faca', nome: 'Faca', icone: 'knife' })`.
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
    this.applyCameraMode = applyMode;
    this.cameraRig.onModeChange((mode) => {
      if (mode === 'first') this.player.faceDirection(this.cameraRig.forward(this._camFwd));
      applyMode();
      this.ui.toast(mode === 'first' ? 'Câmera em 1ª pessoa (T volta)' : 'Câmera em 3ª pessoa (T volta)');
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
    this.survival.addDirt(DIRT.perPunch);
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
      const agent = hit.target?.object?.userData?.agent;
      const extra = agent ? ' · desmaiou' : dummy ? ` · ${dummy.health}/${dummy.maxHealth}`
        : animal ? (animal.alive ? ` · ${Math.max(0, animal.health)}/${animal.spec.health}` : ' · abatido') : '';
      this.ui.showHit(`Acertou: ${hit.name}${extra}`, true);
    } else {
      this.ui.showHit('Soco no ar', false);
    }
  }

  /** Usa o item do slot ativo (`ITEM_USES`); se ele for gasto, sai da hotbar. Armas de caça arremessam/atiram. */
  useEquipped(item) {
    if (WEAPONS[item.id]) { this.throwWeapon(item); return; }
    if (ITEMS[item.id]?.comfort) { this.useComfortItem(item.id); return; }
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
  damagePlayer(amount, source, speciesId = null, attacker = null) {
    if (this.dead) return;
    this.state.damage(amount);
    if (speciesId) this.survival.onAnimalHit(speciesId); // garra/presa/picada → ferimento num membro
    this.onPlayerHurt(amount, source, attacker);
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
    this.survival.respawn();
    this.hallucinations?.clear();
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
    this._nearFire = nearFire;
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
   * Sobrevivência no loop: monta o ambiente do quadro (movimento, água,
   * clima na pele, fogo, vila, mata fechada), avança corpo/nutrição/sanidade,
   * mata se a vida zerou e sincroniza HUD e malhas dos ferimentos.
   */
  updateSurvival(dt) {
    const p = this.player, over = this.areaId === 'overworld';
    const fx = this.weather.overlays;
    const r = this.survival.update(dt, {
      paused: this.dead || p.flying,
      moving: p.speed > 0,
      sprinting: p.sprinting,
      swimming: p.swimming,
      freshWater: true, // rios e o lago central são de água doce
      rain: over ? fx.rain : 0,
      sand: over ? fx.sand : 0,
      ash: over ? fx.ash : 0,
      nearFire: !!this._nearFire,
      inVillage: over && this.villageShelter(p.position) >= 1,
      jungle: over && HAZARDS.jungleBiomes.includes(BIOMES[this._biome]?.id),
    });
    if (r.died && !this.dead) this.killPlayer(r.died);
    this.ui.sickOverlay.classList.toggle('on', r.fever > 0 || this.state.effects.some((e) => e.def.kind === 'disease'));
    this.survivalHUD.update(this.survival);
    this.woundVisuals.update(dt, this.time);
  }

  /** Nome legível de um bioma pelo id (livro de receitas). */
  biomeName(id) {
    return BIOMES.find((b) => b.id === id)?.name ?? id;
  }

  /** Tira um item equipável da mochila e põe na hotbar (se houver vaga). */
  equipFromBackpack(id) {
    const d = ITEMS[id];
    if (!d?.hotbar || !this.state.hasItem(id)) return false;
    const slot = this.inventory.adicionarItem({ id, nome: d.name, icone: d.icon, tipo: d.kind });
    if (slot < 0) { this.ui.toast('Hotbar cheia: o item fica na mochila.'); return false; }
    this.state.removeItem(id);
    this.ui.toast(`${d.name} na hotbar (slot ${slot + 1}).`);
    return true;
  }

  /**
   * Mesa livre (crafting por descoberta): tenta a combinação. Receita certa
   * consome, entrega (armas vão para a hotbar) e anota na caderneta.
   * @param {string[]} ids itens na mesa
   * @returns {{ ok: boolean, message: string }}
   */
  craftFromTable(ids) {
    const recipe = this.crafting.match(ids);
    if (!recipe) {
      const known = this.crafting.partial(ids).filter((r) => this.notebook.has('receitas', r.id));
      return {
        ok: false,
        message: known.length
          ? `Falta algo — parece o começo de: ${known.map((r) => ITEMS[Object.keys(r.out)[0]].name).join(', ')}.`
          : ids.length ? 'Nada aconteceu. Essa combinação não dá em nada.' : 'Ponha até 4 itens na mesa.',
      };
    }
    const r = this.crafting.apply(recipe, this.state);
    if (!r.ok) return r;
    const made = Object.entries(recipe.out).map(([id, n]) => `${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}`).join(', ');
    const isNew = this.notebook.record('receitas', recipe.id);
    for (const id of Object.keys(recipe.out)) if (ITEMS[id].hotbar) this.equipFromBackpack(id);
    return { ok: true, message: `Criado: ${made}${isNew ? ' · receita anotada na caderneta' : ''}` };
  }

  // ------------------------------------------------------------ mundo vivo (NPCs com rotina)

  /** Moradores com rotina de 24 h (NPCManager) e a conversa com E. */
  setupLivingWorld() {
    this.npcManager = new NPCManager(this);
    this.bubbles = new SpeechBubbles(this.ui.root);
    this.npcManager.bubbles = this.bubbles;
    this._prevPos = { x: this.player.position.x, z: this.player.position.z };
    const talk = this.interactions.register({ id: 'npc-talk', label: 'Falar', radius: 2.6, position: () => talk.pos ?? Game.NOWHERE, onInteract: (g) => g.talkToAgent(g._talkAgent) });
    talk.enabled = false;
    this.npcTalk = talk;
    this.setupLaw();
    const s = this.npcManager.stats();
    console.info(`[mundo vivo] ${s.total} moradores em ${s.villages} vilas`);
  }

  // ------------------------------------------------------------ lei (Etapa C)

  /**
   * Crimes (C1): moradores viram alvo do soco (nocaute = agressão) e dos
   * projéteis (cabeça/corpo = assassinato, pernas = derruba), invasão de casa
   * alheia e roubo ao vasculhar. Tudo vai para `this.crimes` (CrimeLog), sem
   * testemunha ainda — a Etapa C2 decide quem viu.
   */
  setupLaw() {
    this.crimes = new CrimeLog(LAW.crimes);
    this.crimes.onCrime = (c) => console.info(`[lei] ${c.label} em ${c.villageId} (+${c.bounty} se testemunhado)`);
    this.trespass = new TrespassTracker(LAW.trespass.graceSeconds);
    this.witnesses = new WitnessSystem(LAW.witness);
    this.witnessMarks = new WitnessMarkers(this.ui.root);
    this.bounty = new BountyManager(LAW.bounty, { villageAt: (p) => this.villageRegionAt(p)?.config.id ?? null });
    this.wantedHUD = new WantedHUD(this.ui.root, this.ui.vitals);
    this.guardAI = new GuardAIController(LAW.guards);
    this.whistle = new Whistle();
    this._guards = [];
    this.hunterDir = new HunterDirector(LAW.hunters);
    /** @type {BountyHunter[]} */
    this.hunters = [];
    this._hunterGroup = 0;
    this._grudgeT = 0;
    /** Casa alheia onde o jogador está agora: { home, vs, residents } ou null. */
    this._alienHome = null;
    this.npcManager.onModelBuilt = (a) => this.combat.register({
      name: a.name,
      object: a.model.root,
      enabled: () => this.areaId === 'overworld' && a.rendered && a.life !== 'DEAD',
      onHit: () => this.assaultAgent(a),
    });
    const loot = this.interactions.register({
      id: 'house-loot', label: 'Vasculhar a casa (roubo)', radius: 6,
      position: () => loot.pos ?? Game.NOWHERE,
      onInteract: (g) => g.lootHouse(),
    });
    loot.enabled = false;
    this.houseLoot = loot;
  }

  /** Registra um crime na vila do morador/lugar e procura quem viu (C2). */
  reportCrime(type, village, at, victim = null, details = {}) {
    const crime = this.crimes.report({ type, villageId: village.config.id, x: at.x, z: at.z, time: this.time, victimId: victim?.id ?? null, details });
    this.lookForWitnesses(crime, village);
    return crime;
  }

  /** Moradores da vila que viram o crime: guarda denuncia na hora; civil corre gritando até a guarda. */
  lookForWitnesses(crime, village) {
    const vs = this.npcManager.villages.find((v) => v.village === village);
    if (!vs?.active) return;
    const W = LAW.witness;
    // Crime dentro de casa: só vê quem está dentro da mesma casa.
    const home = crime.homeId ? vs.homes.find((h) => h.id === crime.homeId) : null;
    const filter = home ? (a) => Math.hypot(a.pos.x - home.x, a.pos.z - home.z) <= home.half + 0.3 : undefined;
    const seen = findWitnesses(vs.agents, crime, W, filter);
    const { reportedNow, runners } = this.witnesses.addCrime(crime, seen);
    for (const a of runners) {
      const lines = W.shouts[crime.type] ?? W.shouts.agressao;
      this.bubbles.say(a, lines[Math.floor(this.random() * lines.length)], 3, 'medo');
    }
    if (reportedNow) {
      const g = seen.find((a) => a.person.profession === 'guarda');
      g.react('FACE', 4, this.player.position, 'point');
      this.bubbles.say(g, 'Parado aí! Eu vi isso!', 3, 'alerta');
      this.onCrimeWitnessed(crime, g, true);
      this.applyGuardEvents(this.guardAI.alert(g, this.guardContext(), this.activeGuards()));
    }
  }

  /** Guarda mais perto da testemunha (vivo; se estiver em casa, vai até a porta dele). */
  guardFor(a) {
    const vs = this.npcManager.villages.find((v) => v.village === a.village);
    let best = null, bd = Infinity;
    for (const g of vs?.agents ?? []) {
      if (g.person.profession !== 'guarda' || g.down) continue;
      const p = g.indoors ? g.home.door : g.pos;
      const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /**
   * Um crime chegou à guarda (por um guarda que viu ou por uma testemunha que correu até ele).
   * Gancho da Etapa C3 (BountyManager): hoje só avisa o jogador.
   */
  onCrimeWitnessed(crime, by, direct) {
    const vname = this.villages[crime.villageId]?.config.name ?? crime.villageId;
    if (!this.bounty.recordWitnessed(crime, this.player.position)) return; // outra testemunha já denunciou
    this.ui.toast(direct ? `Um guarda de ${vname} viu: ${crime.label}.` : `${by.name} denunciou você à guarda de ${vname}: ${crime.label}.`);
  }

  /** Vila (habitada) cuja região contém o ponto: raio da vila + `LAW.bounty.regionMargin`. */
  villageRegionAt(p) {
    let best = null, bd = Infinity;
    for (const v of Object.values(this.villages)) {
      if (v.config.abandoned) continue;
      const d = Math.hypot(p.x - v.x, p.z - v.z) - v.radius;
      if (d < LAW.bounty.regionMargin && d < bd) { bd = d; best = v; }
    }
    return best;
  }

  /** Vilas cujos guardas (acordados, fora de casa) estão vendo o jogador agora. */
  villagesSeeingPlayer() {
    const p = this.player.position, out = this._seenBy ?? (this._seenBy = new Set());
    out.clear();
    if (this.areaId !== 'overworld' || this.dead) return out;
    for (const vs of this.npcManager.villages) {
      if (!vs.active || !this.bounty.bountyOf(vs.village.config.id)) continue;
      for (const g of vs.agents) {
        if (g.person.profession !== 'guarda' || g.commander || g.down || g.indoors) continue;
        if (canSee({ x: g.pos.x, z: g.pos.z, yaw: g.yaw }, p, LAW.bounty.guardSight)) { out.add(vs.village.config.id); break; }
      }
    }
    return out;
  }

  /** Procurado: zona de busca, contador de fuga, selo na HUD. */
  updateBounty(dt) {
    const seen = this.villagesSeeingPlayer();
    const ended = this.bounty.update(dt, { playerPos: this.player.position, seen: (v) => seen.has(v) });
    for (const v of ended) this.ui.toast(`Você despistou a guarda de ${this.villages[v]?.config.name ?? v}. A recompensa continua.`);
    // Selo: vila da região atual; se não houver, a vila com busca ativa.
    const here = this.bounty.wantedHere(this.player.position);
    const id = here ?? this.bounty.searches.keys().next().value ?? null;
    const s = id ? this.bounty.searchOf(id) : null;
    this.wantedHUD.update(id ? { village: this.villages[id]?.config.name ?? id, bounty: this.bounty.bountyOf(id), search: s && { escape: s.escape, seen: seen.has(id) } } : null);
  }

  /** Guardas das vilas simuladas (lista reaproveitada). */
  activeGuards() {
    const out = this._guards;
    out.length = 0;
    for (const vs of this.npcManager.villages) if (vs.active) for (const a of vs.agents) if (a.person.profession === 'guarda' && !a.commander) out.push(a);
    return out;
  }

  /** O que a IA dos guardas precisa saber do mundo. */
  guardContext() {
    return {
      player: this.player.position,
      playerDead: this.dead || this.areaId !== 'overworld',
      wanted: (v) => this.bounty.bountyOf(v) > 0,
      searchOf: (v) => this.bounty.searchOf(v),
      rng: this.random,
    };
  }

  /** IA de lei dos guardas (C4): reconhecer, perseguir, flanquear, atacar, apitar, investigar. */
  updateGuards(dt) {
    this.applyGuardEvents(this.guardAI.update(dt, this.activeGuards(), this.guardContext()));
  }

  /** Aplica no jogo os eventos da IA dos guardas (falas, apito, dano). */
  applyGuardEvents(events) {
    const L = LAW.guards.lines, pick = (l) => l[Math.floor(this.random() * l.length)], p = this.player.position;
    for (const e of events) {
      const g = e.guard, dist = Math.hypot(g.pos.x - p.x, g.pos.z - p.z);
      if (e.type === 'suspect') this.bubbles.say(g, pick(L.suspect), 2.6, 'alerta');
      else if (e.type === 'lost') this.bubbles.say(g, pick(L.lost), 2.6, 'alerta');
      else if (e.type === 'whistle') {
        this.whistle.blow(dist);
        this.bubbles.say(g, pick(L.spotted), 2.6, 'alerta');
        this.bounty.startSearch(g.village.config.id, p);
      } else if (e.type === 'attack') {
        this.damagePlayer(e.damage, 'Guarda', null, g);
        this.cameraRig.kick(0.06);
      }
    }
  }

  // ------------------------------------------------------------ lei (Etapa C5)

  /** Comandante da Guarda: mostra a ficha da vila e aceita o pagamento da recompensa. */
  commanderDialog(a) {
    const v = a.village.config.id, vname = a.village.config.name;
    const bounty = this.bounty.bountyOf(v);
    const chasing = this.activeGuards().some((g) => g.village === a.village && this.guardAI.stateOf(g).mode === 'CHASE');
    const q = payQuote(bounty, { chasing, coins: this.state.coins });
    const crimes = this.crimes.byVillage(v).filter((c) => c.witnessed && !c.paid);
    const counts = {};
    for (const c of crimes) counts[c.label] = (counts[c.label] ?? 0) + 1;
    const list = Object.entries(counts).map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ''}`).join(', ');
    const text = {
      limpa: `Sua ficha está limpa em ${vname}. Mantenha assim.`,
      combate: `Com meus guardas no seu encalço? Primeiro pare de fugir. Depois conversamos sobre as ${q.cost} moedas.`,
      moedas: `Você deve ${q.cost} moedas a ${vname} (${list}). Volte quando tiver o dinheiro.`,
      null: `Você deve ${q.cost} moedas a ${vname} (${list}). Pague e a guarda esquece o seu rosto.`,
    }[q.reason];
    const options = [];
    if (q.ok) options.push({ label: `Pagar a recompensa · ${q.cost} moedas`, onSelect: () => {
      if (!this.state.spend(q.cost)) return;
      for (const c of crimes) c.paid = true;
      this.bounty.clear(v);
      this.ui.dialogue.close();
      this.bubbles.say(a, 'Está feito. Ficha limpa — não me faça me arrepender.', 3.2);
      this.ui.toast(`Ficha limpa em ${vname}.`);
    } });
    options.push({ label: 'Até mais' });
    a.react('FACE', 8, this.player.position);
    this.ui.dialogue.open({ speaker: a.name, title: `<span class="dlg-mood">${LAW.redemption.title} · ${vname}</span>`, text: `"${text}"`, options });
  }

  /** Vítimas e parentes que reconhecem o jogador: fogem gritando ou correm chamar a guarda. */
  updateGrudges(dt) {
    const G = LAW.grudge;
    this._grudgeT -= dt;
    if (this._grudgeT > 0 || this.areaId !== 'overworld' || this.dead) return;
    this._grudgeT = G.checkEvery;
    const p = this.player.position, nm = this.npcManager, pick = (l) => l[Math.floor(this.random() * l.length)];
    for (const a of nm.rendering ?? []) {
      if (!a.rendered || a.down || a.indoors || a.person.profession === 'guarda' || a.reaction?.kind === 'FLEE' || a.reaction?.kind === 'RUN_TO') continue;
      if ((a._grudgeUntil ?? 0) > this.time) continue;
      if (!canSee({ x: a.pos.x, z: a.pos.z, yaw: a.yaw }, p, { radius: G.radius, fovDot: LAW.witness.fovDot, hearRadius: 3 })) continue;
      const r = grudgeReaction(nm.memoryOf(a), { wanted: this.bounty.bountyOf(a.village.config.id) > 0 }, this.random, G);
      if (!r) continue;
      a._grudgeUntil = this.time + G.cooldown;
      if (r === 'flee') { this.bubbles.say(a, pick(G.fleeLines), 3, 'medo'); a.react('FLEE', 6, p); }
      else { this.bubbles.say(a, pick(G.callLines), 3, 'medo'); a.sawAt = { x: p.x, z: p.z }; this.witnesses.addAlert(a); }
    }
  }

  /** Caçadores de recompensa: surgem fora das vilas com recompensa alta; perseguem com cães. */
  updateHunters(dt) {
    const H = LAW.hunters, p = this.player.position;
    const onRoad = this.areaId === 'overworld' && !this.dead && !this.player.flying && !this.villageRegionAt(p);
    const groupsAlive = new Set(this.hunters.filter((h) => h.alive).map((h) => h.group)).size;
    if (this.hunterDir.update(dt, { totalBounty: this.bounty.total(), onRoad, groupsAlive }, this.random)) this.spawnHunters();
    const move = (q, dx, dz) => this.collisions.move(q, dx, dz, 0.3, { fraction: 0.6, maxSteps: 4 });
    const groundAt = (x, z, f) => this.groundHeight(x, z, f);
    for (let i = this.hunters.length - 1; i >= 0; i--) {
      const h = this.hunters[i];
      const far = Math.hypot(h.pos.x - p.x, h.pos.z - p.z) > H.despawnDist || this.areaId !== 'overworld';
      if (far) { this.removeHunter(h); continue; }
      if (h.update(dt, p, { move, groundAt, playerAlive: !this.dead, terrainAt: this._terrainAt ??= (x, z) => this.terrain.heightAt(x, z) })) { this.damagePlayer(H.damage, 'Caçador de recompensa', null, h); this.cameraRig.kick(0.05); }
    }
  }

  /** Solta um grupo de caçadores (e cães) atrás do jogador. */
  spawnHunters() {
    const H = LAW.hunters, p = this.player.position, r = (a, b) => a + Math.floor(this.random() * (b - a + 1));
    const at = ambushPoint(p, this.viewForward(), this.random, H);
    const group = ++this._hunterGroup, n = r(...H.count);
    const first = ['Kofi', 'Bako', 'Zuri', 'Tunde', 'Imani', 'Jabari', 'Sefu'];
    for (let i = 0; i < n; i++) {
      const h = new BountyHunter({ x: at.x + (this.random() - 0.5) * 4, z: at.z + (this.random() - 0.5) * 4, name: `${first[r(0, first.length - 1)]}, caçador de recompensa`, group });
      this.scene.add(h.model.root);
      this.combat.register({ name: h.name, object: h.model.root, enabled: () => this.areaId === 'overworld' && h.alive, onHit: (hit) => h.hurt(hit.damage) });
      this.hunters.push(h);
      if (i === 0) this.bubbles.say(h, H.lines[r(0, H.lines.length - 1)], 3.5, 'alerta');
    }
    for (const dog of this.fauna.spawnGroup(H.dogSpecies, at.x, at.z, r(...H.dogs), { force: true })) dog.brain.alert();
    this.whistle.blow(H.spawnDist * 0.6);
    this.ui.toast(`Caçadores de recompensa estão atrás de você (recompensa total: ${this.bounty.total()} moedas).`);
  }

  removeHunter(h) {
    this.combat.unregister(h.model.root);
    this.scene.remove(h.model.root);
    this.hunters.splice(this.hunters.indexOf(h), 1);
  }

  /** Testemunhas correndo; denúncias; marcadores de olho. */
  updateWitnesses(dt) {
    for (const e of this.witnesses.entries.values()) if (e.paused && !this.ui.dialogue.isOpen) e.paused = false;
    const reports = this.witnesses.update(dt, { guardFor: (a) => this.guardFor(a) });
    for (const { agent, crimes } of reports) {
      if (!crimes.length) { // parente que foi chamar a guarda: busca no lugar onde viu o jogador
        this.bubbles.say(agent, 'Guarda! Eu vi o procurado ali!', 3, 'alerta');
        const v = agent.village.config.id;
        if (this.bounty.bountyOf(v) > 0) this.bounty.startSearch(v, agent.sawAt ?? this.player.position);
        continue;
      }
      const L = LAW.witness.reportLines;
      this.bubbles.say(agent, L[Math.floor(this.random() * L.length)], 3, 'alerta');
      for (const c of crimes) this.onCrimeWitnessed(c, agent, false);
    }
    this.witnessMarks.root.style.display = this.bubbles.root.style.display;
    this.witnessMarks.update(this.camera, this.witnesses.entries.keys(), this.player.position);
  }

  /** Testemunha com boneco mais perto do jogador, até `radius` m (para interceptar com E). */
  nearestWitness(radius) {
    const p = this.player.position;
    let best = null, bd = radius;
    for (const a of this.witnesses.entries.keys()) {
      if (!a.rendered) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** E numa testemunha correndo: Intimidar / Subornar / Deixar ir. Nocautear = soco (é agressão). */
  interceptWitness(a) {
    const e = this.witnesses.entryOf(a);
    if (!e) return;
    const W = LAW.witness, armed = this.playerPerceptionState(1 / 60).armed;
    const bounty = e.crimes.reduce((s, c) => s + c.bounty, 0);
    const cost = Math.round(W.bribe.base + bounty * W.bribe.perBounty);
    const chance = Math.min(0.95, W.intimidate.chance + (armed ? W.intimidate.armedBonus : 0));
    e.paused = true;
    a.react('FACE', 30, this.player.position);
    const pick = (l) => l[Math.floor(this.random() * l.length)];
    const silenced = (how) => {
      this.witnesses.silence(a, how);
      this.ui.dialogue.close();
      this.bubbles.say(a, pick(W.silencedLines[how]), 3, 'medo');
      a.react('FLEE', 6, this.player.position);
      this.npcManager.remember(a, 'provocado');
    };
    const options = [];
    if (!e.intimidateFailed) options.push({ label: `Intimidar · ${Math.round(chance * 100)}% de chance${armed ? ' (armado)' : ''}`, onSelect: () => {
      if (this.random() < chance) { silenced('intimidar'); return; }
      e.intimidateFailed = true;
      e.paused = false;
      this.ui.dialogue.close();
      this.bubbles.say(a, pick(W.intimidateFailLines), W.intimidate.failShoutSeconds, 'medo');
    } });
    options.push({ label: `Subornar · ${cost} moedas${this.state.coins < cost ? ' (sem moedas)' : ''}`, onSelect: () => {
      if (!this.state.spend(cost)) { this.ui.toast('Moedas insuficientes.'); return; }
      silenced('suborno');
    } });
    options.push({ label: 'Deixar ir', onSelect: () => { e.paused = false; } });
    this.ui.dialogue.open({
      speaker: a.name,
      title: '<span class="dlg-mood dlg-witness">Testemunha · correndo até a guarda</span>',
      text: `Viu: ${e.crimes.map((c) => c.label.toLowerCase()).join(', ')}. Se chegar a um guarda, você vira procurado. Socar a testemunha também cala, mas conta como agressão.`,
      options,
    });
  }

  /** Soco num morador: nocaute (~20 s deitado), rancor da família e crime de agressão. */
  assaultAgent(a) {
    if (a.life === 'DEAD') return;
    a.knockOut(LAW.knockoutSeconds);
    this.npcManager.remember(a, 'agredido');
    this.reportCrime('agressao', a.village, a.pos, a);
    this.ui.showHit(`${a.name} desmaiou`, true);
  }

  /** Lança/flecha num morador: cabeça ou corpo mata (assassinato); pernas derrubam (agressão). */
  onAgentShot({ agent: a, zone, point }) {
    if (a.life === 'DEAD') return;
    const y = this.groundHeight(point.x, point.z, -Infinity);
    for (let i = 0; i < BLEED.bloodAtHit; i++) this.trails.add('blood', point.x + (this.random() - 0.5) * 0.5, y, point.z + (this.random() - 0.5) * 0.5, this.time);
    if (zone === 'legs') { this.assaultAgent(a); this.ui.showHit(`Acertou: ${a.name} · pernas · caiu`, true); return; }
    a.kill();
    this.npcManager.remember(a, 'morto');
    this.reportCrime('assassinato', a.village, a.pos, a, { guard: a.person.profession === 'guarda' });
    this.onNpcDeath({ name: a.name, position: a.pos });
    this.ui.showHit(`Acertou: ${a.name} · ${zone === 'head' ? 'cabeça' : 'corpo'} · morto`, true);
  }

  /** Invasão (ficar numa casa com moradores que não são o jogador) e o botão de vasculhar. */
  updateLaw(dt) {
    const pos = this.player.position;
    const inside = this.areaId === 'overworld' ? this.interiors.insideAt(pos) : null;
    const h = inside ? this.npcManager.homeOfHouse(inside.house) : null;
    this._alienHome = h && h.residents.length ? h : null;
    if (this.trespass.update(this._alienHome?.home.id ?? null, dt)) {
      const { home, vs, residents } = this._alienHome;
      const night = residents.some((a) => a.state === 'SLEEPING');
      this.reportCrime('invasao', vs.village, pos, null, { homeId: home.id, night });
      this.ui.toast(`Você invadiu a casa de outra família${night ? ' enquanto dormem' : ''}.`);
    }
    const lh = this._alienHome?.home;
    const can = lh && (lh.lootedAt === undefined || this.gameClock.totalHours - lh.lootedAt >= LAW.theft.cooldownHours);
    this.houseLoot.enabled = !!can;
    if (can) this.houseLoot.pos = pos; // sempre ao alcance enquanto estiver dentro
  }

  /** Vasculha a casa alheia: itens/moedas sorteados e crime de roubo. */
  lootHouse() {
    const h = this._alienHome;
    if (!h) return;
    h.home.lootedAt = this.gameClock.totalHours;
    const got = rollLoot(LAW.theft.loot, LAW.theft.rolls, this.random);
    const names = [];
    for (const g of got) {
      if (g.coins) { this.state.coins += g.coins; this.state.emit('change'); names.push(`${g.coins} moedas`); }
      else { this.state.addItem(g.id, g.count); names.push(`${g.count}× ${ITEMS[g.id]?.name ?? g.id}`); }
    }
    this.reportCrime('roubo', h.vs.village, this.player.position, null, { homeId: h.home.id, items: got });
    this.ui.toast(`Você roubou: ${names.join(', ')}.`);
  }

  updateLivingWorld(dt) {
    this.npcManager.update(dt);
    this.updateLaw(dt);
    this.updateWitnesses(dt);
    this.updateBounty(dt);
    this.updateGuards(dt);
    this.updateGrudges(dt);
    this.updateHunters(dt);
    if (this.areaId === 'overworld') this.npcManager.updateSocial(dt, this.playerPerceptionState(dt));
    // Balões somem atrás de diálogos e painéis (não tampam a caixa de texto).
    this.bubbles.root.style.display = this.ui.dialogue.isOpen || this.backpack.open || this.notebookUI.open || this.recipeBook.open || this.inspection.active ? 'none' : '';
    this.bubbles.update(this.camera, dt);
    let a = this.areaId === 'overworld' ? (this.nearestWitness(LAW.witness.interceptRadius) ?? this.npcManager.nearest(this.player.position)) : null;
    if (a && this.guardAI?.engaged(a)) a = null; // guarda em perseguição não conversa
    this._talkAgent = a;
    this.npcTalk.enabled = !!a;
    if (a) {
      this.npcTalk.pos = a.model.root.position;
      this.npcTalk.label = this.witnesses.entryOf(a) ? `Interceptar ${a.name} (testemunha)` : a.commander ? `Falar com ${a.name} (${LAW.redemption.title})` : `Falar com ${a.name} (${PROFESSIONS[a.person.profession]?.name ?? (a.person.age === 'child' ? 'Criança' : 'Morador')})`;
    }
  }

  /** O que os moradores percebem do jogador (arma, sangue, sanidade, corrida). */
  playerPerceptionState(dt) {
    const p = this.player.position, prev = this._prevPos;
    const vx = (p.x - prev.x) / Math.max(dt, 1e-4), vz = (p.z - prev.z) / Math.max(dt, 1e-4);
    prev.x = p.x; prev.z = p.z;
    const eq = this.inventory.equipado.id;
    return {
      x: p.x, z: p.z, vx, vz,
      armed: !!WEAPONS[eq] || eq === 'faca_osso' || eq === 'faca_pedra',
      dirt: this.survival.dirt,
      bleeding: this.survival.body.wounds.some((w) => !w.bandage && (WOUNDS_BLEED[w.type] ?? 0) >= 0.1),
      sanity: this.sanity.value,
      sprinting: this.player.sprinting,
      wanted: !!this.bounty?.wantedHere?.(p),
    };
  }

  /** Tags do jogador vistas por um morador específico (para a conversa). */
  playerTagsFor(a) {
    const st = this.playerPerceptionState(1 / 60);
    const dist = Math.hypot(a.pos.x - st.x, a.pos.z - st.z);
    return DialogueEngine.perceive({ ...st, towardDot: 0, sprinting: false, dist }).tags;
  }

  /**
   * Conversa com um morador (tecla E): cabeçalho "Nome - Profissão | Humor",
   * fala de abertura contextual e o menu Saudar / Provocar / Perguntar / Comerciar.
   */
  talkToAgent(a, reply = null) {
    if (!a) return;
    if (this.witnesses?.entryOf(a)) { this.interceptWitness(a); return; }
    if (a.commander && !reply) { this.commanderDialog(a); return; }
    const nm = this.npcManager;
    const ctx = nm.contextFor(a, this.playerTagsFor(a));
    const text = reply ?? (ctx.player.some((t) => t !== 'procurado') ? DialogueEngine.line('react', ctx, this.random) : DialogueEngine.line('greet', ctx, this.random));
    const isTrader = !!PROFESSIONS[a.person.profession]?.trader;
    const options = DIALOGUE_MENU.filter((o) => !o.traders || isTrader).map((o, i) => ({
      label: o.label,
      onSelect: () => this.dialogueChoice(a, o.id),
    }));
    options.push({ label: 'Até mais' });
    a.react('CHAT', 8, this.player.position);
    this.ui.dialogue.open({
      speaker: DialogueEngine.header(ctx).split(' | ')[0],
      title: `<span class="dlg-mood">${DialogueEngine.header(ctx).split(' | ')[1]}</span>`,
      text: `"${text}"`,
      options,
    });
  }

  /** Resposta a uma opção do menu de conversa. */
  dialogueChoice(a, id) {
    const nm = this.npcManager;
    if (id === 'provoke') {
      nm.remember(a, 'provocado');
      const ctx = nm.contextFor(a, this.playerTagsFor(a));
      const line = DialogueEngine.line('provoke', ctx, this.random);
      const scared = a.person.age !== 'adult' || (a.person.profession !== 'guarda' && this.random() < 0.35);
      this.ui.dialogue.close();
      this.bubbles.say(a, line, 3.2, scared ? 'medo' : 'alerta');
      if (scared) a.react('FLEE', PERCEPTION.fleeSeconds, this.player.position);
      else a.react('FACE', 4, this.player.position, a.person.profession === 'guarda' ? 'point' : 'fists');
      return;
    }
    const ctx = nm.contextFor(a, this.playerTagsFor(a));
    if (id === 'trade') {
      const line = DialogueEngine.line('trade', ctx, this.random);
      if (ctx.memory.includes('agredido') || ctx.memory.includes('parente_agredido')) { this.talkToAgent(a, line); return; }
      const list = a.person.profession === 'ferreiro' ? SHOP_SMITH : [...SHOP_FOOD_LIST, ...SHOP_MATERIALS_LIST];
      Mechanics.shopList(this, a.name, a.person.profession === 'ferreiro' ? 'Forja' : 'Banca', list);
      return;
    }
    this.talkToAgent(a, DialogueEngine.line(id, ctx, this.random));
  }

  // ------------------------------------------------------------ sanidade e psicologia

  /**
   * Sanidade: SanityManager (no Survival), ficha do personagem, gatilhos de
   * trauma, alucinações (distorção, sons, criaturas fantasmas) e ossadas.
   *
   * Pontos de entrada para outros sistemas:
   *   game.paranormalEntities.push(obj)  // criatura paranormal (Object3D ou {x,z}); `userData.sanityReach` ou `reach` = raio
   *   game.sanity.drainSanity(n, 'motivo', { tags: ['SANGUE'] })
   *   game.onNpcDeath(npc)                // quando NPCs puderem morrer
   */
  setupSanity() {
    /** Ficha do personagem ativo (edite em config/character.js). */
    this.characterProfile = CHARACTER_PROFILE;
    this.sanity = this.survival.sanityMgr;
    this.sanity.profile = CHARACTER_PROFILE;
    /** Criaturas paranormais (stub): empurre os modelos aqui. É a mesma lista da névoa paranormal. */
    this.paranormalEntities = this.paranormalCreatures;
    for (const p of this.paranormalEntities) if (p.name && p.reach && !p.isObject3D) p.presence = true; // presenças fixas = local amaldiçoado
    this.cursedAreas = CURSED_AREAS.map((c) => { const v = this.villages[c.village]; return v && { x: v.x, z: v.z, r: v.radius + c.extra, name: c.name }; }).filter(Boolean);
    this.hallucinations = new Hallucinations();
    this.hallucinations.onSpawn = () => this.sanity.drainSanity(PHANTOMS.dread, 'Um vulto observa você', { quiet: true });
    this.scene.add(this.hallucinations.group);
    this.phantomSounds = new PhantomSounds({ volume: PHANTOM_SOUNDS.volume });
    this._soundIn = 6;
    this.skeletons = new Skeletons({ villages: this.villages, groundAt: (x, z) => this.terrain.heightAt(x, z), seed: WORLD.seed });
    this.scene.add(this.skeletons.mesh);
    this.sanityPop = document.createElement('div');
    this.sanityPop.className = 'sanity-pop';
    this.ui.root.appendChild(this.sanityPop);
    this.sanity.on('drain', ({ amount, reason, quiet, disliked }) => { if (!quiet) this.popSanity(-amount, reason + (disliked ? ' (detesta)' : '')); });
    this.sanity.on('restore', ({ amount, reason, quiet }) => { if (!quiet) this.popSanity(amount, reason); });
    this.sanity.on('level', ({ level, previous }) => {
      if (level <= previous) return;
      this.ui.toast(['', 'Sua visão começa a tremer…', 'Você ouve coisas que não estão lá.', 'Vultos se movem entre as árvores. Recupere a sanidade!'][level]);
    });
    // Acariciar animais (PET_ANIMAIS): animais das vilas e animais mansos.
    const pet = this.interactions.register({ id: 'pet', label: 'Acariciar', radius: 2.6, position: () => pet.pos ?? Game.NOWHERE, onInteract: (g) => g.petAnimal() });
    pet.enabled = false;
    this.petInteraction = pet;
    this._v3 = new THREE.Vector3();
  }

  /** Aviso flutuante de ganho/perda de sanidade. */
  popSanity(delta, reason) {
    const d = document.createElement('div');
    if (delta > 0) d.className = 'up';
    d.textContent = `Sanidade ${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(delta % 1 && Math.abs(delta) < 10 ? 1 : 0)} · ${reason}`;
    this.sanityPop.appendChild(d);
    setTimeout(() => d.remove(), 3300);
    while (this.sanityPop.children.length > 4) this.sanityPop.firstChild.remove();
  }

  /** Direção do olhar no plano (câmera). */
  viewForward() {
    const f = this.cameraRig.forward(this._v3);
    const l = Math.hypot(f.x, f.z) || 1;
    return { x: f.x / l, z: f.z / l };
  }

  /** O ponto está à vista (perto e na frente da câmera)? */
  inView(x, z, radius, minDot) {
    const p = this.player.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d > radius) return false;
    if (d < 2) return true;
    const f = this.viewForward();
    return (dx * f.x + dz * f.z) / d >= minDot;
  }

  /** Um quadro de sanidade (depois da sobrevivência). */
  updateSanity(dt) {
    const T = SANITY_TRIGGERS, pos = this.player.position, over = this.areaId === 'overworld';
    if (this.dead || this.player.flying) { this.hallucinations.update(dt, { level: 0, player: pos, groundAt: () => 0, active: false }); return; }
    // Paranormal (contínuo, por proximidade). Presenças fixas contam como local amaldiçoado.
    const paranormal = [];
    if (over) {
      for (const e of this.paranormalEntities) {
        if (e.presence) continue;
        const ep = e.isObject3D ? e.getWorldPosition(this._v3) : (e.position ?? e);
        paranormal.push({ dist: Math.hypot(ep.x - pos.x, ep.z - pos.z), reach: e.userData?.sanityReach ?? e.reach ?? 30 });
      }
    }
    const cursed = over && this.cursedAreas.some((c) => Math.hypot(pos.x - c.x, pos.z - c.z) < c.r);
    const sheltered = this._nearFire || (over && this.villageShelter(pos) >= 1);
    const dark = !sheltered && (!over || this.environment.night > T.darkNight);
    this.sanity.update(dt, { paranormal, cursed, dark });
    if (this._nearFire) this.sanity.comfort('FOGUEIRA', dt);
    // Ossada à vista: trauma, uma vez por ossada.
    if (over && this.skeletons.noticed(pos, this.viewForward())) this.sanity.drainSanity(T.corpseFound, 'Você encontrou uma ossada');
    // Alucinações: criaturas fantasmas (nível 3) e sons (nível ≥ 2).
    const level = this.sanity.level;
    this.hallucinations.update(dt, { level, player: pos, groundAt: (x, z) => this.groundHeight(x, z, -Infinity), rng: this.random, active: over });
    if (level >= 2) {
      this._soundIn -= dt;
      if (this._soundIn <= 0) {
        const [a, b] = PHANTOM_SOUNDS.every;
        this._soundIn = (a + this.random() * (b - a)) * (level >= 3 ? 0.6 : 1);
        this.phantomSounds.random();
      }
    }
    // Acariciar: animal manso mais perto.
    let best = null, bd = 2.6;
    if (over) {
      for (const v of Object.values(this.villages)) for (const a of v.animals) {
        const d = Math.hypot(a.position.x - pos.x, a.position.z - pos.z);
        if (d < bd) { bd = d; best = { pos: a.position, name: 'animal' }; }
      }
      for (const a of this.fauna.animals) {
        if (!a.alive || !['passive', 'neutral'].includes(a.spec.behavior)) continue;
        const d = Math.hypot(a.root.position.x - pos.x, a.root.position.z - pos.z);
        if (d < bd) { bd = d; best = { pos: a.root.position, name: a.spec.nome }; }
      }
    }
    this.petInteraction.enabled = !!best;
    this.petInteraction.pos = best?.pos ?? null;
    if (best) this.petInteraction.label = best.name === 'animal' ? 'Acariciar o animal' : `Acariciar ${best.name}`;
    this.ui.setSanity(this.sanity.value, this.sanity.max, SANITY_BAR.pulseBelow);
  }

  /** Morte de animal: trauma se o jogador viu (perto e na frente). */
  onAnimalDeath(a) {
    const q = a.root.position;
    if (!this.inView(q.x, q.z, SANITY_TRIGGERS.witnessRadius, SANITY_TRIGGERS.witnessDot)) return;
    this.sanity.drainSanity(SANITY_TRIGGERS.animalDeath, `Morte: ${a.spec.nome}`, { tags: ['SANGUE'] });
  }

  /**
   * Morte de NPC presenciada (gancho: hoje nenhum NPC morre; chame daqui
   * quando houver). `npc.root.position` ou `npc.position`.
   */
  onNpcDeath(npc) {
    const q = npc.root?.position ?? npc.position;
    const seen = !q || this.inView(q.x, q.z, SANITY_TRIGGERS.witnessRadius, SANITY_TRIGGERS.witnessDot);
    if (seen) this.sanity.drainSanity(SANITY_TRIGGERS.npcDeath, `Morte de ${npc.name ?? 'alguém'}`, { tags: ['SANGUE'] });
  }

  /** Dano recebido: ataque surpresa (atacante fora da vista) e dano crítico abalam a mente. */
  onPlayerHurt(amount, source, attacker) {
    const T = SANITY_TRIGGERS;
    if (amount >= this.state.maxHealth * T.criticalFraction) this.sanity.drainSanity(T.criticalHit, `Golpe crítico: ${source}`, { tags: ['SANGUE'] });
    if (attacker) {
      const q = attacker.root?.position ?? attacker.position;
      if (q && !this.inView(q.x, q.z, Infinity, T.surpriseDot)) this.sanity.drainSanity(T.surpriseAttack, `Ataque surpresa: ${source}`);
    }
  }

  /** Flauta (TOCAR_INSTRUMENTO) e livro (LER_LIVROS): atividades de conforto. */
  useComfortItem(id) {
    const d = ITEMS[id];
    if (!d?.comfort) return false;
    if (id === 'flauta_osso') this.phantomSounds.flute();
    const got = this.sanity.comfort(d.comfort, 0, this.time);
    if (!got) this.ui.toast(`${d.name}: você acabou de fazer isso. Espere um pouco.`);
    return got > 0;
  }

  /** Acariciar o animal manso mais perto (PET_ANIMAIS). */
  petAnimal() {
    const got = this.sanity.comfort('PET_ANIMAIS', 0, this.time);
    if (!got) this.ui.toast('O animal já recebeu carinho há pouco.');
  }

  // ------------------------------------------------------------ caça, coleta, fogueira

  /**
   * Caça e coleta: projéteis (lança/arco), rastros, recursos coletáveis,
   * esfolamento (segurar E) e os interagíveis dinâmicos (recurso, água,
   * fogueira, peças no chão, projétil cravado, carcaça).
   */
  setupHunting() {
    this.projectiles = new Projectiles();
    this.projectileMeshes = new ProjectileMeshes(this.materials);
    this.scene.add(this.projectileMeshes.group);
    this.trails = new Trails();
    this.scene.add(this.trails.group);
    this.skinning = new Skinning();
    const villageList = Object.values(this.villages);
    this.resources = new Resources({
      seed: WORLD.seed,
      biomeAt: (x, z) => BIOMES[this.terrain.dominantBiome(x, z)]?.id,
      groundAt: (x, z) => this.terrain.heightAt(x, z),
      isBlocked: (x, z) => villageList.some((v) => Math.hypot(x - v.x, z - v.z) < v.radius + 6) || this.collisions.overlaps(x, z, 0.6) || this.bridges.distanceTo(x, z) < 4,
      waterLevel: WORLD.waterLevel,
    });
    this.resourceMeshes = new ResourceMeshes();
    this.scene.add(this.resourceMeshes.group);
    this._hb = [];
    this._ray = new THREE.Raycaster();
    this._rayDir = new THREE.Vector3();
    this._rayFrom = new THREE.Vector3();
    this._local = new THREE.Vector3();
    // Interagíveis dinâmicos: posição/rótulo mudam a cada quadro (updateHunting).
    const dyn = (id, label, radius, onInteract) => {
      const it = this.interactions.register({ id, label, radius, position: () => it.pos ?? Game.NOWHERE, onInteract });
      it.enabled = false;
      it.pos = null;
      return it;
    };
    this.hunt = {
      resource: dyn('resource', 'Colher', RESOURCES.reach + 0.2, (g) => g.harvestResource()),
      water: dyn('water', 'Água do rio: beber · encher · lavar-se', WATER.reach + 1, (g) => g.useWater()),
      fire: dyn('fire', 'Usar a fogueira (assar, ferver, cinza)', COOKING.radius + 0.2, (g) => g.useFire()),
      loot: dyn('loot', 'Pegar', 2.4, (g) => g.pickLoot()),
      projectile: dyn('projectile', 'Pegar', PROJECTILE.pickupRadius + 0.2, (g) => g.pickProjectile()),
      corpse: dyn('corpse', 'Esfolar', SKINNING.radius + 0.2, () => {}), // segurar E: tratado no loop
    };
  }

  /** Um quadro de caça/coleta (depois da fauna). */
  updateHunting(dt) {
    const H = this.hunt, pos = this.player.position;
    if (this.areaId !== 'overworld') { for (const it of Object.values(H)) it.enabled = false; return; }
    // Recursos em volta e o colhível mais perto.
    this.resources.update(pos, this.time);
    this.resourceMeshes.sync(this.resources);
    const node = this.resources.nearest(pos);
    H.resource.enabled = !!node; H.resource.pos = node;
    if (node) H.resource.label = RESOURCES.types[node.type].label;
    // Água doce à frente.
    const f = this.player.facing, wx = pos.x + f.x * WATER.probe, wz = pos.z + f.z * WATER.probe;
    const water = !this.player.swimming && this.terrain.heightAt(wx, wz) < WORLD.waterLevel - 0.05;
    H.water.enabled = water;
    if (water) { this._waterPos = this._waterPos ?? { x: 0, y: 0, z: 0 }; this._waterPos.x = wx; this._waterPos.y = pos.y; this._waterPos.z = wz; H.water.pos = this._waterPos; }
    // Fogueira acesa perto.
    let fire = null, fd = COOKING.radius;
    for (const s of this.fireLights.sources) { if (!s.warm) continue; const d = Math.hypot(s.x - pos.x, s.z - pos.z); if (d < fd) { fd = d; fire = s; } }
    H.fire.enabled = !!fire; H.fire.pos = fire; this._fire = fire;
    // Peças de carcaça e projéteis cravados.
    let loot = null, ld = 2.4;
    for (const list of Object.values(this.lootPool)) for (const p of list) { if (!p.active) continue; const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z); if (d < ld) { ld = d; loot = p; } }
    H.loot.enabled = !!loot; H.loot.pos = loot?.pos ?? null; this._loot = loot;
    if (loot) H.loot.label = `Pegar ${ITEMS[PROP_TYPES[loot.type].item].name}`;
    const pj = this.projectiles.nearestLanded(pos);
    H.projectile.enabled = !!pj; H.projectile.pos = pj?.pos ?? null; this._projectile = pj;
    if (pj) H.projectile.label = `Pegar ${ITEMS[pj.item].name}`;
    // Carcaça: segurar E com uma faca equipada.
    let corpse = null, cd = SKINNING.radius;
    for (const a of this.fauna.animals) { if (a.alive || a.skinned) continue; const d = Math.hypot(a.root.position.x - pos.x, a.root.position.z - pos.z); if (d < cd) { cd = d; corpse = a; } }
    const knife = Skinning.hasKnife(this.inventory.equipado.id);
    H.corpse.enabled = !!corpse; H.corpse.pos = corpse?.root.position ?? null;
    const holding = !!corpse && knife && this.input.isDown('KeyE') && this.interactions.current === H.corpse;
    if (this.skinning.hold(dt, holding, corpse)) this.skinCorpse(corpse);
    if (corpse) {
      H.corpse.label = knife
        ? `Segure para esfolar ${corpse.spec.nome}<span class="hold"><i style="width:${Math.round(this.skinning.progress * 100)}%"></i></span>`
        : `Esfolar ${corpse.spec.nome}: precisa de uma faca equipada`;
    }
    // Projéteis em voo → acertos.
    const events = this.projectiles.step(dt, { groundAt: (x, z) => this.groundHeight(x, z, -Infinity), hitTest: (a, b) => this.projectileHit(a, b) });
    for (const { p, hit } of events) {
      if (p.gone) { this.projectiles.remove(p); continue; }
      if (hit) {
        if (hit.hunter) { hit.hunter.kill(); this.ui.showHit(`Acertou: ${hit.hunter.name} · morto`, true); }
        else if (hit.agent) this.onAgentShot(hit, p); else this.onAnimalShot(hit, p);
        if (this.random() < WEAPONS[p.weapon].breakChance) { this.projectiles.remove(p); this.ui.toast(`${ITEMS[p.item].name} quebrou no impacto.`); }
      }
    }
    this.projectileMeshes.sync(this.projectiles.list);
    // Rastro de sangue e pegadas dos animais feridos.
    for (const a of this.fauna.animals) {
      if (!a.bleeding || !a.alive || a.trailAcc < BLEED.trailEvery) continue;
      a.trailAcc = 0;
      const q = a.root.position, y = this.groundHeight(q.x, q.z, -Infinity), yaw = a.root.rotation.y;
      this.trails.add('blood', q.x + (this.random() - 0.5) * 0.4, y, q.z + (this.random() - 0.5) * 0.4, this.time);
      const side = (a.printSide = -(a.printSide ?? 1)), w = (a.halfWid ?? 0.3) * 0.8;
      this.trails.add('print', q.x + Math.cos(yaw) * side * w, y, q.z - Math.sin(yaw) * side * w, this.time, yaw);
    }
    this.trails.update(this.time);
  }

  /** Segmento (a → b) do projétil contra as hitboxes dos animais vivos: { animal, zone, point } ou null. */
  projectileHit(a, b) {
    this._hb.length = 0;
    for (const an of this.fauna.animals) if (an.alive && an.hitbox) this._hb.push(an.hitbox);
    for (const ag of this.npcManager?.rendering ?? []) if (ag.rendered && ag.life !== 'DEAD' && ag.hitbox) this._hb.push(ag.hitbox);
    for (const h of this.hunters ?? []) if (h.alive) this._hb.push(h.hitbox);
    if (!this._hb.length) return null;
    this._rayDir.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = this._rayDir.length();
    if (len < 1e-6) return null;
    this._rayDir.divideScalar(len);
    this._ray.set(this._rayFrom.set(a.x, a.y, a.z), this._rayDir);
    this._ray.near = 0; this._ray.far = len + 0.2;
    const hits = this._ray.intersectObjects(this._hb, false);
    if (!hits.length) return null;
    const hb = hits[0].object, animal = hb.userData.animal;
    if (hb.userData.hunter) return { hunter: hb.userData.hunter, zone: 'body', point: { x: hits[0].point.x, y: hits[0].point.y, z: hits[0].point.z } };
    if (hb.userData.agent) {
      const ag = hb.userData.agent;
      return { agent: ag, zone: humanZone(hits[0].point.y - ag.pos.y), point: { x: hits[0].point.x, y: hits[0].point.y, z: hits[0].point.z } };
    }
    animal.root.worldToLocal(this._local.copy(hits[0].point));
    const zone = classifyZone(this._local, hb.position, hb.scale);
    return { animal, zone, point: { x: hits[0].point.x, y: hits[0].point.y, z: hits[0].point.z } };
  }

  /** Projétil acertou um animal: dano por zona, sangue no ponto, aviso na tela. */
  onAnimalShot({ animal, zone, point }, p) {
    const dmg = zoneDamage(p.weapon, zone);
    const len = Math.hypot(p.vel.x, p.vel.z) || 1;
    animal.takeHit({ damage: dmg === Infinity ? animal.health + 1 : dmg, direction: { x: p.vel.x / len, z: p.vel.z / len }, zone });
    const y = this.groundHeight(point.x, point.z, -Infinity);
    for (let i = 0; i < BLEED.bloodAtHit; i++) this.trails.add('blood', point.x + (this.random() - 0.5) * 0.5, y, point.z + (this.random() - 0.5) * 0.5, this.time);
    this.notebook.record('fauna', animal.speciesId);
    const hp = animal.alive ? ` · ${Math.max(0, Math.round(animal.health))}/${animal.spec.health}` : ' · abatido';
    this.ui.showHit(`Acertou: ${animal.spec.nome} · ${ZONE_EFFECTS[zone].label}${hp}`, true);
  }

  /** Clique com lança (arremessa a própria) ou arco (gasta uma flecha da mochila). */
  throwWeapon(item) {
    if (this.player.flying || this.player.swimming || this.areaId !== 'overworld') return;
    const w = WEAPONS[item.id];
    let flying = item.id;
    if (w.ammo) {
      if (!this.state.removeItem(w.ammo)) { this.ui.showHit(`Sem ${ITEMS[w.ammo].name} na mochila`, false); return; }
      flying = w.ammo;
    } else this.inventory.removerItem(this.inventory.selected);
    const dir = this.cameraRig.forward(new THREE.Vector3());
    const o = this.player.punchOrigin();
    this.player.startPunch(dir, 0.35);
    if (this.cameraRig.isFirstPerson) this.fpArm.punch(0.35);
    this.projectiles.launch({ weapon: item.id, item: flying, x: o.x + dir.x * 0.6, y: o.y + 0.2, z: o.z + dir.z * 0.6, dx: dir.x, dy: dir.y, dz: dir.z });
    this.cameraRig.kick(0.04);
  }

  harvestResource() {
    const node = this.resources.nearest(this.player.position);
    if (!node) return;
    const got = this.resources.harvest(node, this.time, this.random);
    this.state.addItem(got.item, got.n);
    if (got.also) this.state.addItem(got.also, 1);
    if (got.dirt) this.survival.addDirt(got.dirt);
    this.ui.toast(`${ITEMS[got.item].name} ×${got.n}${got.also ? ` + ${ITEMS[got.also].name}` : ''} na mochila.`);
  }

  useWater() {
    this.ui.dialogue.open({
      speaker: 'Rio', text: 'Água doce e corrente. Fria.',
      options: [
        { label: 'Beber direto (pode ter parasitas)', onSelect: () => this.ui.toast(`Você bebeu: ${this.survival.consume('agua_rio')}`) },
        { label: 'Encher o cantil (Água do Rio — ferver na fogueira)', onSelect: () => { this.state.addItem('agua_rio'); this.ui.toast('Água do Rio na mochila.'); } },
        { label: 'Lavar-se (tira a sujeira da pele)', onSelect: () => { this.survival.dirt = 0; this.ui.toast('Você se lavou. Pele limpa.'); } },
        { label: 'Sair' },
      ],
    });
  }

  useFire() {
    const fire = this._fire;
    if (!fire) return;
    const opts = [];
    for (const [raw, cooked] of Object.entries(COOKING.recipes)) {
      if (!this.state.hasItem(raw) || raw === cooked) continue;
      opts.push({
        label: `${raw.startsWith('agua') ? 'Ferver' : 'Assar'} ${ITEMS[raw].name} → ${ITEMS[cooked].name}`,
        onSelect: () => { this.state.removeItem(raw); this.state.addItem(cooked); this.ui.toast(`${ITEMS[cooked].name}: pronto.`); this.useFire(); },
      });
    }
    const cool = this.time - (fire.ashAt ?? -Infinity) < COOKING.ashCooldown;
    opts.push({ label: cool ? 'Recolher cinza (ainda quente…)' : 'Recolher cinza', disabled: cool, onSelect: () => { fire.ashAt = this.time; this.state.addItem('cinza'); this.ui.toast('Cinza de Fogueira na mochila.'); } });
    opts.push({ label: 'Sair' });
    this.ui.dialogue.open({ speaker: 'Fogueira', text: opts.length > 2 ? 'O fogo crepita. O que você quer preparar?' : 'O fogo crepita. Nada para assar ou ferver na mochila.', options: opts });
  }

  pickLoot() {
    const p = this._loot;
    if (!p || !p.active) return; // já guardada neste quadro
    const item = PROP_TYPES[p.type].item;
    this.physics.storeProp(p);
    this.state.addItem(item);
    this.ui.toast(`${ITEMS[item].name} na mochila.`);
  }

  pickProjectile() {
    const p = this._projectile;
    if (!p) return;
    this.projectiles.remove(p);
    this.state.addItem(p.item);
    if (!ITEMS[p.item].hotbar || !this.equipFromBackpack(p.item)) this.ui.toast(`${ITEMS[p.item].name}: recuperada.`);
    this.projectileMeshes.sync(this.projectiles.list);
  }

  /** Esfolou: a carcaça vira peças físicas no chão (carne, pele, ossos, tripas/penas). */
  skinCorpse(a) {
    const loot = lootFor(a.spec), q = a.root.position, count = {};
    for (const [type, n] of Object.entries(loot)) {
      for (let k = 0; k < n; k++) {
        const list = this.lootPool[type], p = list.find((x) => !x.active) ?? list[0];
        const ang = this.random() * Math.PI * 2, r = 0.4 + this.random() * 0.8;
        this.physics.placeProp(p, { x: q.x + Math.cos(ang) * r, y: q.y + 0.6 + this.random() * 0.4, z: q.z + Math.sin(ang) * r },
          { x: Math.cos(ang) * SKINNING.tossSpeed, y: 1.5, z: Math.sin(ang) * SKINNING.tossSpeed });
        const item = PROP_TYPES[type].item;
        count[item] = (count[item] ?? 0) + 1;
      }
    }
    a.skinned = true;
    this.fauna.remove(a);
    this.survival.addDirt(SKINNING.dirt);
    this.sanity.drainSanity(SANITY_TRIGGERS.skinning, 'Esfolar', { tags: ['SANGUE'] });
    this.ui.toast(`Esfolado: ${Object.entries(count).map(([id, n]) => `${ITEMS[id].name} ×${n}`).join(', ')}. As peças estão no chão (E para pegar).`);
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
    const panels = this.inspection.active || this.backpack.open || this.notebookUI.open || this.recipeBook.open;
    const busy = this.dead || this.survival.fainted || panels || ui.dialogue.isOpen || ui.graphicsOpen || !ui.worldMap.classList.contains('hidden');
    // Painéis de sobrevivência: C inspeção, I mochila, N caderneta, Esc fecha.
    if (!this.dead && !ui.dialogue.isOpen && !ui.graphicsOpen) {
      if (input.pressed('KeyC')) { if (this.inspection.active) this.inspection.close(); else if (!busy) this.inspection.open(); }
      if (input.pressed('KeyI') && !this.inspection.active && !this.notebookUI.open) { this.recipeBook.toggle(false); this.backpack.toggle(); }
      if (input.pressed('KeyJ') && !this.inspection.active) { this.backpack.hide(); this.notebookUI.toggle(false); this.recipeBook.toggle(); }
      if (input.pressed('KeyN') && !this.inspection.active) { this.backpack.hide(); this.recipeBook.toggle(false); this.notebookUI.toggle(); }
      if (input.pressed('Escape')) { this.inspection.close(); this.backpack.hide(); this.notebookUI.toggle(false); this.recipeBook.toggle(false); }
      if (this.inspection.active) {
        [...Object.keys(LIMBS), null].forEach((id, i) => { if (input.pressed(`Digit${i + 1}`) || input.pressed(`Numpad${i + 1}`)) this.inspection.selectLimb(id); });
      }
      if (this.notebookUI.open) {
        if (input.pressed('ArrowLeft')) this.notebookUI.step(-1);
        if (input.pressed('ArrowRight')) this.notebookUI.step(1);
      }
    }
    if (this.dead && this.time >= this.respawnAt) this.respawn();

    if (input.pressed('KeyM')) ui.toggleWorldMap();
    if (input.pressed('KeyV') && this.areaId === 'overworld') ui.toast(this.player.flying ? 'Modo voo desligado.' : 'Modo voo: Espaço sobe · Ctrl desce · Shift acelera · roda afasta a câmera · V sai');
    if (input.pressed('Escape') && !ui.worldMap.classList.contains('hidden')) ui.toggleWorldMap(false);
    if (!busy) {
      if (input.pressed('KeyT')) this.cameraRig.toggleMode();
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

    const inspecting = this.inspection.active;
    if (busy) { if (!inspecting) this.player.model.update(dt, 0); } // na inspeção a pose é da BodyInspection
    else {
      this.player.update(dt, input, this.cameraRig);
      this.slopeHint ??= new SlopeHint(ui.root);
      this.slopeHint.update(this.player.slope, this.player.status);
      // Em 1ª pessoa o corpo acompanha para onde se olha (o soco sai daí).
      if (this.cameraRig.isFirstPerson) this.player.faceDirection(this.cameraRig.forward(this._camFwd));
    }
    if (inspecting) this.inspection.update(dt, input);
    else this.cameraRig.update(dt, this.player.position, busy ? null : input, {
      flying: this.player.flying,
      underground: this.areaId !== 'overworld',
      sprinting: !busy && this.player.sprinting,
      speed: busy ? 0 : this.player.speed,
      grounded: this.player.grounded,
    });
    // 3ª pessoa num cômodo apertado: câmera colada na cabeça esconde o corpo
    // (senão a tela mostra o interior do personagem).
    if (!this.cameraRig.isFirstPerson && !inspecting) {
      this.player.root.visible = this.camera.position.distanceTo(this.cameraRig.focus) > CAMERA.third.interior.hidePlayerDistance;
    }
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
      const indoor = !!this.interiors.insideAt(pos);
      this.weather.update(dt, { time: this.time, camera: this.camera, player: pos, weights: w, underground: false, shelter: indoor ? 1 : this.villageShelter(pos), hourIndex, indoor });
      this.clouds.update(dt, this.environment, this.weather.overcast);
      let best = 0;
      for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
      ui.setBiome(best);
      this._biome = best;
      this.notebook.record('biomas', BIOMES[best].id);
      this.vegetation.update(this.camera.position, true);
      this.grass.update(pos, !this.player.fastTravel && pos.y - this.terrain.heightAt(pos.x, pos.z) < 40);
      this.water.update(this.time, this.environment, this.camera);
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
    this.updateSurvival(dt);
    this.updateSanity(dt);
    this.updateLivingWorld(dt);
    ui.setWeather(this.gameClock.label(), this.weather.status, this.weather.overlays, this.weather.flash, this.debuffs);
    this.dungeons.update(dt, this.time, this.areaId);
    this.fireLights.update(this.time, this.areaId === 'overworld' ? pos : Game.NOWHERE);
    if (this.areaId === 'overworld') this.interiors.update(dt, pos);
    if (this.areaId === 'overworld') {
      this.physics.update(dt, pos); // transmite + simula (passo fixo 1/60)
      this.propMeshes.sync(this.physics.props); // corpo → InstancedMesh
    }
    for (const d of this.dummies) d.update(dt);
    this.fauna.update(dt, this.player.position, { active: this.areaId === 'overworld', playerAlive: !this.dead });
    // Caderneta: animal avistado de perto entra na seção Fauna.
    this._nbTimer = (this._nbTimer ?? 0) + dt;
    if (this._nbTimer > 0.5) {
      this._nbTimer = 0;
      const R2 = INSPECTION.fauna.discoverRadius ** 2;
      for (const a of this.fauna.animals) if (a.alive && (a.root.position.x - pos.x) ** 2 + (a.root.position.z - pos.z) ** 2 < R2) this.notebook.record('fauna', a.speciesId);
    }
    this.updateHunting(dt);
    if (this.cameraRig.isFirstPerson) this.fpArm.update(dt, busy ? 0 : this.player.speed, this.player.sprinting);
    ui.update(dt);

    this.postfx.render(this.scene, this.camera, this.weather.bloomStrength);
    if (this.areaId === 'overworld') this.minimap.render(this.player.position, ui.minimapRect(), { viewMeters: this.minimapViewMeters() });
    input.endFrame();
  }
}

/** Nome legível de uma anotação da caderneta (aviso na tela). */
function notebookLabel(section, id) {
  if (section === 'biomas') return `bioma ${BIOMES.find((b) => b.id === id)?.name ?? id}`;
  if (section === 'fauna') return `fauna ${SPECIES[id]?.nome ?? id}`;
  if (section === 'plantas') return `planta ${ITEMS[id]?.name ?? id}`;
  return `receita ${ITEMS[id]?.name ?? id}`;
}
