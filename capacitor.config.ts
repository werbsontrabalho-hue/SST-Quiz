import type { CapacitorConfig } from '@capacitor/cli';

// SST Quiz — configuração Capacitor (Web + Android + iOS, mesmo código React).
// webDir 'dist' = saída do `npm run build` (Vite). NÃO mudar sem alinhar vite.config.ts.
const config: CapacitorConfig = {
  appId: 'br.com.sstquiz.app',
  appName: 'SST Quiz',
  webDir: 'dist',
  // Permite navegação apenas para o conteúdo empacotado + backend/Supabase via fetch (sem allowNavigation).
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Em desenvolvimento com celular na mesma Wi-Fi, descomente e ajuste:
    // url: 'http://SEU_IP_LOCAL:3000',
    // cleartext: true,
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'automatic',
    // NSCameraUsageDescription é definido no Info.plist do Xcode (ver docs/CAPACITOR_GUIA.md).
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
