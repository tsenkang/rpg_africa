/**
 * ALT alterna a trava do cursor **ao pressionar** (não ao soltar): em
 * navegadores/apps onde o ALT abre o menu, o `keyup` às vezes nem chega.
 * Repetição automática (segurar ALT) e combinações com outras teclas
 * segurando ALT (Alt+Tab…) não alternam de novo.
 */
export class AltLockToggle {
  constructor() {
    this.held = false;
  }

  static isAlt(code) {
    return code === 'AltLeft' || code === 'AltRight';
  }

  /**
   * @param {string} code `event.code`
   * @param {boolean} [repeat] `event.repeat`
   * @returns {boolean} true quando deve alternar a trava (ALT recém-pressionado).
   */
  keyDown(code, repeat = false) {
    if (!AltLockToggle.isAlt(code)) return false;
    if (this.held || repeat) return false;
    this.held = true;
    return true;
  }

  /** @returns {boolean} true se a tecla era ALT (o evento deve ter preventDefault). */
  keyUp(code) {
    if (!AltLockToggle.isAlt(code)) return false;
    this.held = false;
    return true;
  }

  /** Janela perdeu o foco (ex.: Alt+Tab): esquece o ALT segurado. */
  reset() {
    this.held = false;
  }
}

/**
 * Teclado + mouse.
 * - isDown(code): tecla segurada
 * - pressed(code): tecla apertada neste quadro (zerado em endFrame)
 * - mouse: delta de movimento (com pointer lock) e roda
 * - attackPressed(): clique esquerdo neste quadro. Com o cursor travado,
 *   todo clique é ataque; sem trava, um clique curto sem arrastar (menos de
 *   `CLICK_MS` e `CLICK_PX`) é ataque e arrastar gira a câmera.
 * - Trava do cursor: SÓ a tecla ALT (ALT de novo ou Esc soltam). Clicar na
 *   tela não trava.
 * - onLockChange(fn): avisa `fn(locked, error?)` quando a trava muda ou falha.
 */
export class Input {
  /** Clique mais curto que isto (ms) e que se move menos que CLICK_PX conta como soco, não arrasto. */
  static CLICK_MS = 260;
  static CLICK_PX = 6;

  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.enabled = true;
    this.attackClick = false;
    this.alt = new AltLockToggle();
    this.lockListeners = [];

    window.addEventListener('keydown', (e) => {
      // Digitando num campo de texto (busca do livro de receitas): o jogo não vê a tecla, só o Esc.
      if (Input.isTyping(e.target) && e.code !== 'Escape') return;
      if (AltLockToggle.isAlt(e.code)) e.preventDefault(); // ALT não abre o menu do navegador
      if (this.alt.keyDown(e.code, e.repeat) && this.enabled) this.toggleLock();
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (this.alt.keyUp(e.code)) e.preventDefault();
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.alt.reset();
    });

    document.addEventListener('pointerlockchange', () => this.emitLock(this.locked));
    document.addEventListener('pointerlockerror', () => this.emitLock(false, new Error('O navegador recusou travar o cursor.')));

    // Sem trava (ou se o navegador recusar, ex.: página embutida), arrastar
    // com o botão esquerdo/direito também gira a câmera.
    this.dragging = false;
    this._down = null; // { t, x, y, button } do último mousedown no canvas
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || (e.button !== 0 && e.button !== 2)) return;
      if (e.button === 0 && this.locked) {
        this.attackClick = true;
        return;
      }
      this._down = { t: performance.now(), x: e.clientX, y: e.clientY, button: e.button };
      this.dragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      this.dragging = false;
      const d = this._down;
      this._down = null;
      // Clique curto, sem arrastar, com o botão esquerdo = soco (mesmo sem trava).
      if (d && d.button === 0 && e.button === 0 && this.enabled && !this.locked
        && performance.now() - d.t < Input.CLICK_MS && Math.hypot(e.clientX - d.x, e.clientY - d.y) < Input.CLICK_PX) {
        this.attackClick = true;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.dragging) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  /** O alvo do evento é um campo de texto (input, textarea, contenteditable)? */
  static isTyping(target) {
    const tag = target?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target?.isContentEditable;
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  unlock() {
    this.unlockedByGame = performance.now(); // diferencia do Esc do navegador (que solta sozinho)
    if (this.locked) document.exitPointerLock();
  }

  /** Trava o cursor no centro da tela (chamado pela tecla ALT). */
  lock() {
    if (this.locked) return;
    this._lockErrorSent = false;
    try {
      const p = this.canvas.requestPointerLock?.();
      p?.catch?.((err) => this.emitLock(false, err));
    } catch (err) {
      this.emitLock(false, err);
    }
  }

  /** ALT: trava se estiver solto, solta se estiver travado. */
  toggleLock() {
    if (this.locked) this.unlock();
    else this.lock();
  }

  /** Chama `fn(locked, error?)` quando o cursor trava, solta ou a trava falha. */
  onLockChange(fn) {
    this.lockListeners.push(fn);
  }

  emitLock(locked, error) {
    // A recusa chega duas vezes (evento 'pointerlockerror' + promise rejeitada):
    // avisa só uma por tentativa.
    if (error) {
      if (this._lockErrorSent) return;
      this._lockErrorSent = true;
    }
    for (const fn of this.lockListeners) fn(locked, error);
  }

  isDown(code) {
    return this.enabled && this.keys.has(code);
  }

  pressed(code) {
    return this.justPressed.has(code);
  }

  /** Clique esquerdo neste quadro com o cursor travado (pointer lock). */
  attackPressed() {
    return this.enabled && this.attackClick;
  }

  /** Chamar no fim de cada quadro. */
  endFrame() {
    this.justPressed.clear();
    this.attackClick = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
