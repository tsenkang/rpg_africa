/**
 * Posição de um ponto do mundo no canvas do minimapa (norte para cima: +x → direita, +z → baixo).
 * Fora do quadro, prende na borda (com `margin`) para virar um indicador de direção.
 *
 * @param {number} dx x do alvo − x do jogador (m)
 * @param {number} dz z do alvo − z do jogador (m)
 * @param {number} k pixels por metro
 * @param {number} S lado do canvas (px)
 * @param {number} [margin] px da borda para o indicador preso
 * @returns {{ x: number, y: number, clamped: boolean }}
 */
export function minimapPoint(dx, dz, k, S, margin = 10) {
  const h = S / 2, x = dx * k, y = dz * k, lim = h - margin;
  const m = Math.max(Math.abs(x), Math.abs(y));
  if (m <= lim) return { x: h + x, y: h + y, clamped: false };
  const s = lim / m; // encolhe na mesma direção até tocar o quadrado interno
  return { x: h + x * s, y: h + y * s, clamped: true };
}
