import './style.css';
import { Game } from './core/Game.js';

const game = new Game(document.body);
game.start();
game.init().catch((err) => {
  console.error(err);
  const step = document.querySelector('.loading-step');
  if (step) step.textContent = `Erro ao gerar o mundo: ${err.message}`;
});
window.game = game; // depuração no console
/** Teste rápido da hotbar no console: adicionarItem({ id: 'faca', nome: 'Faca', icone: '🔪' }) */
window.adicionarItem = (item) => game.adicionarItem(item);
