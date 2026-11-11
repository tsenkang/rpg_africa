import { SLOPE } from '../../config/physics.js';

/**
 * Limite de inclinação (Max Slope 45°) — regras puras, sem Three.js e sem alocação.
 *
 * **Normal da superfície.** O chão aberto é um mapa de alturas: o "raycast
 * para baixo" a partir dos pés cairia num triângulo cuja normal vem das alturas
 * vizinhas. Calculamos essa normal direto por diferenças centrais
 * (4 leituras de `heightAt`, O(1)), suavizada em ±`e` metros para não piscar
 * nas arestas dos triângulos:
 *
 *     N = normalize(−∂h/∂x, 1, −∂h/∂z)        cos θ = N · UP = N.y
 *
 * θ > 45°  ⇔  N.y < cos 45° (0,7071)  ⇒  superfície íngreme (inacessível).
 * A parte horizontal (N.x, N.z) aponta **morro abaixo**.
 *
 * @example
 *   const n = surfaceNormal(terrain.heightAt, x, z, SLOPE.normalSample, out);
 *   if (isUnwalkable(n)) blockUphill(dx, dz, n, out2);
 *   const d = slide.update(dt, n, isUnwalkable(n));  // deslocamento de escorregar
 */

/** Ângulo da superfície com a horizontal (graus). */
export function slopeAngleDeg(n) {
  return (Math.acos(Math.min(1, Math.max(-1, n.y))) * 180) / Math.PI;
}

/**
 * Normal (unitária) do terreno em (x, z).
 * @param {(x: number, z: number) => number} heightAt
 * @param {number} e meia-distância da amostra (m)
 * @param {{x:number,y:number,z:number}} out reaproveitado (sem alocação no loop)
 */
export function surfaceNormal(heightAt, x, z, e, out) {
  const sx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const sz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  const inv = 1 / Math.sqrt(sx * sx + 1 + sz * sz);
  out.x = -sx * inv; out.y = inv; out.z = -sz * inv;
  return out;
}

/** Íngreme demais para andar (θ > limite)? */
export function isUnwalkable(n, cosMax = SLOPE.cosMax) {
  return n.y < cosMax;
}

/**
 * Tira do deslocamento (dx, dz) a parte que sobe a encosta. O que anda de lado
 * (contorno) ou desce continua.
 * @returns {{dx:number, dz:number, uphill:boolean}} em `out`
 */
export function blockUphill(dx, dz, n, out) {
  const hl = Math.hypot(n.x, n.z);
  out.dx = dx; out.dz = dz; out.uphill = false;
  if (hl < 1e-9) return out;
  const ux = -n.x / hl, uz = -n.z / hl; // direção morro acima
  const up = dx * ux + dz * uz;
  if (up > 0) { out.dx = dx - up * ux; out.dz = dz - up * uz; out.uphill = true; }
  return out;
}

/**
 * Escorregamento: em superfície íngreme a gravidade projetada no plano,
 *   a = g − (g·N)N  →  parte horizontal = g · N.y · (N.x, N.z),
 * acelera o corpo morro abaixo (menos o atrito, até `maxSlideSpeed`). Em chão
 * andável a velocidade some em `settle`/s; abaixo de `stopSpeed` o corpo para.
 *
 * @example
 *   const slide = new SlideState();
 *   const { dx, dz } = slide.update(dt, n, isUnwalkable(n));
 *   collisions.move(pos, walkDx + dx, walkDz + dz, r);
 */
export class SlideState {
  constructor() {
    this.vx = 0;
    this.vz = 0;
    /** Escorregando (perdeu a aderência). */
    this.sliding = false;
    this._d = { dx: 0, dz: 0 };
  }

  /**
   * @param {number} dt
   * @param {{x:number,y:number,z:number}} n normal sob o corpo
   * @param {boolean} steep `isUnwalkable(n)`
   * @param {object} [cfg] `SLOPE`
   * @returns {{dx:number, dz:number}} deslocamento deste passo (objeto reaproveitado)
   */
  update(dt, n, steep, cfg = SLOPE) {
    if (steep) {
      const a = cfg.gravity * n.y * (1 - cfg.friction);
      this.vx += a * n.x * dt;
      this.vz += a * n.z * dt;
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > cfg.maxSlideSpeed) { this.vx *= cfg.maxSlideSpeed / sp; this.vz *= cfg.maxSlideSpeed / sp; }
    } else {
      const k = Math.exp(-cfg.settle * dt);
      this.vx *= k; this.vz *= k;
    }
    const sp = Math.hypot(this.vx, this.vz);
    if (!steep && sp < cfg.stopSpeed) { this.vx = 0; this.vz = 0; }
    this.sliding = steep || sp >= cfg.stopSpeed;
    this._d.dx = this.vx * dt;
    this._d.dz = this.vz * dt;
    return this._d;
  }

  /** Zera (teleporte, nado, voo). */
  reset() {
    this.vx = 0; this.vz = 0; this.sliding = false;
  }
}

const _n = { x: 0, y: 1, z: 0 };

/**
 * Steering de IA: se o caminho à frente (a `probeDist` m) sobe uma encosta
 * íngreme, gira a direção (±`steerAngles`, alternando lados) até achar uma que
 * não suba — o animal/NPC contorna a montanha em vez de escalar. Descer é livre.
 * @param {(x:number, z:number) => number} heightAt
 * @param {number} dx direção desejada (unitária)
 * @returns {{x:number, z:number, blocked:boolean}} em `out` (blocked = nenhuma serve: pare)
 */
export function steerAroundSlope(heightAt, x, z, dx, dz, cfg, out) {
  const ok = (cx, cz) => {
    const n = surfaceNormal(heightAt, x + cx * cfg.probeDist, z + cz * cfg.probeDist, cfg.normalSample, _n);
    return !(n.y < cfg.cosMax && cx * n.x + cz * n.z < 0); // íngreme E subindo = não
  };
  out.blocked = false;
  if (ok(dx, dz)) { out.x = dx; out.z = dz; return out; }
  for (const a of cfg.steerAngles) {
    for (const s of [1, -1]) {
      const c = Math.cos(a * s), si = Math.sin(a * s);
      const cx = dx * c - dz * si, cz = dx * si + dz * c;
      if (ok(cx, cz)) { out.x = cx; out.z = cz; return out; }
    }
  }
  out.x = 0; out.z = 0; out.blocked = true;
  return out;
}
