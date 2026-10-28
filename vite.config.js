import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE=/ritmo/ no GitHub Pages; './' no APK (Capacitor serve os arquivos localmente).
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react()],
  build: { target: 'es2019', sourcemap: false },
});
