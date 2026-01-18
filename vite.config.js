// vite.config.js
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    solid(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@infolektuell/noto-color-emoji/files/*.woff2',
          dest: 'assets/files'
        }
      ]
    })
  ],
  envPrefix: ["VITE_", "OPENAI_"],
  server: {
    port: 5173,
  },
  build: {
    target: 'esnext',
  },
});
