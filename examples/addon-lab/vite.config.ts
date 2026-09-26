import { defineConfig } from 'vite';

// サブディレクトリにも配信できるよう、生成アセットのURLは相対パスにします。
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false, rollupOptions: { output: { manualChunks(id) { if(id.includes('/node_modules/three/')) return 'three'; if(/node_modules\/(?:@codemirror|@lezer|codemirror)/.test(id)) return 'editor'; } } } },
  server: { port: 5178, strictPort: true },
  preview: { port: 4178, strictPort: true },
});
