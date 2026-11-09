/**
 * Escadas de mão (verticais): torres de vigia, escadas de corda das casas
 * nas árvores, escadinha do terraço das casas de adobe. Puro (testável).
 *
 * Cada escada: { x, z } = pé da escada (no plano da escada), `nx, nz` =
 * para onde ela "olha" (de onde se sobe), `y0` pé, `y1` topo e `exit` =
 * onde o jogador fica ao chegar lá em cima (plataforma, terraço).
 * Degraus de madeira/pedra NÃO entram aqui: eles são `Surfaces` (o pé sobe
 * degrau por degrau sozinho).
 *
 * @example
 * ladders.add({ x, z, rot, y0: 0, y1: 9, exit: { x, z: z - 1, y: 9 } });
 * const l = ladders.find(player.position, moveDir); // agarrar se W
 */
export class Ladders {
  constructor() {
    this.all = [];
  }

  /**
   * @param {{ x:number, z:number, rot:number, y0:number, y1:number, exit:{x:number,y:number,z:number} }} l
   *   rot: rotação Y da escada (a frente — de onde se sobe — é +Z local)
   */
  add({ x, z, rot, y0, y1, exit }) {
    const l = { x, z, nx: Math.sin(rot), nz: Math.cos(rot), y0, y1, exit };
    this.all.push(l);
    return l;
  }

  /**
   * Escada que o jogador pode agarrar agora: perto (`reach`), com o pé na
   * altura da escada e andando em direção a ela (`moveDir` · direção > `facing`).
   * @param {{x:number,y:number,z:number}} pos pés do jogador
   * @param {{x:number,z:number}} moveDir direção do movimento (unitária)
   * @param {{ reach: number, facing: number }} cfg CLIMB
   * @returns {object|null}
   */
  find(pos, moveDir, cfg) {
    let best = null, bestD = cfg.reach;
    for (const l of this.all) {
      if (pos.y < l.y0 - 0.7 || pos.y > l.y1 + 0.4) continue;
      // Ponto onde o jogador fica: na frente da escada (embaixo) ou atrás do topo (em cima).
      const top = pos.y > l.y1 - 0.5;
      const px = l.x + l.nx * (top ? -0.6 : 0.35), pz = l.z + l.nz * (top ? -0.6 : 0.35);
      const d = Math.hypot(pos.x - px, pos.z - pz);
      if (d > bestD) continue;
      // Embaixo: andando contra a escada (−n). Em cima: andando para a borda (+n).
      const toward = top ? moveDir.x * l.nx + moveDir.z * l.nz : -(moveDir.x * l.nx + moveDir.z * l.nz);
      if (toward < cfg.facing) continue;
      best = l;
      bestD = d;
    }
    return best;
  }
}
