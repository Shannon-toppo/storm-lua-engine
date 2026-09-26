import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('./web',import.meta.url)),base:'./',publicDir:fileURLToPath(new URL('./public',import.meta.url)),build:{outDir:fileURLToPath(new URL('./dist',import.meta.url)),emptyOutDir:true},worker:{format:'es'},server:{port:5178},preview:{port:4178}});
