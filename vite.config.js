import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        process: resolve(__dirname, 'process.html'),
        result: resolve(__dirname, 'result.html')
      }
    }
  }
});