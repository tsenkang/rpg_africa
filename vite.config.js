import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: o build funciona em qualquer pasta/servidor (e no artefato).
  base: './',
  server: { open: false },
  build: { chunkSizeWarningLimit: 1200 },
});
