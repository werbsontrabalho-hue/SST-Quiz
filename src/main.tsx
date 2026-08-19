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
