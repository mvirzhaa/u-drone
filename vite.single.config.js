// Build satu berkas HTML mandiri (bisa dibuka langsung tanpa server).
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({ base: './', plugins: [viteSingleFile()], build: { outDir: 'dist-single', emptyOutDir: true, chunkSizeWarningLimit: 2000 } });
