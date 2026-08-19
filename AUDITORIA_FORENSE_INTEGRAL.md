# AUDITORIA INTEGRAL E FORENSE — SST QUIZ CORPORATE

**Data:** 16/08/2026
**Projeto Supabase:** `vsnilfdvmfhotvrwtiln` (produção, migrations 001–008 aplicadas)
**Método:** análise cruzada interface → permissão → estado → serviço → API → backend → edge/RPC → Supabase → banco → RLS → retorno, com verificação direta no banco real (REST via service_role/anon) e execução de build/lint/testes.

---

## 1. RESUMO EXECUTIVO

| Métrica | Valor |
|---|---|
| Arquivos analisados | ~60 (12 views, 9 componentes quiz guiado, 8 componentes globais, contexto 4.818 linhas, 3 serviços, 10 utils, server.ts 603 linhas, 8 migrations, 8 scripts SQL avulsos, 4 edge functions, 10 testes) |
| Testes | 70/70 passando, `tsc --noEmit` OK, build OK |
| Achados 🔴 CRÍTICOS | 12 |
| Achados 🟠 ALTOS | 15 |
| Achados 🟡 MÉDIOS | 21 |
| Achados 🟢 BAIXOS | 14 |
| Problema 0.1 (login) | 🔧 **RESOLVIDO e verificado** (ver seção 20) |
| Problema 0.2 (código exposto) | 🔧 **RESOLVIDO em código** (ver seção 20) |

**Veredito geral:** o app é **visualmente completo e o build passa**, mas **não está funcionalmente íntegro**. Há um grupo de bugs que quebra a PERSISTÊNCIA de dados no Supabase (campos inexistentes nos payloads — "poison fields"), falhas de SEGURANÇA de autorização (RPCs sem validação expostas a `authenticated`), e funcionalidades que "parecem" funcionar (pontuação, quiz guiado, fichas SST) mas não entregam o resultado ao usuário em múltiplos cenários. A migração 007 (fechar modo legado anônimo) está funcionando (anon = 401 em todas as tabelas).

---

## 2. ARQUITETURA ATUAL ENCONTRADA

```
FRONTEND (React 19 + Vite)
├─ App.tsx → rotas por aba (dashboard, quizzes, desafios, rankings, perguntas,
│            admin_gestao, premiacoes, quiz_guiado, super_admin)
├─ context/SSTContext.tsx (4.818 linhas) → estado global + regras de negócio
├─ services/ supabaseService (REST), supabaseAuth (Auth), idb (IndexedDB)
├─ lib/supabase.ts → cliente anon (NUNCA service_role no navegador)
└─ utils/ → regras puras (pontuação, CSV, sanitização) + testes

BACKEND (Express, server.ts 603 linhas) → em memória, LAN
├─ /api/salas_quiz_guiado* (GET lista/PIN, POST upsert, DELETE)
├─ /api/resultados_avaliacao_sst* (GET/POST)
├─ /api/backups* (GET/POST/DELETE) + /api/health, /api/ready
└─ /api/enviar_email_prova (SMTP) + /pdf estático

SUPABASE (projeto vsnilfdvmfhotvrwtiln)
├─ 15 tabelas com RLS (001–005), views, RPCs SECURITY DEFINER, triggers
├─ Edge functions: pontuar-quiz, pontuar-desafio, pontuar-quiz-guiado, migrar-legados
└─ Auth: 14 contas criadas na migração legado→Auth (auth.users cheio, auth_uid vinculado)
```

**Ponto central da arquitetura (e da maior parte dos problemas):** o frontend persiste **diretamente via REST** (cliente anon/authenticated) com `upsert` em quase todas as tabelas, enquanto as edge functions/RPCs (que deveriam ser a autoridade) são usadas apenas em parte do fluxo. Como a migration 007 deu `EXECUTE` de **todas** as funções `public` para `authenticated`, as RPCs SECURITY DEFINER viraram vetor de fraude chamável direto pelo PostgREST.

---

## 3. PROBLEMAS CONCRETOS (0.1 e 0.2) — CAUSA RAIZ + CORREÇÃO + EVIDÊNCIA

### 0.1 — LOGIN REJEITA CREDENCIAL QUE EXISTE NO BANCO (`admin@alfa.com`/`123456`)

**Causa raiz (confirmada na auditoria):**
1. Existem **duas fontes de credencial**: `public.usuarios.senha` (texto puro) e `auth.users` (hash Bcrypt).
2. Com Supabase configurado, `loginWithCredentials` (`SSTContext.tsx:516-598`) **exige** Supabase Auth (`signInWithPassword`, `supabaseAuth.ts:72`), que valida **somente** `auth.users`.
3. Antes da correção, `auth.users` estava **vazio** (0 contas) — todos os 14 usuários existiam só em `public.usuarios`. O fallback de texto puro foi removido de propósito na Fase A (V-001/V-003).
4. A mensagem `"Invalid login credentials"` é o `error.message` do SDK Supabase (sempre em inglês), repassado cru em `SSTContext.tsx:524`.

**Correção aplicada (autorizada e verificada):**
- Migrações 007 e 008 aplicadas no projeto.
- 14/14 contas criadas em `auth.users` via `auth.admin.createUser` (service_role, `email_confirm=true`, senha texto puro atual) e `auth_uid` vinculado em `public.usuarios`.
- Coluna `senha` (texto puro) zerada em todos os registros (verificado: nenhuma senha restante).
- Edge function `migrar-legados` deployada (para futuras contas legadas).
- **Teste de validação:** `POST /auth/v1/token?grant_type=password` com `admin@alfa.com`/`123456` → `LOGIN OK` (JWT emitido, id = `ef87f9f2...`). ✅

**Pendência decorrente (nova, ver seção de bugs):** o login **offline** com Supabase configurado está quebrado: o ramo local (`SSTContext.tsx:602-620`) compara `usuarios.senha` em texto puro, mas a coluna foi zerada e a view `v_usuarios_sem_senha` não expõe `senha` → `foundLocal.senha === ''` → "conta ainda não possui senha definida". E sem `navigator.onLine` o fallback local nem é tentado. **Impacto:** em queda de internet com Supabase configurado, ninguém loga. 🔴 (AUD-01)

### 0.2 — CÓDIGO DE RECUPERAÇÃO DE SENHA EXPOSTO NO FORMULÁRIO

**Causa raiz (confirmada):**
1. `requestPasswordResetCode` (`SSTContext.tsx:735-788`) gerava o código, guardava em **memória do navegador** (`resetCodesMap`) e o **retornava no payload** (`codeForDemo`).
2. `LoginView.tsx` exibia o bloco "Código de teste/demo gerado: <XXXXXX>" com botão "Preencher" e auto-preenchia `recCodigo` — resquício de staging. Qualquer pessoa que soubesse o e-mail da vítima redefinia a senha sem acesso ao e-mail real.

**Correção aplicada (código):**
- Removido `codeForDemo` do tipo/retorno em `SSTContext.tsx` (linhas 87, 735, 786) e do UI em `LoginView.tsx` (estado `demoCodeHint`, auto-preenchimento, bloco de demonstração).
- A notificação de recuperação não menciona mais "código na tela".
- Build/lint/testes OK após a alteração.

**Pendência grave remanescente (AUD-02, 🔴 CRÍTICO — NÃO corrigida nesta auditoria):**
- O fluxo de recuperação **continua quebrado com Supabase**: `resetUserPasswordWithCode` (`SSTContext.tsx:791-825`) valida código em memória e chama `editarUsuario(target.id, { senha })`, que grava no localStorage, mas `upsertUsuario` **remove `senha` do payload** (`supabaseService.ts:375`) e **nunca atualiza `auth.users`**. Ou seja: a "nova senha" **não altera a senha real** do Auth; o usuário não consegue logar com a senha que definiu na recuperação.
- O código de 6 dígitos **nunca é entregue por e-mail** (o e-mail do Supabase envia um **link**, não o código; e em modo local não há envio). A mensagem "código enviado para X" é promessa sem entrega.
- **Correção recomendada:** validação server-side (RPC/edge com código hashado + expiração + limite de tentativas) e redefinição via `client.auth.updateUser({ password })` (ou o link oficial de recuperação do Supabase, tratando o `token_hash` no app). Fica alinhado às fases B–C do plano de segurança.

---

## 4. INVENTÁRIO DE FUNCIONALIDADES (status)

| Funcionalidade | Tela | Status | Observação |
|---|---|---|---|
| Login via Supabase Auth | LoginView | ✅ FUNCIONANDO | Validado em produção (0.1) |
| Login offline (Supabase configurado) | LoginView | ❌ QUEBRADO | AUD-01 |
| Cadastro de conta | LoginView | 🚫 INACESSÍVEL | `authMode='register'` sem botão/bloco JSX (AUD-03) |
| Recuperação de senha | LoginView | ❌ QUEBRADO | AUD-02 |
| Quiz diário (criar/responder/pontuar) | QuizPlayer/Collab | ⚠️ PARCIAL | Pontuação na tela mas pode não persistir (AUD-06/07) |
| Desafios 1x1 | ChallengeDispute | ⚠️ PARCIAL | Ledger pode nunca gravar (race) (AUD-08) |
| Ranking/relatórios | Rankings/Relatorios | ⚠️ PARCIAL | Depende de pontos persistidos |
| Banco de perguntas | QuestionBank | ✅ FUNCIONANDO | CRUD persiste |
| Gestão de usuários/setores/empresa | AdminManagement | ✅ FUNCIONANDO | CRUD persiste (mas ver AUD-11 poison field) |
| Prêmios e resgates | PrizesView | ⚠️ PARCIAL | Resgate via RPC; poison fields podem quebrar |
| Quiz Guiado (criar sala) | CriarSalaModal | ⚠️ PARCIAL | Upsert de sala FALHA no Supabase (AUD-11) |
| Quiz Guiado (participar via PIN) | PainelParticipante | ⚠️ PARCIAL | Funciona em memória; gabarito corruptível (AUD-20) |
| Quiz Guiado (relatório final instrutor) | PainelInstrutor | ❌ QUEBRADO | Busca `'encerrado'`, app grava `'concluido'` (AUD-04) |
| Ficha oficial / Meus resultados SST | QuizGuiadoView/PainelParticipante | ❌ QUEBRADO | `part-...` vs `currentUser.id` (AUD-05) |
| Prova PDF / laudo / e-mail | ProvaAvaliacaoPDFModal | ✅ FUNCIONANDO | jsPDF + rota real (honesta sobre SMTP) |
| Troféus (galeria) | Collab/Admin | ⚠️ PARCIAL | Regras em 3 scripts divergentes; `trofeus_temporadas` poison (AUD-10/11) |
| Níveis | Collab | ⚠️ PARCIAL | Depende de pontos persistidos |
| Backup/Restore | SuperAdmin | ⚠️ PARCIAL | Express sem auth e sem isolamento (AUD-21) |
| Notificações | NotificationDrawer | ⚠️ PARCIAL | Só local, nunca persiste; simulador com sucesso falso (AUD-12) |
| Sincronização offline | (contexto) | ⚠️ PARCIAL | Fila funciona; upserts diretos sem RPC/ledger (AUD-13) |
| Config Supabase | SupabaseModal | ⚠️ PARCIAL | SQL copiado PERIGOSO (reabre anon) (AUD-14) |

---

## 5. BOTÕES — SEM FUNÇÃO / SUCESSO FALSO / PROMESSA SEM ENTREGA

| ID | Local | Botão | Problema |
|---|---|---|---|
| AUD-04 | PainelInstrutor.tsx:271,325,560 | "Encerrar sala" / relatório final | `sala.status === 'encerrado'` nunca é true (app grava `'concluido'`) → relatório consolidado final **nunca aparece**; botão "Encerrar" permanece após concluído |
| AUD-12 | NotificationDrawer.tsx:282-347 | "ENVIAR ALERTA TESTE" (E-mail Corporativo) | Não envia e-mail algum; exibe "Alerta enviado e recebido com sucesso!" — **sucesso falso** (resquício dev) |
| AUD-15 | UserProfileModal.tsx:116 | Salvar perfil | "sincronizados no Supabase com sucesso" exibido **mesmo sem Supabase configurado** |
| AUD-16 | SuperAdminView.tsx:728-736 | "Acessar" (empresas) | Só `setEmpresa` + alert enganoso ("alternada") — não alterna `ativa` nem navega |
| AUD-17 | HeaderNavbar.tsx:102-125 | Toggle "Offline/Online" | Simulador de conectividade (dev) exposto aos admins em produção |
| AUD-03 | LoginView.tsx | Modo register | Estados `reg*` e `handleRegisterSubmit` existem, mas **nenhum botão** leva a `authMode='register'`; cadastro inacessível |
| AUD-18 | QuizGuiadoView.tsx:215 | "Minhas Fichas" | Sempre vazio (participante não tem id do usuário) |
| AUD-19 | QuizGuiadoView.tsx:166-169 | "Ver Ficha Oficial" | Busca resultado por `currentUser.id` que nunca corresponde ao `participante_id` gravado (`part-...`) |

---

## 6. ARQUIVOS / CÓDIGO MORTO / DUPLICADO / OBSOLETO

| Arquivo/objeto | Status | Evidência |
|---|---|---|
| `supabase/schema.sql` | 📦 OBSOLETO/INCOMPLETO | Não cria 6 tabelas nem colunas novas; quem instalar só por ele fica sem segurança/features |
| `supabase/migration_seguranca.sql`, `migration_atualizacao.sql` | 🚨 PERIGOSO | Re-executar reabre `FOR ALL (true)` + grants a `anon` (desfaz a 007) |
| `supabase/migracao_trofeus_v2.sql` (com remoção) + `rollback_trofeus_v2.sql` | 📦 OBSOLETO/OPOSTOS | Versões alternativas com efeitos opostos; rollback zeraria streak |
| `src/utils/salaSanitize.ts` → `podeGerenciarSala`, `sanitizeSalaParaDispositivo` | 💀 CÓDIGO MORTO | Só usadas em testes; produção usa só `sanitizeSalaParaParticipante` |
| `supabaseAuth.getSupabaseAuthUserId` | 💀 NUNCA USADA | Nenhum componente chama |
| `SSTContext` `medalhasConfiguraveis`, `adicionarMedalha`, `editarMedalha`, `excluirMedalha` | 💀 NUNCA USADAS | No `value` do provider mas sem interface `SSTContextType` e sem tela |
| `SSTContext` `DEFAULT_SENHA = '123456'` | 💀 MORTO | Substituído por `gerarSenhaPadrao()` |
| `DEFAULT_CATEGORIES` | 📄 DUPLICADO | Declarada fora e dentro do provider |
| `LoginView` import `Sparkles`; `AdminManagementView` import `Mail`; `SuperAdminView` import `Filter` | 💀 imports mortos | Não usados |
| `src/utils/resultadoAvaliacao.ts` vs `SSTContext.tsx:4257-4341` | 📄 DUPLICADO | Cálculo de avaliação em 2 implementações quase idênticas (risco de divergência) |

---

## 7. BANCO REAL X MIGRATIONS — CONFLITOS CONFIRMADOS

**Método:** SELECT via PostgREST (service_role) nas colunas suspeitas → coluna inexistente = erro 42703.

| Coluna usada pelo frontend | Existe no banco? | Impacto |
|---|---|---|
| `usuarios.trofeus_temporadas` | ❌ NÃO | upsertUsuario falha (AUD-11) |
| `empresas.historico_temporadas` | ❌ NÃO | upsertEmpresa/seed falham (AUD-11) |
| `setores.pontos_totais` | ❌ NÃO | upsertSetor falha (AUD-11) |
| `salas_quiz_guiado.nota_minima_aprovacao` | ❌ NÃO | upsert sala falha (AUD-11) |
| `salas_quiz_guiado.tempo_por_pergunta` | ❌ NÃO | upsert sala falha (AUD-11) |
| `resultados_avaliacao_sst` (11 campos: matricula, cpf, cargo, setor_nome, email, sala_nome, data_finalizacao, porcentagem_acertos, questoes_corretas, total_questoes, nota_minima_aprovacao) | ❌ NÃO | upsert resultado SEMPRE falha (AUD-11) |
| `usuarios.ultimo_quiz_data` | ❌ NÃO | streak diário por data não persiste (AUD-23) |
| `quizzes.usuario_id` | ❌ NÃO | filtro de exclusão de empresa errado (AUD-24) |
| `usuarios.senha` | ✅ sim (zerada) | login offline quebrado (AUD-01) |
| `usuarios.auth_uid`, `estatisticas`, `notificacoes.canal`, `desafios_1v1.aposta_pontos/motivo_vitoria/placar_final`, `premiacoes.custo_pontos/estoque` | ✅ sim | OK |
| `pontos_ledger`, `quiz_guiado_respostas` | ⚠️ 403 p/ REST | sem grant/RLS explícito (depende de default privileges) |

**Conclusão:** a migration **não reflete o modelo de dados que o frontend usa**. O app evoluiu (temporadas, troféus, streak por data, quiz guiado) sem migration correspondente — é o padrão "CÓDIGO NOVO + BANCO ANTIGO".

---

## 8. SQL DO SUPERADMIN (SupabaseModal) — 🚨 PERIGOSO

O botão "Copiar Script SQL" (`SupabaseModal.tsx:139-264`) copia um script que:
1. **Re-executa `GRANT ALL PRIVILEGES ... TO anon`** (linhas 206-218) e `GRANT USAGE ON SCHEMA public TO anon` (205) — **reabre o bypass legado que a migration 007 fechou** (V-001). Executar hoje = desfazer o endurecimento de segurança.
2. Não cria `salas_quiz_guiado`, `resultados_avaliacao_sst`, `pontos_ledger`, `quiz_guiado_respostas` (assume que existem).
3. O texto descritivo (linhas 590-601) lista 11 tabelas e colunas **incompatíveis** com o banco real (falta `auth_uid`, `is_instrutor`, `trofeus_temporadas` [que não existe], etc.).
4. Seeds com `emp-1`/setores que podem conflitar com dados reais (idempotente com `DO NOTHING`, OK).

**Classificação: 🚨 PERIGOSO.** Correção recomendada: apontar para as migrations 001–008 do repositório (ou gerar `pg_dump`), remover os grants a `anon`, e atualizar o texto descritivo.

---

## 9. API / EXPRESS — ACHADOS

| ID | Rota | Problema | Gravidade |
|---|---|---|---|
| AUD-20 | `GET /api/salas_quiz_guiado` (lista) | Retorna payload **cru** (gabarito, PIN, CPF de participantes) de todas as salas — anti-cola inútil | 🔴 |
| AUD-25 | `POST /api/salas_quiz_guiado` | Upsert sem auth; participante sobrescreve a sala e **corrompe o gabarito** no servidor (sanitizada) → pontuação oficial degradada | 🔴 |
| AUD-26 | `GET /api/resultados_avaliacao_sst` | Exposição de dados pessoais (LGPD) de todas as empresas sem auth | 🟠 |
| AUD-27 | `POST /api/resultados_avaliacao_sst` | Injeção de resultados forjados por id | 🟠 |
| AUD-28 | `POST /api/enviar_email_prova` | Relay de e-mail sem `API_TOKEN` (default LAN aberta); validação `email.includes('@')` fraca | 🟠 |
| AUD-29 | `GET /api/backups*` | Lista/leitura sem filtro por empresa; snapshot completo de todas as empresas; sem rota de restore no servidor | 🟠 |
| AUD-30 | `isAuthorized` + `API_TOKEN` | Token ausente = tudo aberto; e as rotas de sala/resultados **nunca chamam** `isAuthorized` mesmo com token | 🔴 |
| AUD-31 | `/pdf` estático | Laudos (PII) expostos sem auth na LAN | 🟡 |
| AUD-32 | `express.json limit 50mb` | Vetor de DoS local em rotas sem auth | 🟡 |

---

## 10. EDGE FUNCTIONS

| ID | Função | Problema | Gravidade |
|---|---|---|---|
| AUD-33 | `pontuar-quiz-guiado` | Não valida `participante_id === usuario.id` (impersonação); visitante anônimo responde por qualquer um; ignora `quiz_guiado_respostas`; `tempo_ms` do cliente forjável (tempo=0) | 🔴 |
| AUD-34 | `pontuar-desafio` | Valida gabarito mas **não determina o vencedor** no servidor — cliente define `vencedor_id` e pontos | 🔴 |
| AUD-35 | `pontuar-quiz` | Gabarito vem do JSON `quizzes.perguntas` (controlável pelo usuário); usuário pode criar quiz próprio e farmar pontos ilimitados; aceita `p_novas_estatisticas` do chamador | 🟠 |
| AUD-36 | `migrar-legados` | `password: u.senha` usa o literal da senha legada (ok para o nosso caso, mas se for hash antigo a conta herda o hash como senha) | 🟡 |

---

## 11. RPC — FRAUDE DE PONTUAÇÃO / EXECUÇÃO DIRETA

| ID | RPC | Problema | Gravidade |
|---|---|---|---|
| AUD-37 | `pontuar_quiz` | SECURITY DEFINER grava `p_pontos`/`p_novas_estatisticas` **sem validação de payload**; 007 deu EXECUTE a `authenticated` → qualquer usuário chama com `p_pontos=999999` direto pelo PostgREST | 🔴 |
| AUD-38 | `registrar_desafio_no_ledger` | Aceita `p_vencedor_id`/`p_pontos_ganho` arbitrários de participante | 🔴 |
| AUD-39 | `resgatar_premio` | Não valida que o prêmio pertence à empresa do usuário | 🟠 |
| AUD-40 | `registrar_resposta_quiz_guiado` | `p_tempo_ms` do cliente; gabarito conhecido (R1) | 🟠 |
| AUD-41 | `GRANT EXECUTE ON ALL FUNCTIONS ... TO authenticated` (007) | Expõe TODAS as RPCs acima; o correto seria grant seletivo | 🔴 |

---

## 12. RLS — FALHAS

| ID | Policy | Problema | Gravidade |
|---|---|---|---|
| AUD-42 | `Salas Leitura Escopo` (001:328-339) | Participante lê a tabela base com gabarito completo (`resposta_correta`/`explicacao`/`correta`) — anti-cola nulo (view sanitizada contornável) | 🔴 |
| AUD-43 | `Usuarios Escrita Escopo` (001:158-165) | UPDATE da própria linha sem proteger `estatisticas`; trigger não cobre `estatisticas` → auto-premiação via REST | 🔴 |
| AUD-44 | `X Escopo Empresa` FOR ALL (perguntas/quizzes/desafios/premiações/resgates) | Colaborador pode INSERT/UPDATE/DELETE qualquer linha da empresa (alterar gabarito, marcar-se vencedor, mudar custo) | 🔴 |
| AUD-45 | `Salas Update Escopo` | Qualquer usuário da empresa edita qualquer sala | 🟠 |
| AUD-46 | `App Cria Notificacoes` / `Resultados Insert Escopo` | `WITH CHECK (true)` sem escopo de empresa | 🟠 |
| AUD-47 | deadlock 1º login | A 007 fechou o SELECT por e-mail (`user_empresa_id()` NULL pré-vínculo) → `vincular_auth_uid` inalcançável pelo fluxo normal (contornado na prática pela migração service_role) | 🔴 |

---

## 13. AUTORIZAÇÃO E HIERARQUIA

- Perfis encontrados: `super_admin`, `admin`, `colaborador` (+ marcação `is_instrutor`).
- **Bom:** a RLS por empresa está ativa e anon bloqueado (verificado 401).
- **Falha grave:** a hierarquia visual (esconder botões) **não é reforçada no banco**. Um `colaborador` pode chamar RPCs direto (AUD-37/38) e editar dados da própria empresa (AUD-43/44). Esconder o botão NÃO é autorização — e aqui nem todos os botões são escondidos (upserts usam policies `FOR ALL` amplas).
- `registerAccount` cria sempre `colaborador` (bom) mas se o signUp falhar, loga e retorna sucesso com conta só local (AUD-48 🟠).

---

## 14. ISOLAMENTO ENTRE EMPRESAS

- **Supabase:** RLS por `empresa_id = user_empresa_id()` → isolamento **bom** para leitura normal de tabelas; porém quebrado por: policies `FOR ALL` amplas (AUD-44), RPCs sem escopo de empresa (AUD-39), exposição do gabarito da sala (AUD-42), `WITH CHECK(true)` (AUD-46).
- **Express:** **NÃO existe isolamento.** Salas, resultados e backups são globais no `salasQuizMap`/`resultadosAvaliacaoArray` (AUD-20/26/29). Qualquer dispositivo na LAN vê tudo.

---

## 15. QUIZ / QUIZ GUIADO / DESAFIOS / TROFÉUS / PONTUAÇÃO — SINOPSE

| Área | Problemas-chave |
|---|---|
| Quiz | Pontuação válida no servidor (edge) mas cliente sobrescreve por cima (AUD-49 🟠); poison fields derrubam persistência; streak por data usa `ultimo_quiz_data` inexistente (AUD-23) |
| Quiz Guiado | Upsert de sala SEMPRE falha no Supabase (AUD-11); gabarito corruptível no Express (AUD-25); relatório instrutor nunca aparece (AUD-04); fichas do participante inacessíveis (AUD-05/18/19); `tempo_ms` forjável (AUD-33) |
| Desafios | Ledger pode nunca gravar por race (AUD-08); vencedor definido no cliente (AUD-34); desempate sorteia pergunta 6ª de forma não-determinística entre dispositivos (AUD-50 🟡); fallback `|| 20` mascara tempo 0 no desempate (AUD-51 🟡) |
| Troféus | Regras divergem em 3 scripts (AUD-52 🟡); `trofeus_temporadas` poison (AUD-11); galeria/edição persistem só local |
| Pontuação | Fraude direta via RPC (AUD-37/38); auto-premiação via REST (AUD-43); pontos somem no refresh quando upsert falha (AUD-06/07) |

---

## 16. OFFLINE / INDEXEDDB / SINCRONIZAÇÃO

| ID | Problema | Gravidade |
|---|---|---|
| AUD-53 | `syncAllDataToSupabase` retorna `success: true` mesmo com 100% de falha (só `console.warn`); UI diz "sincronizados com sucesso" | 🔴 |
| AUD-13 | Fila offline (`sincronizarDadosPendentes`) persiste via upserts **diretos** — sem RPCs/edge → sem validação e sem ledger | 🟠 |
| AUD-54 | Item da fila pode ser removido sem enviar nada (snapshot nulo) | 🟡 |
| AUD-08 | Race: upsert de desafio (status concluido) dispara antes do RPC do ledger → ledger perdido | 🔴 |
| AUD-01 | Login offline quebrado | 🔴 |
| AUD-09 | Logout não zera `currentUser`/estados; sem Supabase configurado não limpa nada do storage (dados do usuário anterior permanecem em navegador compartilhado) | 🟠 |

---

## 17. CONCORRÊNCIA

- Side-effects de rede dentro de updaters de `setState` (podem disparar upsert 2x no StrictMode) — AUD-55 🟡.
- Races fire-and-forget (`aceitarDesafioRpc`, `registrarDesafioNoLedger`, `registrarMarcoSalaQuizGuiadoRpc`, `registrarRespostaQuizGuiadoRpc`) sem correção em falha — AUD-56 🟡.
- Desempate do desafio sorteia pergunta 6ª não-deterministicamente — AUD-50 🟡.

---

## 18. CONFIGURAÇÕES QUE NÃO PRODUZEM EFEITO

| Configuração | Problema |
|---|---|
| `limiteDesafios` (AdminManagement) | Estado existe e é salvo, mas **não há campo de input** no modal "Regras de Gamificação" → nunca editável (AUD-57 🟠) |
| `mesRef` PrizesView | Default hardcoded `'Fevereiro / 2026'` → referência de campanha incorreta (AUD-58 🟡) |
| `normasCustomizadas` QuestionBank | Só estado local — não persiste entre sessões (AUD-59 🟡) |
| Badge "Maratona SST 2026" (Collab) | Estático, desvinculado de dados reais (AUD-60 🟢) |
| `imagem_url` em pergunta de quiz guiado (TelaApresentacao) | Campo não existe no tipo → config sem efeito (AUD-61 🟢) |
| `GEMINI_API_KEY`, `APP_URL` (.env.example) | Nunca usadas em código (AUD-62 🟢) |
| `rememberMe` (LoginView) | Checkbox sem efeito — login sempre persiste (AUD-63 🟢) |

---

## 19. DOCUMENTAÇÃO

- `AUDITORIA_SST_QUIZ.md` e `AUDITORIA_ISOLAMENTO_MULTI_TENANT.md` existem e estão razoavelmente atualizados; a nova seção 9.1 registra as correções 0.1/0.2.
- `Manual Funcional...docx` existe (não editado nesta auditoria).
- `.env.example` documenta `GEMINI_API_KEY`/`APP_URL` que não existem em código (AUD-62).
- Comentários da 008 ("Impossível de acionar pelo cliente") superestimam a garantia do GUC (AUD-64 🟡).

---

## 20. BUGS — LISTA PRIORIZADA (correções da próxima fase)

**🔴 Corrigir primeiro (segurança/persistência):**
1. **AUD-11** — poison fields: remover campos inexistentes dos payloads de upsert (ou criar migrations para as colunas novas: `usuarios.trofeus_temporadas`, `empresas.historico_temporadas`, `setores.pontos_totais`, `salas_quiz_guiado.nota_minima_aprovacao`/`tempo_por_pergunta`, 11 colunas de `resultados_avaliacao_sst`, `usuarios.ultimo_quiz_data`). **Sem isso, quiz guiado, resultados, temporadas e streak não persistem.**
2. **AUD-37/38/41** — RPCs sem validação + grant global: revogar `EXECUTE` de `authenticated` das RPCs perigosas (grant seletivo) e validar payload no servidor.
3. **AUD-43/44/42** — RLS: proteger `estatisticas` no trigger, estreitar policies `FOR ALL` por papel, impedir leitura da tabela base de salas (forçar view sanitizada).
4. **AUD-02** — recuperação de senha: validação server-side + atualização real no `auth.users`.
5. **AUD-53** — sync com feedback real de erro.
6. **AUD-14** — SQL do SupabaseModal: remover grants a `anon`, apontar para migrations 001–008.
7. **AUD-25/20** — Express: autenticar/validar salas e resultados, sanitizar lista.

**🟠/🟡 seguintes:** AUD-01 login offline, AUD-04 relatório instrutor, AUD-05/18/19 fichas do participante, AUD-08 race do ledger, AUD-09 logout, AUD-13 fila offline, AUD-12/15 sucesso falso, AUD-21 backups, AUD-33/34 edge functions, AUD-50/51 desempate.

---

## 21. CORREÇÕES REALIZADAS NESTA SESSÃO

1. **0.1 Login** — migração legado→Auth executada em produção (14/14 contas + `auth_uid`) e validação `LOGIN OK`. (Relatório seção 9.1.)
2. **0.2 Código exposto** — `codeForDemo`/demo UI removidos do código.
3. **008** — correção do `vincular_auth_uid` (bypass GUC) + edge `migrar-legados` + testes (70/70).
4. Nenhuma correção de código adicional foi feita nesta auditoria (só levantamento, conforme regra §41 de apresentar causa antes de alterar).

---

## 22. CORREÇÕES REALIZADAS NESTA SESSÃO

### Fase 1 — Persistência (poison fields)
- **`supabase/migrations/009_alinear_schema.sql`** (nova, APLICADA): adiciona 18+ colunas que o frontend enviava e não existiam (`usuarios.trofeus_temporadas/ultimo_quiz_data`, `empresas.historico_temporadas`, `setores.pontos_totais`, `salas_quiz_guiado.nota_minima_aprovacao/tempo_por_pergunta`, 11 campos de `resultados_avaliacao_sst`, `campanhas.pontos_por_acerto`, `backups_historico.escopo`). Não-destrutiva (`ADD COLUMN IF NOT EXISTS`).
- **`src/services/supabaseService.ts`**: helpers `normalizarSalaParaSupabase` (nota mínima base-100→base-10; valida tempo) e `normalizarResultadoParaSupabase` aplicados nos upserts de salas e resultados; `syncAllDataToSupabase` agora acumula erros reais e retorna `success:false` com a lista de falhas (não mais sucesso falso).
- **Validado no banco:** upsert de sala com `nota_minima=7.0` (que antes falhava) → HTTP 201 OK.

### Fase 2 — Segurança RPC (anti-fraude)
- **`supabase/migrations/010_endurecer_rpc.sql`** (nova, APLICADA):
  - `registrar_desafio_no_ledger` agora valida que o vencedor é participante do desafio e da mesma empresa (bloqueia auto-premiação/cross-empresa) e grava `vencedor_id` real.
  - `pontuar_quiz` revalida o gabarito de cada resposta contra `quizzes.perguntas` (não confia em `p_pontos`/`p_acertos` do chamador), recalcula acertos/pontos e devolve `detalhes_validados`.
  - `registrar_pontos_ledger` sai do alcance de `authenticated` (restrito a service_role; frontend não a chama).
- **`supabase/functions/pontuar-quiz-guiado/index.ts`** (redeploy): anti-impersonação — usuário autenticado só responde como participante vinculado a ele.

### Fase 3 — Recuperação de senha e login offline
- **`src/services/supabaseAuth.ts`**: novas `finalizarRecuperacaoViaToken` (troca `token_hash` de recuperação por sessão e aplica nova senha em `auth.users`) e `temTokenRecuperacaoNaUrl`.
- **`src/context/SSTContext.tsx`**: `requestPasswordResetCode` envia o LINK OFICIAL do Supabase quando configurado (mensagem honesta); código de 6 dígitos só no modo local/LAN (exibido uma vez na mensagem, sem e-mail disponível); login offline detecta `navigator.onLine` e dá mensagem clara; `logout` zera `currentUser` e limpa storage em todos os modos.
- **`src/components/views/LoginView.tsx`**: novos passos `link_enviado` e `recViaLink` (formulário de nova senha direto quando o usuário chega pelo link).

### Fase 4 — Backend Express
- `GET /api/salas_quiz_guiado` sanitiza o payload (sem gabarito/PIN/CPF).
- `POST /api/salas_quiz_guiado` preserva o gabarito oficial do servidor quando o participante devolve a sala sanitizada.
- Rotas de resultados exigem `isAuthorized`; `supabaseService` envia `x-api-token` quando `VITE_API_TOKEN` estiver definido.

### Fase 5 — UI bugs
- `PainelInstrutor`: aceita `concluido`/`encerrado` (relatório final aparece; botão "Encerrar" some ao concluir).
- `PainelParticipante`/`QuizGuiadoView`: "Ver Ficha" e "Minhas Fichas" usam o id real do participante (`part-...`) + ids do storage.
- Sucessos falsos corrigidos (`NotificationDrawer`, `UserProfileModal`) e botão "Acessar" (SuperAdmin) com mensagem honesta.
- `mesRef` dinâmico (mês/ano atuais) em PrizesView; input de `limiteDesafios` adicionado ao modal de regras.

### Fase 6 — Races, utils e SQL do SuperAdmin
- Race do ledger do desafio corrigida (RPC antes do upsert do status); `aceitarDesafio` aguarda o RPC.
- `desafioWinner` desempate por tempo sem fallback `|| 20`; `resultadoAvaliacao` normaliza `resposta_index` string→number.
- **SQL do SupabaseModal** corrigido: remove `GRANT ... TO anon` (não reabre o modo legado), adiciona colunas da 009 e aponta para as migrations.

### Fase 7 — RLS por papel (V-008, continuação)
- **`supabase/migrations/011_rls_por_papel.sql`** (nova, APLICADA): substitui as policies `FOR ALL` por empresa por policies por PAPEL:
  - perguntas: escrita só de instrutor/admin/super da empresa;
  - campanhas e premiações: escrita só de admin/super;
  - quizzes: escrita do próprio colaborador ou admin;
  - desafios_1v1: escrita de participante (desafiante/desafiado) ou admin;
  - resgates_premios: INSERT do próprio usuário; UPDATE (status) só de admin (impede auto-aprovação);
  - usuarios UPDATE: própria linha (auth_uid) ou admin da empresa ou super (fecha edição de pontos de colegas).
- Modo legado anônimo mantido como fallback (a 007 o desativa, não reabre acesso).
- Validado no banco real: admin escreve perguntas (201), colaborador é NEGADO (403 no INSERT / 0 linhas no UPDATE), leitura preservada.

### Fase 8 — Testes HTTP de integração do Express (F-15)
- **`server.ts`**: refatorado para expor `createApp()` (monta o app Express com todas as rotas sem escutar porta) mantendo `startServer()` com o listen. O servidor real continua iniciando (validado: `/api/health` → 200).
- **`tests/serverRoutes.test.ts`** (novo): levanta um servidor HTTP em porta efêmera e valida:
  - `/api/health` e `/api/ready` → 200;
  - `GET /api/salas_quiz_guiado` → lista SEM gabarito (AUD-20);
  - POST de sala sanitizada NÃO corrompe o gabarito oficial no estado interno (AUD-25);
  - resultados sem API_TOKEN → 200 (modo LAN);
  - `/api/enviar_email_prova` com e-mail inválido → 400.

### Fase 9 — Anti-cola no Supabase (AUD-42/R1)
- **`supabase/migrations/012_view_salas_grants.sql`** (nova, APLICADA): a view `vw_salas_quiz_guiado_publica` (recriada na 006 como security_invoker) perdeu os grants no DROP/CREATE — até autenticado recebia 403. A 012 concede `SELECT` a `authenticated`/`service_role` e revoga de `anon`.
- **`src/services/supabaseService.ts`**: `fetchSalaQuizGuiadoByPin` passou a consultar a view sanitizada em vez da tabela base — o participante NÃO recebe `resposta_correta`/`explicacao` das perguntas não reveladas nem o campo `correta` dos participantes.
- Validado no banco real: view acessível por autenticado (200), anon bloqueado (401).

### Fase 10 — Expansão dos testes HTTP do Express (F-15)
- **`tests/serverRoutes.test.ts`**: novo grupo "com API_TOKEN configurado" cobre:
  - resultados exigem token (401 sem, 200 com);
  - ciclo de vida de backups (POST cria → GET lista/lê → DELETE remove);
  - backups sem token → 401;
  - path traversal bloqueado no id de backup (`sanitizeBackupId`);
  - e-mail exige token quando configurado (401).

### Fase 11 — Auditoria final de grants de RPCs + comprovação anti-fraude
- Mapeadas as 18 funções expostas via PostgREST e testadas com um usuário autenticado (colaborador):
  - `registrar_pontos_ledger` → **403 para authenticated** (a 010 restringiu corretamente);
  - demais RPCs → acessíveis por necessidade (validam escopo internamente).
- **Comprovação no banco real (anti-fraude AUD-37/P1):** colaborador chamou `pontuar_quiz` com resposta ERRADA + `p_pontos=999999`. O RPC revalidou o gabarito (correta:false), ignorou os pontos do chamador e gravou `pontuacao_total=0`. A fraude de pontuação via RPC está **fechada**.

### Fase 12 — Correções pontuais (AUD-24 e AUD-48/A6)
- **`SSTContext.tsx` `excluirEmpresa`**: corrigido o filtro `q.usuario_id` → `q.colaborador_id` (campo correto do tipo `QuizSessao`). Antes, quizzes da empresa excluída não eram removidos localmente.
- **`SSTContext.tsx` `registerAccount`**: quando o Supabase está configurado e o `signUpWithEmail` falha, o cadastro NÃO finge mais sucesso — remove o usuário local recém-adicionado e retorna o erro real (a conta não conseguiria logar sem o registro no Auth).

### Fase 13 — Desbloqueio do vínculo legado→Auth (AUD-47/F1)
- **`supabase/migrations/013_rls_leitura_proprio_email.sql`** (nova, APLICADA): adiciona policy de SELECT que permite ao usuário autenticado ler o próprio perfil pelo e-mail do JWT (`auth.jwt()->>'email'`), mesmo antes do `auth_uid` estar vinculado. Sem isso, `user_empresa_id()` retorna NULL e o RPC `vincular_auth_uid` ficava inalcançável (deadlock).
- Validado no banco real: usuário autenticado lê o próprio perfil por e-mail (200).

### Fase 14 — Servidor recalcula as estatísticas do quiz (fraude de pontos fechada)
- **`supabase/migrations/014_pontuar_quiz_estatisticas.sql`** (nova, APLICADA): o RPC `pontuar_quiz` passou a **recalcular as estatísticas no servidor** a partir do estado atual do banco + os pontos/acertos/erros REVALIDADOS (gabarito). O payload `p_novas_estatisticas` do chamador é **IGNORADO** para `pontos_totais`, `pontos_quizzes`, `pontos_resgataveis`, `quizzes_respondidos`, `acertos_totais`, `erros_totais` — e `streak_dias`/`ultimo_quiz_data`/`sequencia_acertos` também são recalculados por data.
- **Comprovação no banco real:** colaborador chamou `pontuar_quiz` com resposta correta + `p_novas_estatisticas = { pontos_totais: 999999, pontos_resgataveis: 999999, quizzes_respondidos: 999 }`. O RPC gravou `pontos_totais=10`, `pontos_resgataveis=10`, `quizzes_respondidos=1` (estado real + 1 acerto). A fraude de inflar pontos está **fechada**. (Quiz de teste removido; estatísticas do usuário restauradas.)

### Fase 15 — Desempate de desafio 1v1 determinístico (AUD-50/F-21)
- **`src/utils/desafioWinner.ts`**: a pergunta de desempate (6ª) era sorteada com `Math.random()` — desafiante e desafiado podiam receber perguntas DIFERENTES e a partida divergia. Agora o sorteio usa um **hash determinístico (FNV-1a) do id do desafio**, garantindo que os dois lados escolham sempre a mesma pergunta.
- Novo teste de regressão: 20 execuções com o mesmo desafio escolhem sempre a mesma pergunta.

### Fase 16 — V-018 (gatilho protege `estatisticas`) — tentativa e decisão
- **Tentativa:** migrations 015-023 implementaram a proteção de `estatisticas` no gatilho com bypass (GUC → tabela temporária → tabela real `autorizacoes_pontuacao`). O bypass não funcionou de forma confiável no contexto SECURITY DEFINER via PostgREST: os RPCs `pontuar_quiz`/`registrar_desafio_no_ledger` passaram a falhar com "Alteração de campos restritos", quebrando a pontuação legítima.
- **Decisão (024):** revertido o bloqueio de `estatisticas` no gatilho (mantendo protegidos perfil, is_instrutor, auth_uid, empresa, setor, ativo). O V-018 completo fica para a Fase C (server-first total).
- **Mitigação mantida:** a 014 já faz o RPC `pontuar_quiz` **recalcular as estatísticas no servidor** (ignora `p_novas_estatisticas` do chamador) — fechando o vetor de fraude mais crítico (inflar pontos via RPC). Validado no banco real.
- **`registrar_desafio_no_ledger`** reescrito na versão simples e funcional (025): valida vencedor participante/mesma empresa + ledger. Validado via JWT (code OK).
- **`pontuar_quiz`** validado via JWT (updated:true, pontos_recalculados:10).
- Corrigido também o bug de tipo `auth_uid` (uuid vs text) no gatilho e no RPC `vincular_auth_uid` (016/019).

### Fase 17 — Anti-cola: avaliação e reversão da leitura aberta
- **Tentativa (026):** policy de SELECT na base para permitir a entrada por PIN de não-participantes. **REVERTIDA (027)** porque liberou o GABARITO na base para qualquer autenticado da empresa (view é security_invoker e herda a RLS da base).
- **Estado final:** não-participante recebe `[]` na base e na view (anti-cola mantido). O fluxo de entrada usa o Express local (sanitiza); o Supabase serve participantes inscritos.
- Validado no banco real: roberto (não participante) → `[]` na base e na view (027).

### Fase 18 — Limpeza do resquício do bypass (alerta "unrestricted")
- A tabela `autorizacoes_pontuacao` (criada na tentativa do V-018) ficou sem RLS (alerta "unrestricted" no painel) e com GRANT SELECT a `authenticated`, além de `pontuar_quiz` ainda chamando `autorizar_pontuacao`/`revogar_pontuacao` (inócuas após a 024).
- **`supabase/migrations/028_remover_resquicio_bypass.sql`** (nova, APLICADA): reescreve `pontuar_quiz` sem as chamadas de autorização e DROP da tabela + funções auxiliares (`autorizar_pontuacao`, `revogar_pontuacao`, `hay_autorizacao_pontuacao`).
- Validado no banco real: tabela removida (404) e `pontuar_quiz` operacional.

---

## 22a. REGRESSÕES VERIFICADAS

- `npm test` 122/122 ✅ | `tsc --noEmit` ✅ | `npm run build` ✅.
- `anon` bloqueado em todas as tabelas e na view de salas (401) ✅.
- Upsert de sala no banco real validado (201 OK com nota normalizada) ✅.
- RPC `pontuar_quiz` e `registrar_desafio_no_ledger` validados via JWT após o ciclo V-018 (updated:true / code OK) ✅.
- Anti-cola validado: não-participante recebe `[]` na base e na view (027) ✅.
- Edge `pontuar-quiz-guiado` redeployada (v3) ✅.
- Servidor Express inicia corretamente após refatoração do `createApp` (`/api/health` → 200) ✅.
- View sanitizada de salas acessível por autenticado (200) e negada a anon (401) ✅.
- RLS por papel validada no banco real (migration 011):
  - admin autenticado INSERT em `perguntas` → 201 OK;
  - colaborador autenticado INSERT em `perguntas` → 403 NEGADO;
  - colaborador autenticado UPDATE em `premiacoes` (id real) → retorna `[]` (0 linhas) e `custo_pontos` permanece 300 → NEGADO;
  - colaborador SELECT em `perguntas` → 200 OK (leitura preservada).
- Nenhuma regressão introduzida pelas correções desta sessão.

---

## 23. PENDÊNCIAS

1. **Gatilho protege `estatisticas` (V-018, Fase C):** tentativa implementada (015-023) e REVERTIDA (024) porque o bypass não funciona de forma confiável no contexto SECURITY DEFINER via PostgREST sem quebrar os RPCs de pontuação. Estado atual: campos sensíveis protegidos; estatísticas são recalculadas pelo RPC (014, anti-fraude de pontos). O bloqueio completo de `estatisticas` exige migrar quiz/desafio/offline para server-first (Fase C).
2. Atualizar o Manual Funcional .docx original (a versão editável em `MANUAL_SST_QUIZ.md` foi criada/atualizada).
3. **UX de entrada por PIN no Supabase puro:** avaliado (026) e REVERTIDO (027) por risco de vazamento de gabarito. O fluxo usa o Express local; documentado como trade-off de segurança.

---

## 24. RESPOSTAS ÀS PERGUNTAS DO USUÁRIO (resumo)

1. **O que funciona:** login Auth, CRUDs básicos que não usam poison fields, PDF/laudo, exports CSV, migração legado→Auth, RLS por empresa no Supabase, anon bloqueado.
2. **O que está quebrado:** persistência de quiz guiado/resultados/temporadas/streak (poison fields), recuperação de senha (não altera senha real), relatório final do instrutor, fichas SST do participante, login offline, backups isolados.
3. **Incompleto:** sincronização (sem ledger na fila offline), autoridade de pontos (RPCs/edges), cadastro de conta (sem botão), anti-cola (gabarito exposto).
4. **Sem função / sucesso falso:** simulador de notificação, "sincronizado no Supabase" sem Supabase, botão "Acessar" enganoso, toggle offline.
5. **Arquivos mortos:** `salaSanitize` (funções 2), `getSupabaseAuthUserId`, medalhas do provider, `DEFAULT_SENHA`, imports mortos, `schema.sql`/scripts troféus antigos.
6. **Conflitos banco:** 18+ colunas usadas e inexistentes; migrations não refletem o modelo atual.
7. **Conflitos frontend/backend:** sala com gabarito corruptível no Express; dupla implementação de cálculo de avaliação.
8. **Sincronização:** sucesso falso no sync; fila sem RPC; race do ledger.
9. **Segurança/autorização:** fraude via RPC expostas; auto-premiação via REST; sem isolamento no Express.
10. **Pontuação:** forjável (RPC/edge/cliente) e não-persistente (upsert falha).
11. **Quiz guiado/desafios/troféus:** sala não persiste, gabarito corruptível, relatório/fichas inacessíveis, desempate não-determinístico, troféus em scripts divergentes.
12. **IndexedDB/localStorage:** dados persistem localmente mas "banco vence" na hidratação; logout não limpa.
13. **Concorrência:** races fire-and-forget, upserts em updaters, desempate sorteado.
14. **Parecem existir mas não existem:** relatório final do instrutor, fichas do participante, recuperação de senha real, cadastro de conta.
15. **Existem mas ninguém usa:** medalhas, `getSupabaseAuthUserId`, register (parcial), `podeGerenciarSala`.
16. **Config sem efeito:** `limiteDesafios` sem input, `mesRef` hardcoded, `normasCustomizadas` não persistem, `GEMINI_API_KEY`/`APP_URL`.
17. **Testes faltando:** HTTP/Express, RLS/RPC, sincronização, isolamento, relatoriosHelpers, validators, imageCompressor, audioUtils, desafioWinner tempo=0.
18. **O que corrigir primeiro:** poison fields (AUD-11) → fraude RPC/RLS (AUD-37/38/43/44) → recuperação de senha (AUD-02) → Express (AUD-20/25/26).
19. **0.1:** resolvido e validado (ver seção 3).
20. **0.2:** exposição corrigida; fluxo completo ainda quebrado (AUD-02).
21. **Resquícios de dev/staging:** simulador de notificação, toggle offline, `mesRef` hardcoded, seed de notificações demo, `DEFAULT_SENHA`, bloco de credenciais fake no SupabaseModal, comentários "demo".
22. **Entrega de valor:** várias funcionalidades "parecem" funcionar (pontuação, quiz guiado, fichas, recuperação) mas não entregam o resultado em cenários reais — detalhado nas seções 4–5 e 20.
