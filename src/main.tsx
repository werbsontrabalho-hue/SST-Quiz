// ============================================================================
// ARQUIVO PRINCIPAL DO APP (main.tsx)
// ----------------------------------------------------------------------------
// É por aqui que o React "nasce": ele pega o elemento <div id="root">
// do index.html e monta o aplicativo inteiro dentro dele.
// ============================================================================

import {StrictMode} from 'react'; // StrictMode ativa checagens extras de desenvolvimento
import {createRoot} from 'react-dom/client'; // responsável por montar o React no navegador
import App from './App.tsx'; // componente raiz que contém toda a aplicação
import './index.css'; // estilos globais (Tailwind CSS)

// Monta o componente <App /> dentro do elemento com id="root" do index.html.
// O StrictMode é um auxiliar do React que ajuda a encontrar bugs em desenvolvimento.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Capacitor (Android/iOS): ajustes de StatusBar/Keyboard/app lifecycle.
// Import dinâmico + try/catch: na Web pura os plugins NÃO existem e nada muda.
if (typeof window !== 'undefined' && (window as any)?.Capacitor?.isNativePlatform?.()) {
  void (async () => {
    try {
      const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
        import('@capacitor/splash-screen'),
        import('@capacitor/status-bar'),
      ]);
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#0f172a' });
      } catch { /* Android sem suporte — segue com o padrão */ }
      try {
        await SplashScreen.hide();
      } catch { /* splash já oculto */ }
    } catch {
      // Plugins ainda não instalados/sincronizados (ex.: `npm run dev` web) — ignora.
    }
  })();
}
