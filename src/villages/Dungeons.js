import * as THREE from 'three';
import { StaticBatcher } from '../render/StaticBatcher.js';
import { G } from './Builders.js';
import { GAMEPLAY } from '../config/gameplay.js';
import { mulberry32 } from '../world/Noise.js';

/**
 * Áreas subterrâneas. Cada área fica longe do continente (x > 2600, fora
 * do mapa) e bem abaixo do nível do mar, então suas colisões 2D nunca se
 * misturam com as da superfície.
 *
 * Área: { id, name, floorY, spawn:{x,z,facing}, returnTo:{x,z,facing}, group, onEnter(game) }
 *
 *  - sedeKKK     sede secreta sob a igreja da Vila Renascimento (só pelo poço)
 *  - holocausto  masmorra sob a Praça da Saudade (Vila Perseguição)
 */
export class Dungeons {
  constructor(game) {
    this.game = game;
    this.areas = {};
    this.rnd = mulberry32(777);
    this.buildSede();
    this.buildHolocausto();
  }

  // ---------- utilidades de construção ----------
  room(batch, { x, z, w, d, y, h, floor, wall, ceil }, gaps = []) {
    const M = this.game.materials;
    const col = this.game.collisions;
    batch.add(G.box, floor, { x, y: y - 0.25, z, sx: w, sy: 0.5, sz: d });
    batch.add(G.box, ceil ?? M.stoneDark, { x, y: y + h + 0.25, z, sx: w + 1, sy: 0.5, sz: d + 1 });
    const t = 0.8;
    const sides = [
      { cx: x, cz: z - d / 2, len: w, horiz: true, key: 'n' },
      { cx: x, cz: z + d / 2, len: w, horiz: true, key: 's' },
      { cx: x - w / 2, cz: z, len: d, horiz: false, key: 'w' },
      { cx: x + w / 2, cz: z, len: d, horiz: false, key: 'e' },
    ];
    for (const s of sides) {
      const gap = gaps.find((g) => g.side === s.key);
      const pieces = gap
        ? [[-s.len / 2, gap.at - gap.width / 2], [gap.at + gap.width / 2, s.len / 2]]
        : [[-s.len / 2, s.len / 2]];
      for (const [a, b] of pieces) {
        if (b - a < 0.1) continue;
        const m = (a + b) / 2, L = b - a;
        const px = s.horiz ? s.cx + m : s.cx, pz = s.horiz ? s.cz : s.cz + m;
        batch.add(G.box, wall, { x: px, y: y + h / 2, z: pz, sx: s.horiz ? L : t, sy: h, sz: s.horiz ? t : L });
        col.addBox(px, pz, (s.horiz ? L : t) / 2, (s.horiz ? t : L) / 2, 0, 'dungeon');
      }
    }
  }

  torch(group, batch, x, y, z, color = 0xffa040, intensity = 60, distance = 26) {
    const M = this.game.materials;
    batch.add(G.cyl6, M.woodDark, { x, y: y - 0.25, z, sx: 0.05, sy: 0.5, sz: 0.05 });
    const flame = new THREE.Mesh(G.cone8, new THREE.MeshBasicMaterial({ color }));
    flame.scale.set(0.09, 0.25, 0.09);
    flame.position.set(x, y + 0.1, z);
    group.add(flame);
    const light = new THREE.PointLight(color, intensity, distance, 1.6);
    light.position.set(x, y + 0.3, z);
    group.add(light);
    this.flames.push({ flame, light, base: intensity, phase: this.rnd() * 10 });
  }

  exit(areaId, x, y, z, label) {
    this.game.interactions.register({
      id: `${areaId}-exit`, label, area: areaId, radius: 2.8,
      position: { x, y: y + 1, z },
      onInteract: (g) => g.enterArea('overworld'),
    });
  }

  ladder(batch, x, y, z, height) {
    const M = this.game.materials;
    for (const s of [-0.3, 0.3]) batch.add(G.box, M.iron, { x: x + s, y: y + height / 2, z, sx: 0.06, sy: height, sz: 0.06 });
    for (let k = 0.3; k < height; k += 0.35) batch.add(G.box, M.iron, { x, y: y + k, z, sx: 0.6, sy: 0.04, sz: 0.04 });
  }

  makeArea(def) {
    const group = new THREE.Group();
    group.name = def.id;
    group.visible = false;
    this.game.scene.add(group);
    this.flames = this.flames || [];
    const area = { ...def, group, flames: [] };
    this.areas[def.id] = area;
    return area;
  }

  // ---------- Sede secreta (sob a igreja da Vila Renascimento) ----------
  buildSede() {
    const M = this.game.materials;
    const ren = this.game.villages.renascimento;
    const X = 3000, Z = 0, Y = -400;
    this.flames = [];
    const area = this.makeArea({
      id: 'sedeKKK', name: 'Sede secreta — sob a igreja', floorY: Y,
      spawn: { x: X, z: Z + 15, facing: Math.PI },
      returnTo: { x: ren.x + 2.6, z: ren.z + 2.6, facing: 0.8 },
    });
    const batch = new StaticBatcher();
    // Poço de acesso (sala sul) → corredor → salão (norte)
    this.room(batch, { x: X, z: Z + 16, w: 6, d: 6, y: Y, h: 3, floor: M.stoneDark, wall: M.stone }, [{ side: 'n', at: 0, width: 2 }]);
    this.room(batch, { x: X, z: Z + 6, w: 3, d: 14, y: Y, h: 2.6, floor: M.stoneDark, wall: M.stone }, [{ side: 'n', at: 0, width: 2 }, { side: 's', at: 0, width: 2 }]);
    this.room(batch, { x: X, z: Z - 14, w: 24, d: 26, y: Y, h: 5, floor: M.cobble, wall: M.stoneDark }, [{ side: 's', at: 0, width: 2 }]);
    this.ladder(batch, X, Y, Z + 18.6, 3);
    this.exit('sedeKKK', X, Y, Z + 18, 'Subir pelo poço');

    // Salão: mesa longa, cadeiras, mantos pendurados, arquivos
    batch.add(G.box, M.woodDark, { x: X, y: Y + 0.8, z: Z - 14, sx: 2.2, sy: 0.1, sz: 12 });
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
      batch.add(G.box, M.wood, { x: X + s * 1.6, y: Y + 0.45, z: Z - 19 + i * 2, sx: 0.5, sy: 0.08, sz: 0.5 });
      batch.add(G.box, M.wood, { x: X + s * 1.85, y: Y + 0.85, z: Z - 19 + i * 2, sx: 0.06, sy: 0.8, sz: 0.5 });
    }
    this.game.collisions.addBox(X, Z - 14, 2, 6.5, 0, 'table');
    for (let i = 0; i < 8; i++) {
      const z = Z - 24 + i * 2.2;
      batch.add(G.cone, M.whitePaint, { x: X - 11.2, y: Y + 1.3, z, sx: 0.45, sy: 1.8, sz: 0.35 });
      batch.add(G.cyl6, M.woodDark, { x: X - 11.5, y: Y + 2.3, z, rz: Math.PI / 2, sx: 0.04, sy: 0.6, sz: 0.04 });
    }
    for (let i = 0; i < 5; i++) {
      batch.add(G.box, M.woodDark, { x: X + 11.3, y: Y + 1, z: Z - 24 + i * 2.2, sx: 0.8, sy: 2, sz: 1.6 });
    }
    // Escada interditada que sobe para a igreja
    for (let i = 0; i < 6; i++) batch.add(G.box, M.stone, { x: X, y: Y + 0.15 + i * 0.3, z: Z - 26.2 + i * 0.35, sx: 3, sy: 0.3, sz: 0.4 });
    batch.add(G.box, M.iron, { x: X, y: Y + 3, z: Z - 26.8, sx: 2.4, sy: 2.6, sz: 0.15 });

    for (const [tx, tz] of [[-11.4, -4], [11.4, -4], [-11.4, -22], [11.4, -22]]) this.torch(area.group, batch, X + tx, Y + 2.6, Z + tz);
    this.torch(area.group, batch, X + 2.6, Y + 2.2, Z + 16);

    const reg = (id, label, x, z, fn) => this.game.interactions.register({ id, label, area: 'sedeKKK', radius: 2.6, position: { x, y: Y + 1, z }, onInteract: fn });
    reg('kkk-docs', 'Ler os documentos', X + 0.8, Z - 10, (g) => g.ui.dialogue.open({
      speaker: 'Documentos', title: 'Sede secreta',
      text: 'Listas com nomes de moradores das quatro vilas, mapas das pontes de Renascimento e cartas trocadas com alguém '
        + 'na Bússola do Sul. Uma delas termina com: "o padre garante que ninguém olha para o poço".',
      options: [{ label: 'Guardar na memória', onSelect: () => { g.flags.readKkkDocs = true; g.ui.toast('Você descobriu a sede secreta.'); } }],
    }));
    reg('kkk-porta', 'Porta de ferro', X, Z - 25.6, (g) => g.ui.dialogue.open({
      speaker: 'Porta de ferro', text: 'Trancada pelo outro lado. Pelas frestas você ouve um órgão: a escada sobe direto para a igreja.',
      options: [{ label: 'Sair' }],
    }));

    batch.build(area.group, { castShadow: false, receiveShadow: false });
    area.flames = this.flames;
  }

  // ---------- Holocausto (sob a Praça da Saudade) ----------
  buildHolocausto() {
    const M = this.game.materials;
    const per = this.game.villages.perseguicao;
    const X = 3000, Z = 400, Y = -600;
    this.flames = [];
    const cfg = GAMEPLAY.holocausto;
    const area = this.makeArea({
      id: 'holocausto', name: 'Holocausto — sob a Praça da Saudade', floorY: Y,
      spawn: { x: X, z: Z + 19, facing: Math.PI },
      returnTo: { x: per.x + 8, z: per.z - 8, facing: 0 },
      onEnter: (g) => {
        g.state.addEffect('reliquias_potencializadas');
        g.state.addParanormalExposure(cfg.paranormalExposure);
        g.ui.toast(`Relíquias +${Math.round(cfg.relicBonus * 100)}% por ${cfg.buffDuration} s · Exposição paranormal +${cfg.paranormalExposure}%`);
      },
    });
    const batch = new StaticBatcher();
    this.room(batch, { x: X, z: Z, w: 14, d: 50, y: Y, h: 4, floor: M.dirt, wall: M.stoneDark, ceil: M.rubble });
    this.ladder(batch, X, Y, Z + 24.4, 4);
    this.exit('holocausto', X, Y, Z + 23.6, 'Subir a escada');

    // Corredor de lápides e velas
    for (let i = 0; i < 18; i++) {
      for (const s of [-1, 1]) {
        const z = Z + 18 - i * 2.2;
        const h = 0.5 + this.rnd() * 0.5;
        batch.add(G.box, M.stone, { x: X + s * 5.4, y: Y + h / 2, z, ry: (this.rnd() - 0.5) * 0.2, sx: 0.7, sy: h, sz: 0.18 });
        if (this.rnd() < 0.4) batch.add(G.cyl6, M.whitePaint, { x: X + s * 4.8, y: Y + 0.1, z: z + 0.3, sx: 0.04, sy: 0.2, sz: 0.04 });
      }
    }
    // Ossuário: pedras empilhadas
    for (let i = 0; i < 40; i++) {
      batch.add(G.rock, M.rubble, { x: X + (this.rnd() - 0.5) * 12, y: Y + 0.15, z: Z - 22 + this.rnd() * 4, sx: 0.4, sy: 0.25, sz: 0.35 });
    }
    // Altar da relíquia
    batch.add(G.box, M.stoneDark, { x: X, y: Y + 0.5, z: Z - 18, sx: 3, sy: 1, sz: 1.6 });
    this.game.collisions.addBox(X, Z - 18, 1.5, 0.8, 0, 'altar');
    const relic = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), M.eerie);
    relic.position.set(X, Y + 1.5, Z - 18);
    area.group.add(relic);
    area.relic = relic;
    const glow = new THREE.PointLight(0x9a6aff, 50, 20, 1.5);
    glow.position.set(X, Y + 1.8, Z - 18);
    area.group.add(glow);

    for (let i = 0; i < 4; i++) this.torch(area.group, batch, X + (i % 2 ? 6.4 : -6.4), Y + 2.4, Z + 15 - i * 9, 0xff8a3a, 45, 20);

    this.game.interactions.register({
      id: 'holocausto-altar', label: 'Tocar a relíquia', area: 'holocausto', radius: 2.8,
      position: { x: X, y: Y + 1.2, z: Z - 16.6 },
      onInteract: (g) => g.ui.dialogue.open({
        speaker: 'Relíquia', title: 'Holocausto',
        text: `A pedra pulsa no ritmo do seu coração. Poder das relíquias atual: ${Math.round(g.state.relicPower * 100)}%. `
          + `Exposição paranormal: ${g.state.paranormalExposure}%.`,
        options: [{ label: 'Afastar a mão' }],
      }),
    });

    batch.build(area.group, { castShadow: false, receiveShadow: false });
    area.flames = this.flames;
  }

  /** Mostra só a área ativa e anima as chamas. */
  update(dt, time, activeId) {
    for (const a of Object.values(this.areas)) {
      a.group.visible = a.id === activeId;
      if (!a.group.visible) continue;
      for (const f of a.flames) {
        const k = 0.8 + Math.sin(time * 11 + f.phase) * 0.12 + Math.sin(time * 23 + f.phase * 2) * 0.08;
        f.light.intensity = f.base * k;
        f.flame.scale.y = 0.25 * k;
      }
      if (a.relic) { a.relic.rotation.y += dt * 0.8; a.relic.position.y = a.floorY + 1.5 + Math.sin(time * 1.5) * 0.08; }
    }
  }
}
