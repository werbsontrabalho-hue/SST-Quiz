// ============================================================================
// CONFIGURAÇÃO DO VITE (vite.config.ts)
// ----------------------------------------------------------------------------
// O Vite é a ferramenta que compila e serve o app em desenvolvimento.
// Este arquivo configura os plugins, atalhos de import e o servidor local.
// ============================================================================

import tailwindcss from '@tailwindcss/vite'; // plugin que processa o Tailwind CSS
import react from '@vitejs/plugin-react'; // plugin que dá suporte ao React (hot reload)
import path from 'path'; // utilitário nativo do Node para trabalhar com caminhos
import {defineConfig} from 'vite'; // função que tipa a configuração do Vite

// Exporta a configuração do Vite para a ferramenta usar.
// Capacitor: o app nativo serve os arquivos de `dist` (webDir), então o build
// precisa gerar caminhos RELATIVOS (base './') — na Web o comportamento é igual.
export default defineConfig(() => {
  return {
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss()], // ativa os plugins de React e Tailwind
    resolve: {
      alias: {
        // Permite importar arquivos usando '@/' no lugar do caminho completo,
        // ex.: import App from '@/App' em vez de import App from './App'.
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Hot Module Replacement (recarregamento automático de página ao editar código).
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Desativa a observação de arquivos quando DISABLE_HMR é true (economiza CPU
      // durante edições feitas por agentes de IA).
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
