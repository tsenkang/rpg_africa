/** Câmera: 3ª pessoa (atrás e acima) ou 1ª pessoa (olhos). Tecla C alterna. */
export const CAMERA = {
  startMode: 'third', // 'third' | 'first'
  fov: 62, // graus, andando
  sprintFov: 72, // graus, correndo (Shift) — abre suavemente
  fovLerp: 6, // velocidade da interpolação do FOV (1/s)
  /** Balanço da câmera ao andar/correr (head bobbing). freq em ciclos/s (2 quiques por ciclo), amp em metros. */
  bob: {
    first: { walkFreq: 1.5, walkAmp: 0.028, runFreq: 1.75, runAmp: 0.055, sideRatio: 0.5 },
    third: { walkFreq: 1.5, walkAmp: 0.008, runFreq: 1.75, runAmp: 0.02, sideRatio: 0.3 },
  },
  sensitivity: 0.0024, // rad por pixel de mouse (com o cursor travado)
  keyTurnSpeed: 2.2, // rad/s com ← → / Q R
  third: {
    distance: 6.5, minDistance: 2.5, maxDistance: 40, flyMaxDistance: 400, undergroundMaxDistance: 3.2,
    pitch: 0.32, minPitch: -0.35, maxPitch: 1.35, // rad (positivo = câmera acima, olhando para baixo)
    focusHeight: 1.55, // m acima dos pés (para onde a câmera olha)
  },
  first: {
    eyeHeight: 1.66, // m acima dos pés (personagem de 1,80 m)
    forwardOffset: 0.12, // m à frente do centro da cabeça
    maxPitch: 1.45, // rad para cima/baixo
  },
};
