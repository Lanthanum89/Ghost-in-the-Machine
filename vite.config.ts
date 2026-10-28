import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves the site from /Ghost-in-the-Machine/, so builds and the preview of a build need that base.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/Ghost-in-the-Machine/' : '/',
  plugins: [react(), tailwindcss()],
  // Only OLLAMA_* and VITE_* reach the browser. HA_TOKEN must never be exposed.
  envPrefix: ['VITE_', 'OLLAMA_'],
  test: { include: ['src/**/*.test.ts'] },
}));
