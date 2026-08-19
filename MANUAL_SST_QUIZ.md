# Manual Funcional, Estrutural e Procedimental — SST Quiz Corporate

**Versão:** 1.1 (atualizado após auditoria forense e correções)
**Data:** 16/08/2026
**Projeto Supabase:** `vsnilfdvmfhotvrwtiln` (migrations 001–027 aplicadas)

---

## 1. VISÃO GERAL

O **SST Quiz Corporate** é um sistema corporativo de treinamento e gamificação de Saúde e Segurança do Trabalho (SST). Permite criar quizzes, desafios 1x1, Quiz Guiado presencial (modo Kahoot), avaliações formais com laudo PDF, troféus, ranking e premiações.

**Stack:**
- **Frontend:** React 19 + Vite + Tailwind (SPA)
- **Backend:** Express (servidor local/LAN) + Supabase (nuvem)
- **Banco:** PostgreSQL (Supabase) com RLS, RPCs SECURITY DEFINER e Edge Functions
- **Auth:** Supabase Auth (hash Bcrypt em `auth.users`)

---

## 2. ARQUITETURA

```
FRONTEND (React)
├─ App.tsx → abas (dashboard, quizzes, desafios, rankings, perguntas,
│            admin_gestao, premiacoes, quiz_guiado, super_admin)
├─ context/SSTContext.tsx → estado global + regras de negócio
├─ services/ supabaseService (REST), supabaseAuth (Auth), idb (IndexedDB)
├─ lib/supabase.ts → cliente anon (NUNCA service_role no navegador)
└─ utils/ → regras puras (pontuação, CSV, sanitização)

BACKEND (Express) — em memória, LAN
├─ /api/salas_quiz_guiado* (lista sanitizada, PIN, upsert, delete)
├─ /api/resultados_avaliacao_sst* (histórico/laudo)
├─ /api/backups* (disco) + /api/health, /api/ready
└─ /api/enviar_email_prova (SMTP) + /pdf estático

SUPABASE
├─ Tabelas com RLS por empresa/papel, views sanitizadas
├─ RPCs: pontuar_quiz, registrar_desafio_no_ledger, resgatar_premio,
│         reembolsar_resgate, aceitar_desafio, vincular_auth_uid,
│         registrar_resposta_quiz_guiado, registrar_marco_sala_quiz_guiado
├─ Triggers: bloquear_autopromocao (protege perfil/auth_uid/empresa/setor)
└─ Edge Functions: pontuar-quiz, pontuar-desafio, pontuar-quiz-guiado,
                    migrar-legados
```

---

## 3. PERFIS E PERMISSÕES

| Função | SuperAdmin | Admin | Colaborador |
|---|---|---|---|
| Login/Auth | ✅ | ✅ | ✅ |
| Dashboard próprio | ✅ | ✅ | ✅ |
| Banco de perguntas (CRUD) | ✅ | ✅ (admin/instrutor) | 👁 leitura |
| Gestão de usuários/setores/empresa | ✅ | ✅ | — |
| Campanhas de quiz | ✅ | ✅ | — |
| Premiações | ✅ | ✅ | 👁 + resgatar |
| Desafios 1x1 | ✅ | ✅ | ✅ (participante) |
| Quiz Guiado (criar sala) | ✅ | ✅ (admin/instrutor) | instrutor |
| Quiz Guiado (participar) | ✅ | ✅ | ✅ |
| Relatórios/laudos | ✅ | ✅ | própria avaliação |
| Backups/restore | ✅ | — | — |
| Config Supabase | ✅ | — | — |

**RLS no banco (migration 011):** escrita de perguntas/campanhas/premiações só de admin/instrutor/super; quizzes do próprio colaborador; desafios de participantes; resgates INSERT do próprio usuário e status só de admin; usuários UPDATE da própria linha ou admin da empresa.

---

## 4. AUTENTICAÇÃO E SESSÃO

- Login com Supabase Auth (`auth.users` — hash Bcrypt). **Não há** fallback de senha em texto puro quando o Supabase está configurado.
- Usuários legados foram migrados (14 contas criadas em `auth.users` + `auth_uid` vinculado).
- Recuperação de senha: **link oficial do Supabase** (e-mail → token na URL → nova senha). Código de 6 dígitos apenas no modo local/LAN.
- Logout: limpa estado, storage e sessão do Auth (V-016).

---

## 5. TELAS E FUNCIONALIDADES

### 5.1 Login / Cadastro / Recuperação (`LoginView`)
- **Login:** e-mail + senha via Supabase Auth.
- **Recuperação:** e-mail cadastrado → link oficial (nuvem) ou código local.
- **Cadastro:** lógica disponível no contexto (perfil `colaborador` forçado); o botão público foi removido por segurança (V-003).

### 5.2 Dashboard do Colaborador (`CollaboratorDashboardView`)
- Resumo diário, quizzes pendentes, desafios, troféus, streak, ranking.

### 5.3 Quiz (`QuizPlayerView`)
- Responde perguntas com cronômetro; a pontuação é validada no servidor (edge `pontuar-quiz` → RPC `pontuar_quiz`), que **recalcula** gabarito e estatísticas (014).

### 5.4 Desafios 1x1 (`ChallengeDisputeView`)
- Criação, convite, aceite (RPC), respostas, desempate determinístico (hash do id), resultado via `registrar_desafio_no_ledger` (valida vencedor).

### 5.5 Quiz Guiado (`QuizGuiadoView`)
- Sala com PIN/QR, participantes, perguntas ao vivo, ranking, avaliação formal com laudo PDF.
- O participante lê a sala via **view sanitizada** (sem gabarito); o gabarito oficial fica no servidor.

### 5.6 Administração (`AdminManagementView`, `QuestionBankView`, `PrizesView`)
- Usuários, setores, perguntas, campanhas, premiações, troféus.

### 5.7 Super Admin (`SuperAdminView`)
- Empresas, backups/restore, métricas, config Supabase.

---

## 6. BANCO DE DADOS (tabelas principais)

| Tabela | Finalidade | RLS |
|---|---|---|
| empresas | Empresas e configurações | por empresa |
| setores | Setores das empresas | por empresa |
| usuarios | Perfis (sem senha na nuvem) | por empresa/papel |
| perguntas | Banco de questões | escrita admin/instrutor |
| campanhas | Campanhas de quiz | escrita admin |
| quizzes | Sessões de quiz | do próprio colaborador |
| desafios_1v1 | Desafios | participantes |
| premiacoes | Catálogo de prêmios | escrita admin |
| resgates_premios | Resgates | INSERT próprio, status admin |
| notificacoes | Notificações | por usuário |
| pontos_ledger | Trilha de pontos | service_role |
| backups_historico | Backups | super admin |
| salas_quiz_guiado | Salas de quiz guiado | instrutor/participante |
| resultados_avaliacao_sst | Laudos/avaliações | participante/instrutor |

---

## 7. SEGURANÇA IMPLEMENTADA (após correções)

1. **Modo legado anônimo desativado** (007): `anon` sem acesso (401 em todas as tabelas).
2. **RLS por papel** (011): escrita restrita por perfil.
3. **RPCs autoritativos** (010, 014): `pontuar_quiz` revalida gabarito e recalcula estatísticas no servidor; `registrar_desafio_no_ledger` valida vencedor participante/mesma empresa.
4. **Anti-cola** (006, 012): view sanitizada para participantes; base restrita.
5. **Gatilho anti-autopromoção** (006/024): protege perfil/is_instrutor/auth_uid/empresa/setor/ativo na própria linha.
6. **Backend Express**: lista de salas sanitizada; POST preserva gabarito; rotas com `API_TOKEN` opcional.
7. **SQL do SupabaseModal**: sem grants a `anon`.
8. **Recuperação de senha**: via link oficial do Supabase.

---

## 8. PROCEDIMENTOS OPERACIONAIS

### Deploy do frontend/backend
```
npm install
npm run build      # gera dist/ (Vite + esbuild)
npm start          # serve na porta preferida (PORT ou 3000)
```

### Aplicar migrations no Supabase
```
supabase db push
```
(As migrations 001–027 estão em `supabase/migrations/`.)

### Deploy de Edge Functions
```
supabase functions deploy pontuar-quiz
supabase functions deploy pontuar-desafio
supabase functions deploy pontuar-quiz-guiado
supabase functions deploy migrar-legados
```

### Migrar usuários legados para Auth (uma vez)
Usuários legados (senha texto puro) são criados em `auth.users` via `auth.admin.createUser` com `email_confirm=true` e `auth_uid` vinculado. O RPC `vincular_auth_uid` faz o vínculo no primeiro login.

### Backup/Restore
- Backups automáticos/manuais no SuperAdmin (disco do servidor + `backups_historico`).
- Restore via SuperAdmin com confirmação.

---

## 9. PROBLEMAS CORRIGIDOS NESTA RODADA (resumo)

| # | Problema | Correção |
|---|---|---|
| 0.1 | Login rejeitava credencial legada | Migração para `auth.users` + `auth_uid` |
| 0.2 | Código de recuperação exposto | Removido do UI; link oficial do Supabase |
| AUD-11 | Poison fields (colunas inexistentes) | Migration 009 + sanitização de payload |
| AUD-37/38 | Fraude via RPC (pontos/vencedor) | Migrations 010/014/025 (servidor recalcula) |
| AUD-43/44 | Auto-premiação / CRUD amplo | RLS por papel (011) + gatilho |
| AUD-42 | Gabarito exposto | View sanitizada (012) |
| AUD-50 | Desempate não-determinístico | Hash FNV-1a do id do desafio |
| AUD-53 | Sync com falso sucesso | Erros reais reportados |
| AUD-04/05 | Relatório/fichas do instrutor/participante | Correção de status e ids |
| AUD-08 | Race do ledger de desafio | RPC antes do upsert |
| V-018 | Gatilho estatisticas (tentativa) | Revertido (024) por instabilidade do bypass; RPC recalcula |

---

## 10. PENDÊNCIAS CONHECIDAS

1. **V-018 completo (Fase C):** bloquear `estatisticas` no gatilho exige migrar quiz/desafio/offline para server-first. Hoje o RPC recalcula (anti-fraude), mas a coluna `estatisticas` ainda é editável pela própria linha via REST.
2. **Entrada por PIN via Supabase puro:** participante novo não lê a sala via Supabase (RLS); o fluxo usa o Express local.
3. Testes HTTP do Express expandidos (base existente em `tests/serverRoutes.test.ts`).

---

*Documentação gerada/atualizada com base na auditoria forense integral (ver `AUDITORIA_FORENSE_INTEGRAL.md`).*
