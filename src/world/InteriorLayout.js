/**
 * Planta e mobília de um interior (lógica pura, testável em Node).
 *
 * Coordenadas LOCAIS da casa: x de −hw a +hw, z de −hd a +hd, a porta fica
 * no meio da parede da frente (z = +hd). Tudo em metros.
 *
 * 1. Tamanho decide os cômodos:
 *    - pequena (< 28 m² úteis) ou cabana redonda: 1 cômodo (`single`)
 *    - média: sala na frente + quarto e cozinha atrás (2–3 cômodos)
 *    - sobrado (2 andares): térreo = sala + cozinha; em cima = 1–2 quartos
 * 2. Caminhos livres (`keepOut`): faixa da porta até o meio da casa, os vãos
 *    das divisórias e a faixa da escada. Nenhum móvel (fora tapete) entra aí.
 * 3. Móveis: cada um tenta até 24 lugares — encostado numa parede livre
 *    (de costas para ela) ou solto no cômodo — e só fica se cabe no cômodo,
 *    não invade caminho e não encosta noutro móvel (folga de 0,12 m).
 *    Cadeiras/almofadas vão em volta da mesa. Tochas ficam na parede.
 */

const GAP = 1.0; // vão das divisórias (m)
const CLEAR = 0.12; // folga entre móveis

/** Retângulo [x0, z0, x1, z1] em coordenadas locais. */
const rect = (x0, z0, x1, z1) => ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
const inside = (a, r) => a.x0 >= r.x0 - 1e-6 && a.x1 <= r.x1 + 1e-6 && a.z0 >= r.z0 - 1e-6 && a.z1 <= r.z1 + 1e-6;

/** Pegada (retângulo) de um móvel de tamanho [w, d] em (x, z) girado `rot` (múltiplos de 90°). */
export function footprint(size, x, z, rot) {
  const q = Math.round(rot / (Math.PI / 2)) & 1;
  const w = q ? size[1] : size[0], d = q ? size[0] : size[1];
  return rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
}

/**
 * Categoria pelo tamanho e andares.
 * @returns {'small'|'medium'|'large'}
 */
export function interiorCategory({ w, d, stories = 1, round = 0 }) {
  if (stories > 1) return 'large';
  if (round || w * d < 28 || Math.min(w, d) < 3.6) return 'small';
  return 'medium';
}

/**
 * Cômodos, divisórias e caminhos livres.
 * @param {{w:number, d:number, stories?:number, stair?:{lx:number,w:number}|null, round?:number}} desc
 *   w/d = medidas INTERNAS (paredes já descontadas)
 */
export function planRooms(desc) {
  const hw = desc.w / 2, hd = desc.d / 2;
  const cat = interiorCategory(desc);
  const rooms = [], partitions = [], keepOut = [];
  // Entrada: da porta até um pouco além do meio.
  keepOut.push({ ...rect(-0.65, Math.max(-hd, hd - Math.max(1.6, desc.d * 0.55)), 0.65, hd), floor: 0 });
  const stairX = desc.stair ? [desc.stair.lx - desc.stair.w / 2 - 0.1, desc.stair.lx + desc.stair.w / 2 + 0.1] : null;
  if (stairX) for (const f of [0, 1]) keepOut.push({ ...rect(stairX[0], -hd, stairX[1], hd), floor: f });

  if (cat === 'small') {
    rooms.push({ type: 'single', floor: 0, ...rect(-hw, -hd, hw, hd) });
  } else if (cat === 'medium') {
    const zs = -hd + desc.d * 0.45;
    rooms.push({ type: 'living', floor: 0, ...rect(-hw, zs, hw, hd) });
    if (desc.w >= 4.6) {
      rooms.push({ type: 'bedroom', floor: 0, ...rect(-hw, -hd, 0, zs) });
      rooms.push({ type: 'kitchen', floor: 0, ...rect(0, -hd, hw, zs) });
      for (const gx of [-hw / 2, hw / 2]) {
        partitions.push({ floor: 0, ax: gx < 0 ? -hw : gx + GAP / 2, az: zs, bx: gx < 0 ? gx - GAP / 2 : hw, bz: zs });
        keepOut.push({ ...rect(gx - GAP / 2 - 0.1, zs - 0.9, gx + GAP / 2 + 0.1, zs + 0.9), floor: 0 });
      }
      partitions.push({ floor: 0, ax: -hw / 2 + GAP / 2, az: zs, bx: hw / 2 - GAP / 2, bz: zs });
      partitions.push({ floor: 0, ax: 0, az: -hd, bx: 0, bz: zs });
      keepOut.push({ ...rect(-hw / 2, zs, hw / 2, zs + 1.0), floor: 0 }); // corredor em frente às portas
    } else {
      rooms.push({ type: 'bedroom', floor: 0, ...rect(-hw, -hd, hw, zs) });
      partitions.push({ floor: 0, ax: -hw, az: zs, bx: -GAP / 2, bz: zs });
      partitions.push({ floor: 0, ax: GAP / 2, az: zs, bx: hw, bz: zs });
      keepOut.push({ ...rect(-GAP / 2 - 0.1, zs - 0.9, GAP / 2 + 0.1, zs + 0.9), floor: 0 });
    }
  } else {
    // Sobrado: o que sobra fora da faixa da escada.
    const x0 = stairX ? stairX[1] : -hw;
    const zs = -hd + desc.d * 0.45;
    rooms.push({ type: 'living', floor: 0, ...rect(x0, zs, hw, hd) });
    rooms.push({ type: 'kitchen', floor: 0, ...rect(x0, -hd, hw, zs) });
    const gx = (x0 + hw) / 2;
    partitions.push({ floor: 0, ax: x0, az: zs, bx: gx - GAP / 2, bz: zs });
    partitions.push({ floor: 0, ax: gx + GAP / 2, az: zs, bx: hw, bz: zs });
    keepOut.push({ ...rect(gx - GAP / 2 - 0.1, zs - 0.9, gx + GAP / 2 + 0.1, zs + 0.9), floor: 0 });
    // Andar de cima: um ou dois quartos lado a lado; chegada da escada no fundo.
    keepOut.push({ ...rect(x0, -hd, x0 + 1.1, hd), floor: 1 });
    if (hw - x0 >= 5) {
      const mx = (x0 + 1.1 + hw) / 2;
      rooms.push({ type: 'bedroom', floor: 1, ...rect(x0 + 1.1, -hd, mx, hd) });
      rooms.push({ type: 'bedroom', floor: 1, ...rect(mx, -hd, hw, hd) });
      partitions.push({ floor: 1, ax: mx, az: -hd, bx: mx, bz: hd - GAP - 0.2 });
      keepOut.push({ ...rect(mx - 0.8, hd - GAP - 0.3, mx + 0.8, hd), floor: 1 });
    } else {
      rooms.push({ type: 'bedroom', floor: 1, ...rect(x0 + 1.1, -hd, hw, hd) });
    }
  }
  return { category: cat, rooms, partitions, keepOut, hw, hd };
}

/**
 * Lista de móveis de um cômodo (quantidades sorteadas, trocas por estilo).
 * @param {string} type tipo do cômodo
 * @param {object} catalog { ROOM_FURNITURE, STYLE_SWAPS, styles }
 * @param {string} style
 * @param {() => number} rng
 * @returns {string[]}
 */
export function roomItems(type, { ROOM_FURNITURE, STYLE_SWAPS, styles }, style, rng) {
  const out = [];
  const swaps = STYLE_SWAPS[style] ?? {};
  for (const [key, n] of Object.entries(ROOM_FURNITURE[type] ?? {})) {
    const count = Array.isArray(n) ? n[0] + Math.floor(rng() * (n[1] - n[0] + 1)) : n;
    let id = key === '$fire' ? styles[style]?.fire : key;
    if (!id) continue;
    if (styles[style]?.dark && (id === 'torch' || id === 'fireplace')) continue; // ruína: sem luz
    if (id === 'clayPot' && style !== 'desert' && style !== 'tropical' && rng() < 0.6) continue; // potes: mais comuns no deserto
    id = swaps[id] ?? id;
    for (let i = 0; i < count; i++) out.push(id);
  }
  return out;
}

/**
 * Planta completa com a mobília posicionada.
 * @param {object} desc medidas internas, andares, escada, estilo
 * @param {object} catalog { FURNITURE, ROOM_FURNITURE, STYLE_SWAPS, styles }
 * @param {() => number} rng determinístico por casa (mesma casa = mesma mobília)
 * @returns {{ category, rooms, partitions, keepOut, items: {type, x, z, rot, floor, y}[] }}
 */
export function planInterior(desc, catalog, rng) {
  const plan = planRooms(desc);
  const { FURNITURE } = catalog;
  const items = [];
  const placed = []; // pegadas ocupadas (por andar)
  const blocked = (fp, floor, isFloorOnly) => {
    if (!isFloorOnly && plan.keepOut.some((k) => k.floor === floor && overlap(fp, k))) return true;
    return placed.some((p) => p.floor === floor && (p.floorOnly === isFloorOnly) && overlap(fp, p, CLEAR));
  };
  const tryPlace = (id, room) => {
    const def = FURNITURE[id];
    if (!def) return false;
    if (def.mount !== undefined) return placeMounted(id, room, def);
    for (let t = 0; t < 24; t++) {
      let x, z, rot;
      if (def.wall) {
        const side = Math.floor(rng() * 4); // 0 fundo, 1 esquerda, 2 direita, 3 frente
        const half = Math.max(def.size[0], def.size[1]) / 2;
        if (side === 0 || side === 3) {
          x = room.x0 + half + rng() * Math.max(0, room.x1 - room.x0 - 2 * half);
          z = side === 0 ? room.z0 + def.size[1] / 2 + 0.03 : room.z1 - def.size[1] / 2 - 0.03;
          rot = side === 0 ? 0 : Math.PI;
        } else {
          z = room.z0 + half + rng() * Math.max(0, room.z1 - room.z0 - 2 * half);
          x = side === 1 ? room.x0 + def.size[1] / 2 + 0.03 : room.x1 - def.size[1] / 2 - 0.03;
          rot = side === 1 ? Math.PI / 2 : -Math.PI / 2;
        }
      } else {
        x = room.x0 + 0.5 + rng() * Math.max(0, room.x1 - room.x0 - 1);
        z = room.z0 + 0.5 + rng() * Math.max(0, room.z1 - room.z0 - 1);
        rot = rng() < 0.5 ? 0 : Math.PI / 2;
      }
      const fp = footprint(def.size, x, z, rot);
      if (!inside(fp, room) || blocked(fp, room.floor, !!def.floor)) continue;
      placed.push({ ...fp, floor: room.floor, floorOnly: !!def.floor });
      items.push({ type: id, x, z, rot, floor: room.floor, y: 0 });
      return true;
    }
    return false;
  };
  // Tocha: na parede (fundo ou lados), a `mount` m de altura, fora do vão da porta.
  const placeMounted = (id, room, def) => {
    for (let t = 0; t < 12; t++) {
      const side = Math.floor(rng() * 3);
      let x, z, rot;
      if (side === 0) { x = room.x0 + 0.3 + rng() * (room.x1 - room.x0 - 0.6); z = room.z0 + 0.02; rot = 0; } else {
        z = room.z0 + 0.3 + rng() * (room.z1 - room.z0 - 0.6);
        x = side === 1 ? room.x0 + 0.02 : room.x1 - 0.02;
        rot = side === 1 ? Math.PI / 2 : -Math.PI / 2;
      }
      if (plan.keepOut.some((k) => k.floor === room.floor && overlap(rect(x - 0.2, z - 0.2, x + 0.2, z + 0.2), k))) continue;
      items.push({ type: id, x, z, rot, floor: room.floor, y: def.mount });
      return true;
    }
    return false;
  };
  // Cadeiras/almofadas em volta da mesa colocada no cômodo.
  const aroundTable = (id, room) => {
    const table = [...items].reverse().find((it) => it.floor === room.floor && (it.type === 'table' || it.type === 'lowTable')
      && it.x >= room.x0 && it.x <= room.x1 && it.z >= room.z0 && it.z <= room.z1);
    if (!table) return tryPlace(id, room);
    const tdef = FURNITURE[table.type], def = FURNITURE[id];
    const q = Math.round(table.rot / (Math.PI / 2)) & 1;
    const tw = q ? tdef.size[1] : tdef.size[0], td = q ? tdef.size[0] : tdef.size[1];
    const spots = [[0, td / 2 + 0.35, Math.PI], [0, -td / 2 - 0.35, 0], [tw / 2 + 0.35, 0, -Math.PI / 2], [-tw / 2 - 0.35, 0, Math.PI / 2]];
    for (let k = 0; k < spots.length; k++) {
      const [ox, oz, rot] = spots[(k + Math.floor(rng() * 4)) % 4];
      const x = table.x + ox, z = table.z + oz;
      const fp = footprint(def.size, x, z, rot);
      if (!inside(fp, room) || blocked(fp, room.floor, false)) continue;
      placed.push({ ...fp, floor: room.floor, floorOnly: false });
      items.push({ type: id, x, z, rot, floor: room.floor, y: 0 });
      return true;
    }
    return tryPlace(id, room); // sem espaço em volta da mesa: em outro canto do cômodo
  };

  for (const room of plan.rooms) {
    const list = roomItems(room.type, catalog, desc.style, rng);
    // Grandes primeiro (cama, armário, lareira), assentos depois da mesa, tapete por último.
    const order = (id) => (id === 'rug' ? 3 : id === 'chair' || id === 'cushion' ? 2 : FURNITURE[id]?.wall ? 0 : 1);
    list.sort((a, b) => order(a) - order(b));
    for (const id of list) (id === 'chair' || id === 'cushion' ? aroundTable : tryPlace)(id, room);
  }
  // Ruínas: teias nos cantos do teto.
  if (desc.style === 'ruin') {
    for (const room of plan.rooms) {
      for (const [x, z, rot] of [[room.x0, room.z0, 0], [room.x1, room.z0, -Math.PI / 2], [room.x0, room.z1, Math.PI / 2]]) {
        if (rng() < 0.75) items.push({ type: 'cobweb', x: x + (x < 0 ? 0.3 : -0.3), z: z + (z < 0 ? 0.3 : -0.3), rot, floor: room.floor, y: 'ceiling' });
      }
    }
  }
  return { ...plan, items };
}
