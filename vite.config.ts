import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Vocalpsianalise/',
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
