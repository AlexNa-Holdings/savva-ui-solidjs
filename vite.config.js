// vite.config.js
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  envPrefix: ["VITE_", "OPENAI_"],
  server: {
    port: 5173,
  },
  build: {
    target: 'esnext',
  },
});
