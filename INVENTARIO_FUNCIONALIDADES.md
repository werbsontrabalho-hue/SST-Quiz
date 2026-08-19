# Inventário Completo de Funcionalidades — SST Quiz Corporate

**Mapeamento Detalhado de Telas, Módulos, Permissões e Status Operacional**

---

| Funcionalidade | Descrição | Tela / View | Perfis Permitidos | Arquivos Principais | Banco / API | Status |
|---|---|---|---|---|---|---|
| **Autenticação Segura** | Login via e-mail e senha com JWT Supabase Auth e sessão persistida | `LoginView` | Todos | `LoginView.tsx`, `supabaseAuth.ts`, `SSTContext.tsx` | Supabase Auth (`auth.users`) | ✅ Funcionando |
| **Recuperação de Senha** | Redefinição de senha com link/código de segurança corporativo | `LoginView` | Todos | `LoginView.tsx`, `supabaseAuth.ts` | Supabase Auth API | ✅ Funcionando |
| **Dashboard do Colaborador** | Visão geral de métricas, pontuação, streak de dias, quizzes diários e conquistas | `CollaboratorDashboardView` | Colaborador, Admin, Super Admin | `CollaboratorDashboardView.tsx`, `SSTContext.tsx` | `usuarios`, `quizzes` | ✅ Funcionando |
| **Quiz Player Individual** | Resposta a perguntas com temporizador, justificativas de NRs e cálculo de bônus | `QuizPlayerView` | Colaborador, Admin, Super Admin | `QuizPlayerView.tsx`, `SSTContext.tsx` | RPC `pontuar_quiz` | ✅ Funcionando |
| **Desafios 1x1 (Duelos SST)** | Criação, aceite e resposta de duelos entre colaboradores valendo pontos | `ChallengeDisputeView` | Colaborador, Admin, Super Admin | `ChallengeDisputeView.tsx`, `desafioWinner.ts` | `desafios`, RPC `registrar_desafio` | ✅ Funcionando |
| **Quiz Guiado (Instrutor)** | Criação de sala ao vivo com projeção de QR Code, PIN e controle de perguntas | `QuizGuiadoView` / `PainelInstrutor` | Admin, Instrutor, Super Admin | `QuizGuiadoView.tsx`, `PainelInstrutor.tsx`, `CriarSalaModal.tsx` | `/api/salas_quiz_guiado` | ✅ Funcionando |
| **Quiz Guiado (Participante)** | Acesso rápido por QR Code/PIN e envio de respostas pelo celular em tempo real | `QuizGuiadoView` / `PainelParticipante` | Todos (inclusive Visitante) | `PainelParticipante.tsx`, `IdentificacaoParticipanteModal.tsx` | `/api/salas_quiz_guiado/responder` | ✅ Funcionando |
| **Telão de Apresentação** | Modo telão para auditório/projetor com ranking dinâmico e gráficos de respostas | `TelaApresentacaoView` | Instrutor, Admin | `TelaApresentacaoView.tsx`, `QRCodeSvg.tsx` | `/api/salas_quiz_guiado` | ✅ Funcionando |
| **Laudo & Ata em PDF** | Geração e download de ata formal de avaliação com lista de presença e notas | `ProvaAvaliacaoPDFModal` | Instrutor, Admin | `ProvaAvaliacaoPDFModal.tsx`, `html2canvas-pro`, `jspdf` | `/api/resultados_avaliacao_sst`, `/pdf` | ✅ Funcionando |
| **Envio de Prova por E-mail** | Envio de ata e laudo de avaliação por e-mail via servidor SMTP (Nodemailer) | `ProvaAvaliacaoPDFModal` | Instrutor, Admin | `ProvaAvaliacaoPDFModal.tsx`, `server.ts` | `/api/enviar_email_prova` | ✅ Funcionando |
| **Rankings & Conquistas** | Ranking individual e por setor com galeria de troféus e linha do tempo | `RankingsView` | Todos | `RankingsView.tsx`, `trofeusHelpers.ts` | `usuarios`, `setores`, `pontos_ledger` | ✅ Funcionando |
| **Banco de Perguntas** | Cadastro, edição e categorização de perguntas por NR e nível de dificuldade | `QuestionBankView` | Admin, Instrutor, Super Admin | `QuestionBankView.tsx`, `SSTContext.tsx` | `perguntas` | ✅ Funcionando |
| **Importação de Questões CSV** | Importação em lote de perguntas via arquivo CSV com validação prévia | `QuestionBankView` | Admin, Super Admin | `ImportPreviewModal.tsx`, `csvHelpers.ts` | `perguntas` | ✅ Funcionando |
| **Loja de Prêmios & Resgate** | Catálogo de brindes e solicitação de resgate debitando pontos | `PrizesView` | Colaborador, Admin, Super Admin | `PrizesView.tsx`, `SSTContext.tsx` | `premios`, `resgates`, RPC `resgatar_premio` | ✅ Funcionando |
| **Aprovação de Resgates** | Painel administrativo para validar e registrar a entrega física do prêmio | `PrizesView` / `Admin` | Admin, Super Admin | `PrizesView.tsx`, `SSTContext.tsx` | `resgates`, `pontos_ledger` | ✅ Funcionando |
| **Gestão de Colaboradores** | Cadastro, edição, inativação e concessão de papéis aos usuários da empresa | `AdminManagementView` | Admin, Super Admin | `AdminManagementView.tsx` | `usuarios` (RLS isolado) | ✅ Funcionando |
| **Gestão de Setores** | Organização da estrutura departamental da empresa | `AdminManagementView` | Admin, Super Admin | `AdminManagementView.tsx` | `setores` | ✅ Funcionando |
| **Configuração de Temporadas**| Definição de períodos de premiação, regras de pontuação e zeragem de ranking | `AdminManagementView` | Admin, Super Admin | `AdminManagementView.tsx` | `empresas.configuracoes` | ✅ Funcionando |
| **Relatórios & Analytics SST**| Gráficos analíticos de conformidade, taxas de acerto por NR e exportações | `RelatoriosView` | Admin, Super Admin | `RelatoriosView.tsx`, `relatoriosHelpers.ts` | `resultados_avaliacao_sst`, `usuarios` | ✅ Funcionando |
| **Gestão Multi-Tenant** | Criação, edição e governança de múltiplas empresas no mesmo banco de dados | `SuperAdminView` | Exclusivo Super Admin | `SuperAdminView.tsx` | `empresas`, `usuarios` | ✅ Funcionando |
| **Auditoria e Diagnóstico Supabase**| Teste de conexão, validação de chaves e visualização de status do banco | `SupabaseModal` | Admin, Super Admin | `SupabaseModal.tsx`, `supabaseConfig.ts` | Supabase REST / PostgREST | ✅ Funcionando |
| **Gestão de Backups** | Geração e download de snapshots completos do sistema em JSON | `AdminManagementView` | Super Admin, Admin | `server.ts` | `/api/backups` | ✅ Funcionando |
| **Edição de Perfil e Avatar** | Alteração de dados cadastrais, upload de foto e captura via webcam | `UserProfileModal` | Todos | `UserProfileModal.tsx`, `CameraCaptureModal.tsx` | `usuarios` | ✅ Funcionando |
| **Notificações em Tempo Real** | Notificação de desafios recebidos, aprovação de resgate e comunicados | `NotificationDrawer` | Todos | `NotificationDrawer.tsx`, `SSTContext.tsx` | `usuarios.notificacoes` | ✅ Funcionando |
| **Armazenamento Offline-First**| Persistência local em IndexedDB com cache síncrono em LocalStorage | Global | Todos | `idb.ts`, `SSTContext.tsx` | IndexedDB (`sst_offline`) | ✅ Funcionando |
