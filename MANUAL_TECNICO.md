# Manual Técnico da Aplicação — SST Quiz Corporate

**Guia de Engenharia de Software, Arquitetura, Banco de Dados, APIs e Manutenção**  
*Documentação Técnica Oficial para Desenvolvedores, Engenheiros de Software e DevOps*

---

## 1. Visão Geral da Arquitetura

O **SST Quiz Corporate** é uma aplicação corporativa Full Stack orientada a microserviços e componentes modulares, operando em modelo **Multi-Tenant** com isolamento estrito por `empresa_id`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CAMADA CLIENTE (SPA)                              │
│  React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion + Lucide Icons     │
│  - Gerenciamento de Estado: SSTContext (React Context API)                  │
│  - Armazenamento Local: IndexedDB (idb.ts) + LocalStorage (Cache Síncrono)  │
│  - Comunicação: Supabase Client JS (REST/Realtime) + Fetch API para Express │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────────────────────┐       ┌─────────────────────────────────────┐
│    BACKEND EXPRESS (NODE)     │       │        SUPABASE (POSTGRESQL)        │
│  - Port 3000 (LAN / Cloud)    │       │  - PostgreSQL 15 com RLS Ativo      │
│  - Rate Limiter in-memory     │       │  - Supabase Auth (JWT Seguro)       │
│  - Anti Path-Traversal        │       │  - Functions RPC (SECURITY DEFINER) │
│  - Geração/Download PDFs      │       │  - Views Sanitizadas (Anon/Auth)    │
│  - Envio de E-mails (SMTP)    │       │  - Triggers de Integridade / RBAC   │
│  - Métricas de Observabilidade│       │  - Realtime WebSocket Channels      │
└───────────────────────────────┘       └─────────────────────────────────────┘
```

---

## 2. Stack Tecnológica e Justificativas

| Tecnologia | Versão | Função / Justificativa |
|---|---|---|
| **React** | 19.0.1 | Biblioteca UI base com concurrent rendering e alta velocidade de atualização |
| **TypeScript** | 5.8.2 | Tipagem estática rigorosa em 100% do código (zero `any` não justificado) |
| **Vite** | 6.2.3 | Bundler e HMR de ultrarrápida inicialização para desenvolvimento e build de produção |
| **Tailwind CSS** | 4.1.14 | Framework utilitário de CSS moderno com suporte a temas e layout responsivo |
| **Express** | 4.21.2 | Servidor HTTP Node.js para endpoints locais, streaming de PDFs, SMTP e sincronização LAN |
| **Supabase JS** | 2.112.0 | SDK cliente oficial para PostgreSQL, Auth JWT e Realtime WebSockets |
| **IndexedDB** | Nativo (idb.ts) | Banco de dados local durável assíncrono para operação offline-first |
| **jspdf / html2canvas**| 4.2.1 / 1.4.1| Geração no cliente de relatórios de avaliação em formato PDF formal com assinaturas |
| **nodemailer** | 9.0.5 | Envio assíncrono de atas de avaliação e notificações por e-mail corporativo (SMTP) |
| **crypto** | Nativo Node | Verificação segura de tokens (`crypto.timingSafeEqual`) imune a timing attacks |

---

## 3. Estrutura de Diretórios do Projeto

```
/
├── public/                 # Ativos estáticos públicos (manifest, ícones PWA, pdfs gerados)
├── scripts/                # Scripts utilitários de build e geração de documentação
├── server.ts               # Servidor backend Express (rotas REST, SMTP, PDFs, rate-limiting)
├── supabase/               # Migrations SQL (001 a 040), triggers, funções RPC e schema
│   ├── migrations/         # 40 scripts incrementais auditados de RLS e regras de negócio
│   └── functions/          # Edge Functions Supabase (Deno/TypeScript)
├── src/                    # Código-fonte do frontend React
│   ├── components/         # Modais e componentes compartilhados
│   │   ├── HeaderNavbar.tsx          # Cabeçalho global com perfil, notificações e conexão
│   │   ├── NotificationDrawer.tsx    # Gaveta de notificações do usuário
│   │   ├── UserProfileModal.tsx      # Modal de edição de perfil e foto do usuário
│   │   ├── SupabaseModal.tsx         # Modal de configuração e diagnóstico do Supabase
│   │   ├── SecurityConfirmModal.tsx  # Confirmação com reautenticação para ações críticas
│   │   ├── ConfirmActionModal.tsx    # Modal de confirmação genérica (exclusão, reset)
│   │   ├── CameraCaptureModal.tsx    # Captura de foto via webcam para avatar
│   │   ├── ImportPreviewModal.tsx    # Preview e validação de importação CSV
│   │   └── views/                    # Views principais (11 módulos)
│   │       ├── CollaboratorDashboardView.tsx # Dashboard principal do colaborador
│   │       ├── QuizPlayerView.tsx            # Execução de quiz individual com pontuação
│   │       ├── ChallengeDisputeView.tsx      # Módulo de duelos 1v1 entre colaboradores
│   │       ├── QuizGuiadoView.tsx            # Hub do treinamento ao vivo (Kahoot mode)
│   │       ├── RankingsView.tsx              # Rankings de colaboradores, setores e troféus
│   │       ├── QuestionBankView.tsx          # Gestão do banco de questões e importação CSV
│   │       ├── PrizesView.tsx                # Catálogo de prêmios e resgate de recompensas
│   │       ├── AdminManagementView.tsx       # Gestão de usuários, setores, campanhas e regras
│   │       ├── SuperAdminView.tsx            # Gestão multi-tenant e empresas globais
│   │       ├── RelatoriosView.tsx            # Analytics, gráficos de conformidade e relatórios
│   │       ├── LoginView.tsx                 # Autenticação e recuperação de senha
│   │       └── quizGuiado/                   # Sub-componentes da sala ao vivo
│   │           ├── CriarSalaModal.tsx
│   │           ├── IdentificacaoParticipanteModal.tsx
│   │           ├── PainelInstrutor.tsx
│   │           ├── PainelParticipante.tsx
│   │           ├── ProvaAvaliacaoPDFModal.tsx
│   │           ├── QRCodeScannerModal.tsx
│   │           ├── QRCodeSvg.tsx
│   │           ├── RelatorioAvaliacaoModal.tsx
│   │           └── TelaApresentacaoView.tsx
│   ├── context/
│   │   └── SSTContext.tsx  # Contexto central da aplicação (~5.000 linhas de regras auditadas)
│   ├── data/
│   │   └── mockData.ts     # Dados padrão para inicialização / fallback offline
│   ├── db/
│   │   └── databaseService.ts # Camada de abstração de dados do Supabase
│   ├── lib/
│   │   ├── supabase.ts     # Inicialização singleton do cliente Supabase (chave anon segura)
│   │   └── publicBaseUrl.ts# Resolução de URL pública/LAN para QR Codes
│   ├── services/
│   │   ├── supabaseService.ts # Serviços de consulta e mutação no Supabase
│   │   ├── supabaseAuth.ts    # Autenticação JWT via Supabase Auth
│   │   └── idb.ts             # Wrapper assíncrono IndexedDB com suporte a failover
│   ├── utils/              # Funções utilitárias puras testadas
│   │   ├── audioUtils.ts
│   │   ├── csvHelpers.ts
│   │   ├── desafioWinner.ts
│   │   ├── imageCompressor.ts
│   │   ├── quizGuiadoScore.ts
│   │   ├── relatoriosHelpers.ts
│   │   ├── resultadoAvaliacao.ts
│   │   ├── salaSanitize.ts
│   │   ├── trofeusHelpers.ts
│   │   └── validators.ts
│   ├── types.ts            # Definições completas de interfaces e tipos TypeScript
│   ├── App.tsx             # Componente raiz com roteador de abas e listeners de URL
│   ├── main.tsx            # Entry-point React com StrictMode
│   └── index.css           # Estilos globais Tailwind CSS v4
├── tests/                  # 23 suítes de testes unitários e de integração (155 testes)
├── package.json            # Dependências e scripts de execução
├── tsconfig.json           # Configurações do compilador TypeScript
└── vite.config.ts          # Configuração do Vite com plugins React e Tailwind
```

---

## 4. Endpoints da API Backend (`server.ts`)

| Método | Endpoint | Rate Limit | Proteção / Auth | Descrição |
|---|---|---|---|---|
| `GET` | `/api/health` | Sem limite | Pública | Health check com status, uptime e métricas da aplicação |
| `GET` | `/api/ready` | Sem limite | Pública | Retorna se o servidor está pronto para conexões |
| `GET` | `/api/public-base-url` | Sem limite | Pública | Retorna o IP LAN ou `PUBLIC_URL` para geração de QR Codes |
| `GET` | `/api/salas_quiz_guiado` | Sem limite | Pública | Lista salas de treinamento sanitizadas (sem gabarito) |
| `GET` | `/api/salas_quiz_guiado/pin/:pin` | 12 req/min | Pública | Busca uma sala ativa pelo código PIN sanitizada |
| `POST`| `/api/salas_quiz_guiado` | 60 req/min | Token se configurado | Cria ou atualiza sala de treinamento em tempo real |
| `POST`| `/api/salas_quiz_guiado/responder` | 120 req/min | Pública (anti-oráculo)| Registra e pontua a resposta de um aluno no servidor |
| `DELETE`| `/api/salas_quiz_guiado/:id` | 60 req/min | Token se configurado | Encerra e remove uma sala de treinamento |
| `GET` | `/api/resultados_avaliacao_sst` | Sem limite | Token se configurado | Lista histórico de atas e laudos emitidos |
| `POST`| `/api/resultados_avaliacao_sst` | 120 req/min | Token se configurado | Salva laudo de avaliação com respostas dos alunos |
| `GET` | `/api/backups` | 30 req/min | Token se configurado | Lista arquivos de backup salvos em disco |
| `POST`| `/api/backups` | 30 req/min | Token se configurado | Cria novo snapshot de backup completo do sistema |
| `GET` | `/api/backups/:id` | 30 req/min | Token se configurado | Download de arquivo de backup JSON específico |
| `DELETE`| `/api/backups/:id` | 30 req/min | Token se configurado | Exclui arquivo de backup do disco |
| `POST`| `/api/enviar_email_prova` | 10 req/min | Token se configurado | Envia ata e prova em PDF via SMTP (Nodemailer) |
| `GET` | `/pdf/*` | Sem limite | Token se configurado | Serve arquivos PDF gerados estáticos em `public/pdf` |

---

## 5. Modelo de Dados e Banco de Dados (Supabase PostgreSQL)

### 5.1 Tabelas Principais
* `empresas`: Cadastro multi-tenant de organizações.
* `setores`: Departamentos vinculados a uma empresa (`empresa_id`).
* `usuarios`: Perfis de colaboradores com pontuações, medalhas e `auth_uid`.
* `perguntas`: Banco de questões com categoria, NR, dificuldade e gabarito.
* `quizzes`: Questionários e campanhas de treinamento.
* `desafios`: Duelos 1v1 com status (`pendente`, `aceito`, `concluido`, `recusado`).
* `salas_quiz_guiado`: Sessões ao vivo com participantes e perguntas selecionadas.
* `resultados_avaliacao_sst`: Laudos e atas formais de avaliação técnica.
* `premios` e `resgates`: Catálogo de prêmios e histórico de resgates de pontos.
* `pontos_ledger`: Registro contábil imutável de crédito/débito de pontos.

### 5.2 Segurança e RLS (Row Level Security)
* **Isolamento Multi-Tenant**: Todas as consultas e mutações respeitam a cláusula `WHERE empresa_id = ...`.
* **Proteção contra Auto-Promoção**: Trigger PostgreSQL `bloquear_autopromocao` impede que um colaborador altere seu próprio `perfil`, `auth_uid` ou `empresa_id`.
* **Sanitização de Gabarito**: A view `v_salas_quiz_guiado_publica` omite a coluna `correta` das alternativas, impedindo que participantes vejam o gabarito no Inspecionar do Navegador.
* **Pontuação no Servidor (Anti-Oráculo)**: A validação e atribuição de pontos ocorre via RPC `registrar_resposta_quiz_guiado` ou `/api/salas_quiz_guiado/responder`, validando contra o hash no servidor.

---

## 6. Autenticação e Perfis de Acesso (RBAC)

1. **Super Admin (`super_admin`)**:
   - Acesso irrestrito a todas as empresas.
   - Criação e exclusão de empresas.
   - Auditoria forense e visualização de logs.
2. **Administrador (`admin`)**:
   - Gestão restrita à sua própria `empresa_id`.
   - Cadastro de colaboradores, setores, quizzes e prêmios.
   - Aprovação de resgates de prêmios e consulta a relatórios analíticos.
3. **Colaborador (`colaborador`)**:
   - Execução de quizzes individuais e desafios 1x1.
   - Participação em salas de treinamento ao vivo.
   - Visualização de rankings, troféus e solicitação de resgate de prêmios.

---

## 7. Como Executar, Testar e Publicar

### 7.1 Requisitos
* Node.js v20+ ou v22+
* NPM v10+

### 7.2 Instalação e Execução
```bash
# 1. Instalar dependências
npm install

# 2. Executar servidor de desenvolvimento (porta 3000)
npm run dev

# 3. Executar suíte completa de testes automatizados
npm test

# 4. Validar tipagem TypeScript
npm run lint

# 5. Gerar build de produção
npm run build

# 6. Iniciar em produção
npm run start
```

### 7.3 Variáveis de Ambiente (`.env`)
```env
PORT=3000
PUBLIC_URL=https://meudominio.com.br
API_TOKEN=token_secreto_para_apis_rest_opcional
VITE_SUPABASE_URL=https://vsnilfdvmfhotvrwtiln.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=notificacoes@empresa.com.br
SMTP_PASS=senha_de_app_smtp
SMTP_FROM=notificacoes@empresa.com.br
```

---

## 8. Manutenção e Boas Práticas para Desenvolvedores

1. **Nunca utilize `service_role` no cliente**: A chave `service_role` tem bypass de RLS e só deve ser utilizada em Edge Functions ou scripts administrativos com autenticação de backend.
2. **Mantenha RPCs com `SECURITY DEFINER` protegidas**: Funções que alteram pontuação ou vinculam contas devem validar o `auth.uid()` ou e-mail da sessão.
3. **Adicione testes unitários para novas funções**: Qualquer nova regra de pontuação ou sanitização em `src/utils/` deve ter seu respectivo teste em `tests/*.test.ts`.
4. **Respeite o princípio do Isolamento Multi-Tenant**: Toda nova tabela deve conter `empresa_id` e RLS habilitado.
