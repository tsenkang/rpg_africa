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
import { STARTER_KIT } from '../config/items.js';
import { SPECIES } from '../config/fauna.js';
import { ITEMS } from '../systems/PlayerState.js';
import { Notebook } from '../systems/Notebook.js';
import { Crafting } from '../systems/Crafting.js';
import { BackpackUI } from '../ui/BackpackUI.js';
import { NotebookUI } from '../ui/NotebookUI.js';
import { BodyInspection } from '../ui/BodyInspection.js';
import { Projectiles, classifyZone, zoneDamage } from '../systems/Projectiles.js';
import { Resources } from '../systems/Resources.js';
import { Skinning, lootFor } from '../systems/Skinning.js';
import { Trails } from '../render/Trails.js';
import { ResourceMeshes } from '../render/ResourceMeshes.js';
import { ProjectileMeshes } from '../render/ProjectileMeshes.js';
import { WEAPONS, ZONE_EFFECTS, BLEED, SKINNING, COOKING, WATER, PROJECTILE } from '../config/hunting.js';
import { RESOURCES } from '../config/resources.js';
import { PROP_TYPES } from '../config/physics.js';

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
    });
    this.scene.add(this.player.root);

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
    this.notebook.on('entry', ({ section, id }) => ui.toast(`📓 Caderneta: ${notebookLabel(section, id)}`));
    this.crafting = new Crafting();
    this.state.on('item-added', ({ id }) => { if (ITEMS[id]?.plant) this.notebook.record('plantas', id); });
    for (const [id, n] of Object.entries(STARTER_KIT)) this.state.addItem(id, n);
    this.backpack = new BackpackUI(this);
    this.notebookUI = new NotebookUI(this);
    this.setupHunting();
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
      const extra = dummy ? ` · ${dummy.health}/${dummy.maxHealth}`
        : animal ? (animal.alive ? ` · ${Math.max(0, animal.health)}/${animal.spec.health}` : ' · abatido') : '';
      this.ui.showHit(`Acertou: ${hit.name}${extra}`, true);
    } else {
      this.ui.showHit('Soco no ar', false);
    }
  }

  /** Usa o item do slot ativo (`ITEM_USES`); se ele for gasto, sai da hotbar. Armas de caça arremessam/atiram. */
  useEquipped(item) {
    if (WEAPONS[item.id]) { this.throwWeapon(item); return; }
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
  damagePlayer(amount, source, speciesId = null) {
    if (this.dead) return;
    this.state.damage(amount);
    if (speciesId) this.survival.onAnimalHit(speciesId); // garra/presa/picada → ferimento num membro
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
    const made = Object.entries(recipe.out).map(([id, n]) => `${ITEMS[id].icon} ${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}`).join(', ');
    const isNew = this.notebook.record('receitas', recipe.id);
    for (const id of Object.keys(recipe.out)) if (ITEMS[id].hotbar) this.equipFromBackpack(id);
    return { ok: true, message: `Criado: ${made}${isNew ? ' · receita anotada na caderneta' : ''}` };
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
        this.onAnimalShot(hit, p);
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
    this.ui.toast(`${ITEMS[got.item].icon} ${ITEMS[got.item].name} ×${got.n}${got.also ? ` + ${ITEMS[got.also].name}` : ''} na mochila.`);
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
    this.ui.toast(`${ITEMS[item].icon} ${ITEMS[item].name} na mochila.`);
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
    const panels = this.inspection.active || this.backpack.open || this.notebookUI.open;
    const busy = this.dead || this.survival.fainted || panels || ui.dialogue.isOpen || ui.graphicsOpen || !ui.worldMap.classList.contains('hidden');
    // Painéis de sobrevivência: C inspeção, I mochila, N caderneta, Esc fecha.
    if (!this.dead && !ui.dialogue.isOpen && !ui.graphicsOpen) {
      if (input.pressed('KeyC')) { if (this.inspection.active) this.inspection.close(); else if (!busy) this.inspection.open(); }
      if (input.pressed('KeyI') && !this.inspection.active && !this.notebookUI.open) this.backpack.toggle();
      if (input.pressed('KeyN') && !this.inspection.active) { this.backpack.hide(); this.notebookUI.toggle(); }
      if (input.pressed('Escape')) { this.inspection.close(); this.backpack.hide(); this.notebookUI.toggle(false); }
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
    this.updateSurvival(dt);
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
