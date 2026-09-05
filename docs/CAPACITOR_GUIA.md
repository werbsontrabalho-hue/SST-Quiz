# SST Quiz — Guia Web + Android + iOS (Capacitor)

> Mesmo projeto, mesmo código React. A Web continua igual; o Capacitor só
> **empacota** o site (`dist/`) dentro de um app Android/iOS.
> Backup da versão Web pura: `../backup-sst-quiz-web.zip`.

## 1. O que foi alterado (resumo simples)

- **Novo `src/lib/api.ts`**: endereço do backend num lugar só (`VITE_API_URL`).
  Na Web local fica vazio (usa `/api/...` como antes). No celular, aponta
  para o backend público (ex.: `https://SEU_BACKEND`).
- **Novo `src/lib/capacitor.ts`**: PDF/CSV/backup abrem o
  **compartilhamento nativo** no celular (salvar/abrir/enviar) em vez de
  `link.download`, que não funciona bem no app.
- **Câmera/QR**: continua com `getUserMedia` (funciona no WebView HTTPS do
  Capacitor) + fallback de upload de imagem que já existia. Permissões
  adicionadas: `CAMERA` (Android) e `NSCameraUsageDescription` (iOS).
- **Layout mobile**: suporte a notch/safe-area e teclado (`viewport-fit`,
  `env(safe-area-inset-*)`, teclado redimensiona o app).
- **Config**: `capacitor.config.ts` (`br.com.sstquiz.app`, `webDir: dist`),
  pastas `android/` e `ios/`, scripts `build:mobile`, `cap:sync`, etc.
- **Nada foi reescrito**: React, Supabase, RLS, multi-tenant, offline
  (IndexedDB + fila), Quiz e Quiz Guiado (polling + Realtime) preservados.

## 2. Primeiro passo (todo computador novo)

```bash
1. Abra o terminal na pasta do projeto
2. Digite: npm install
3. Pressione Enter
4. Aguarde terminar (aparece "added ... packages")
```

Opcional (recomendado): crie seu `.env` local a partir do modelo:

```bash
Copy-Item .env.example .env
```

> O `.env` NUNCA vai para o Git (está no `.gitignore`).
> NUNCA coloque `service_role`, senhas SMTP ou segredos com prefixo `VITE_`.

## 3. Web (como era antes — nada mudou)

```bash
npm run dev    # testa no navegador (http://localhost:3000)
npm run build  # build de produção (valida que a Web não quebrou)
npm start      # roda o servidor do build
```

## 4. Fluxo mobile (sempre nesta ordem)

```bash
npm run build:mobile   # 1. gera o site em dist/ (só o front, sem servidor)
npx cap sync           # 2. copia dist/ para android/ e ios/
npx cap open android   # 3. abre o Android Studio
npx cap open ios       # 3b. abre o Xcode (só em Mac)
```

Atalhos prontos: `npm run mobile:android` (= passos 1+2 p/ Android).

> ⚠️ Depois de qualquer mudança no código, repita os passos 1+2.
> O app NÃO atualiza sozinho — ele mostra a cópia feita no último `sync`.

## 5. Gerar APK de teste (Android)

```
1. Execute: npm run mobile:android
2. Execute: npx cap open android   (abre o Android Studio)
3. No Android Studio: menu Build > Build APK(s)
4. Resultado esperado: notificação "APK generated" + botão Locate
5. Copie o APK para o celular e instale para testar
```

## 6. Gerar AAB (Google Play)

```
1. Execute: npm run mobile:android
2. Execute: npx cap open android
3. No Android Studio: menu Build > Generate Signed Bundle / APK
4. Escolha: Android App Bundle (AAB)
5. Informe seu keystore (crie o seu — NÃO inventamos senha/certificado aqui)
6. Resultado esperado: arquivo .aab pronto para a Play Console
```

Pré-requisitos: Java 17 + Android Studio + keystore próprio.

## 7. Gerar iOS (precisa de Mac + Xcode)

```
1. Num Mac: npm run mobile:ios
2. Execute: npx cap open ios   (abre o Xcode)
3. No Xcode: selecione o time (Apple Developer) em Signing & Capabilities
4. Menu Product > Archive > Distribute App (App Store Connect ou TestFlight)
```

Neste Windows o projeto `ios/` foi criado e configurado, mas **compilar
exige macOS + Xcode + conta Apple Developer** (limitação da Apple, sem gambiarra).
O `pod install` (CocoaPods) também só roda no Mac — rode `npx cap sync` lá
uma vez para concluir.

## 8. Variáveis de ambiente (placeholders — preencha com os seus)

| Variável | Onde | Valor |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` / painel de build | URL do seu Supabase |
| `VITE_SUPABASE_ANON_KEY` | `.env` / painel de build | chave **anon pública** (nunca `service_role`) |
| `VITE_API_URL` | build mobile/produção | `https://SEU_BACKEND` (Web local: vazio) |
| `VITE_API_TOKEN` | backend + app (mesmo valor) | token opcional do Express (pode ficar vazio em LAN) |

Segredos que ficam SÓ no servidor (sem `VITE_`, nunca no app):
`SMTP_HOST/PORT/USER/PASS/FROM`, `API_TOKEN`, `PORT`, `PUBLIC_URL`.

## 9. Matriz de testes

| Funcionalidade | Web | Android | iOS |
|---|---|---|---|
| Login / Logout / Recuperação de senha | PASSOU | NÃO TESTADO | NÃO TESTADO |
| Dashboard / Quiz / Quiz offline / Sincronização | PASSOU* | NÃO TESTADO | NÃO TESTADO |
| Quiz Guiado (PIN / QR / ranking / Realtime) | PASSOU* | NÃO TESTADO | NÃO TESTADO |
| Câmera / QR leitura / Upload / Download | PASSOU* | NÃO TESTADO | NÃO TESTADO |
| PDF gerar / salvar / compartilhar / e-mail | PASSOU* | NÃO TESTADO | NÃO TESTADO |
| Relatórios / Prêmios / Desafios / Admin / Super Admin / Multi-tenant | PASSOU* | NÃO TESTADO | NÃO TESTADO |
| Offline First (IndexedDB + fila, sem duplicidade) | PASSOU* | NÃO TESTADO | NÃO TESTADO |

`*` "PASSOU" = `npm run build` + `tsc --noEmit` OK e nenhuma regra alterada;
testes automatizados: 156/158 (2 falhas pré-existentes, ver §10).
Android/iOS exigem aparelho/emulador — marque PASSOU só após testar de verdade.

Roteiro offline (quando testar no celular): login com internet → ative modo
avião → responda um quiz → feche o app → abra de novo → desligue modo avião
→ confira se sincronizou 1 vez (sem duplicar).

## 10. Problemas encontrados (e situação)

1. `fetch('/api/...')` relativo quebra no WebView do Capacitor
   → CORRIGIDO (`src/lib/api.ts` + `VITE_API_URL`).
2. `link.download` não entrega PDF no celular → CORRIGIDO (Share nativo).
3. Falta permissão de câmera no app → CORRIGIDO (Manifest + Info.plist).
4. Sem safe-area/teclado no mobile → CORRIGIDO (CSS + `viewport-fit=cover`).
5. Teste `serverRoutes AUD-25` falha → NÃO MEXIDO (server.ts intocado;
   falha pré-existente, backend fora do escopo mobile).
6. Teste `e2eFullSystemBattery` falha sem `.env`
   (`supabase.ts` lê `process.env` indefinido no Node) → NÃO MEXIDO
   (arquivo intocado; crie `.env` a partir do `.env.example`).
7. iOS não compila neste Windows → DEPENDE DE AMBIENTE (Mac + Xcode +
   Apple Developer + CocoaPods). AAB/APK-release exigem keystore próprio.

## 11. Dependências adicionadas

```
@capacitor/core ^7.4.3, @capacitor/cli ^7.4.3,
@capacitor/android ^7.4.3, @capacitor/ios ^7.4.3,
@capacitor/app, @capacitor/share, @capacitor/filesystem,
@capacitor/splash-screen, @capacitor/status-bar, @capacitor/keyboard
```

Finalidade: empacotar o React como app nativo + Share/arquivos/splash/
teclado/statusbar. Nenhum framework de UI foi trocado.
