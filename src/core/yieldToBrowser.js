/**
 * Devolve o controle ao navegador por um instante (para a tela de
 * carregamento atualizar). Usa MessageChannel, que não é estrangulado
 * em abas de fundo como setTimeout/requestAnimationFrame.
 *
 * Exemplo: `for (...) { trabalho(); if (deadline()) await yieldToBrowser(); }`
 */
const channel = new MessageChannel();
const queue = [];
channel.port1.onmessage = () => queue.shift()?.();

export function yieldToBrowser() {
  return new Promise((resolve) => {
    queue.push(resolve);
    channel.port2.postMessage(0);
  });
}
