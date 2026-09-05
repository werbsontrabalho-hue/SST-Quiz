# Auditoria de Isolamento Multi-Tenant — SST Quiz Corporate

> Data: 16/08/2026 · Escopo: Empresa A vs Empresa B (isolamento horizontal) + autorização vertical (perfis) + integridade de pontuação/níveis/troféus/backups.
> Método: leitura das camadas Express → Supabase (migrations 001–006, RLS, RPCs, GRANTs) → edge functions → serviço/contexto do app → testes.

---

## 1. Resumo Executivo

**Veredito: o isolamento multi-tenant NÃO é garantido no estado atual.** Ele só funcionaria se houvesse sessão autenticada (Supabase Auth) **e** o "modo legado anônimo" estivesse desativado. Hoje o modo legado está **ativo por padrão**, o login legado por senha **não cria sessão**, e o app **hidrata o estado antes de qualquer login** — três condições que tornam o `auth.uid() IS NULL` permanente e abrem **todas as tabelas de todas as empresas** para quem tiver a chave pública `anon` (embutida no bundle do frontend).

Pontos principais:

| Área | Status |
|---|---|
| Isolamento horizontal (A vs B) | ❌ Ineficaz enquanto o modo legado estiver ativo |
| Isolamento vertical (colaborador vs admin) | ❌ Colaborador tem CRUD amplo na própria empresa (setores, perguntas, quizzes, desafios, premiações, resgates) |
| Pontuação/estatísticas (forja) | ❌ RPCs de pontuação confiam em valores do cliente; UPDATE `usuarios` permite alterar `estatisticas` de colegas |
| Quiz guiado (gabarito) | ❌ Gabarito chega ao participante via Supabase/realtime/upsert (sanitização só existe na rota Express) |
| Backups | ⚠️ Token opcional; snapshot multi-tenant; RLS de super_admin minada pelo legado |
| Defesa já existente | ✅ resgatar_premio/aceitar_desafio/marcos server-side, gatilho anti-autopromoção, views sanitizadas, rate limit no Express, edges pontuar-quiz/pontuar-desafio |

---

## 2. Arquitetura em Camadas (como os dados fluem)

```
[App: estado + localStorage + IndexedDB sst_offline]
   │  hydration NO MOUNT (antes de login) → baixa TODAS as empresas
   ▼
[Supabase: anon key (pública) / JWT (sessão)]
   │  RLS (001) · RPCs (003–006) · realtime channel public:realtime_sst_channel
   ▼
[Edge functions: Bearer + service_role]
[Express LAN: /api/salas_quiz_guiado, /api/resultados_avaliacao_sst, /api/backups, /api/enviar_email_prova]
```

- **Auth**: `signInWithEmail` → consulta `v_usuarios_sem_senha` por `auth_uid` para mapear ao usuário local. **Login legado (senha pura) não cria sessão**.
- **Hydration** (`SSTContext.tsx` ~1514–1561): roda no mount, `supabaseHidratouRef` impede dupla carga, chama `fetchAllData()` sem filtro de empresa.
- **Realtime**: listener grava payloads completos (salas incluem `resposta_correta`) no estado.
- **Quiz guiado**: sala existe em 3 lugares (Express `salasQuizMap`, Supabase `salas_quiz_guiado`, localStorage). Participante consulta PIN → Express (sanitiza) → fallback Supabase (`select('*')` **sem sanitizar**).

---

## 3. Matriz de Autorização (comportamento REAL atual)

Legenda: C=criar R=ler U=atualizar D=excluir · "—" = bloqueado · "T" = total

### 3.1 Banco de dados (Supabase RLS — estado real com modo legado ATIVO)

| Recurso | Colaborador A | Admin/Instrutor A | Super Admin | Empresa B | Anônimo/legado |
|---|---|---|---|---|---|
| empresas | R própria | R/U própria | CRUD T | — | **CRUD T** |
| setores | **CRUD própria** | CRUD própria | CRUD T | — | **CRUD T** |
| usuarios | R própria · U própria* · D — | R/U/I/D empresa | T | — | **CRUD T** |
| perguntas (gabarito) | **CRUD própria** | CRUD própria | T | — | **CRUD T** |
| campanhas | **CRUD própria** | CRUD própria | T | — | **CRUD T** |
| quizzes | **CRUD própria** | CRUD própria | T | — | **CRUD T** |
| desafios_1v1 | **CRUD própria** | CRUD própria | T | — | **CRUD T** |
| premiacoes | **CRUD própria** | CRUD própria | T | — | **CRUD T** |
| resgates_premios | **CRUD própria** | CRUD própria | T | — | **CRUD T** |
| notificacoes | R própria · **I p/ qualquer usuário** | R própria · I p/ qualquer | T | — | **CRUD T** |
| backups_historico | — | — | CRUD T | — | **CRUD T** |
| salas_quiz_guiado | R participante · **U qualquer usuário da empresa** · I/D — | CRUD empresa | T | — | **CRUD T** |
| resultados_avaliacao_sst | R própria · **I p/ qualquer** · U/D — | R/U/D instrutor/admin | T | — | **CRUD T** |

\* UPDATE próprio: o gatilho `bloquear_autopromocao` bloqueia alterar `perfil/is_instrutor/auth_uid/empresa/setor/ativo` na própria linha — **mas não bloqueia `estatisticas`**.

### 3.2 RPCs (autenticado; modo legado mantém comportamento antigo)

| RPC | Escopo validado | Valores confiáveis? |
|---|---|---|
| resgatar_premio | self + mesma empresa (autenticado) | ✅ custo/estoque/saldo autoritativos, FOR UPDATE, ledger |
| reembolsar_resgate | admin/instrutor/super da empresa | ✅ custo do registro |
| aceitar_desafio | só o próprio desafiado | ✅ |
| registrar_marco_sala_quiz_guiado | instrutor/admin/super | ✅ |
| registrar_pontos_ledger | só super_admin | ✅ |
| pontuar_quiz | próprio quiz OU admin/instrutor da empresa | ❌ `p_pontos`, `p_acertos`, `p_erros`, `p_detalhes`, `p_novas_estatisticas` **arbitrários** |
| registrar_desafio_no_ledger | participante OU admin da empresa | ❌ `p_vencedor_id` e `p_pontos_ganho` **arbitrários** |
| registrar_resposta_quiz_guiado | self OU admin/instrutor da empresa | ❌ **não valida janela de tempo** (`question_ends_at`); não valida participação na sala |

### 3.3 Edge functions (Bearer + service_role; `pontuar-quiz`/`pontuar-desafio` OK)

| Edge | Escopo/valores |
|---|---|
| pontuar-quiz | ✅ recalcula pontos no servidor, valida empresa + dono do quiz |
| pontuar-desafio | ✅ `user_id` deve ser o autenticado; recalcula pontos |
| pontuar-quiz-guiado | ❌ **não verifica `participante_id` == usuário autenticado** (impersonação intra-empresa); janela com TOLERANCIA_MS=1500 ok; duplicidade ok |

### 3.4 Express (LAN; rate limit por IP; API_TOKEN opcional)

| Rota | Auth | Rate limit | Observação |
|---|---|---|---|
| GET /api/salas_quiz_guiado | ❌ | — | lista salas (status ativos) |
| GET /api/salas_quiz_guiado/pin/:pin | ❌ | 12/min | sanitiza gabarito ✅ |
| POST/DELETE /api/salas_quiz_guiado | ❌ | 60/min | cria/altera/remove salas **sem auth** |
| GET/POST /api/resultados_avaliacao_sst | ❌ | 120/min | laudos **sem auth** |
| /api/backups (CRUD) | ⚠️ `API_TOKEN` | 30/min | sem API_TOKEN → LAN aberta; snapshot multi-tenant |
| POST /api/enviar_email_prova | ⚠️ `API_TOKEN` | 10/min | sem API_TOKEN → LAN aberta |
| /api/health, /ready, /public-base-url | — | — | info pública |

---

## 4. Vulnerabilidades Classificadas

ID · Gravidade · Causa raiz · Correção · Teste

### CRÍTICO

**V-001 — Modo legado anônimo abre o banco inteiro.**
`001_rls_consolidada.sql` cria a policy "Legado Anonimo" `FOR ALL USING (modo_legado_anonimo()) WITH CHECK (modo_legado_anonimo())` em **todas as 13 tabelas**; `modo_legado_anonimo()` = `auth.uid() IS NULL`; `supabase/migration_seguranca.sql` (linhas 354–366) executa `GRANT ALL ON ALL TABLES/FUNCTIONS/SEQUENCES TO anon`. A anon key é pública (bundle + localStorage `sst_supabase_anon_key`).
→ Qualquer request sem JWT = CRUD em todas as empresas (incluindo gabaritos, pontos, laudos, backups).
**Correção:** desativar o legado em 2 fases: (1) `modo_legado_anonimo()` → `SELECT false` + `REVOKE ALL ... FROM anon`; (2) migrar login legado para Supabase Auth (gerar `auth_uid` e verificar senha por RPC com hash, nunca texto puro). A nota final de `006_seguranca_hardening.sql` já documenta os comandos exatos.
**Teste:** com anon key e SEM JWT, `SELECT id FROM empresas` → 0 linhas; com JWT de empresa A, `empresas` → só A.

**V-002 — Hydration no mount baixa todas as empresas antes de qualquer login.**
`fetchAllData()` (`supabaseService.ts:51-107`) faz `select('*')` em todas as tabelas **sem filtro de empresa**, e o `useEffect` de hidratação roda no mount (`SSTContext.tsx` ~1514–1561), antes do login → com V-001, o estado e o localStorage ficam com TODAS as empresas.
**Correção:** só hidratar com sessão ativa e depender da RLS escopada (após desativar legado); adicionar `user_empresa_id()` nas queries quando autenticado.
**Teste:** logado como usuário da empresa A → estado contém apenas A.

**V-003 — Login legado não cria sessão, perpetuando o bypass.**
`loginWithCredentials` tenta `signInWithEmail`; no fallback legado valida senha em texto puro e só grava `sst_current_user_id` no localStorage — `auth.uid()` continua NULL → RLS "Legado Anonimo" segue valendo.
**Correção:** exigir Supabase Auth (vincular `auth_uid` no cadastro/primeiro login); remover o caminho legado.
**Teste:** login legado → sessão inexistente deve ser bloqueada após desativar legado.

**V-004 — RPC `pontuar_quiz` aceita pontos/estatísticas forjadas.**
`006:426-483`: valida escopo (próprio quiz ou admin da empresa) mas grava `p_pontos`, `p_detalhes`, `p_novas_estatisticas` **como vieram do cliente**. Colaborador infla a própria pontuação, acertos, erros e qualquer campo de `estatisticas` do seu quiz.
**Correção:** calcular pontuação server-side a partir das respostas (como a edge `pontuar-quiz`) ou validar `p_pontos` contra `p_detalhes`; impedir que `p_novas_estatisticas` altere campos além dos derivados da partida.
**Teste:** chamar RPC com `p_pontos=999999` e `p_acertos=999` → rejeitado.

**V-005 — RPC `registrar_desafio_no_ledger` aceita vencedor e pontos arbitrários.**
`006:256-311`: autenticado só precisa ser participante ou admin da empresa; `p_vencedor_id` pode ser qualquer usuário da empresa e `p_pontos_ganho` qualquer valor (não conferido com `tipo`/`aposta_pontos`). Participante se declara vencedor com pontos altos.
**Correção:** restringir `p_vencedor_id ∈ {desafiante, desafiado}` e derivar pontos do servidor (`aposta_pontos`/tipo), ignorando os argumentos de valores do cliente.
**Teste:** participante liquida com vencedor=self e pontos inflados → rejeitado.

**V-006 — RPC `registrar_resposta_quiz_guiado` não valida janela de tempo nem participação.**
`006:316-385`: recalcula gabarito e pontua, mas **não** confere `NOW() <= question_ends_at + tolerância` e não valida que `p_participante_id` está em `participantes`. Resposta fora do tempo pontua; participante de fora da sala responde.
**Correção:** no RPC, checar `question_started_at <= NOW() <= question_ends_at + 1500ms` e presença em `participantes` (ou permissão de gerenciador).
**Teste:** resposta enviada após `question_ends_at` → `pontosAdicionais=0` (ou recusada).

**V-007 — Edge `pontuar-quiz-guiado` permite impersonação intra-empresa.**
A edge valida janela/duplicidade/escopo da sala, mas **não** confere `participante_id == auth.uid()`. Usuário A responde como participante B da mesma sala → infla a pontuação de B. Visitantes (`permitir_visitantes`) podem responder por qualquer participante autenticado.
**Correção:** na edge, se `authData.user` existir, exigir `participante_id` igual ao `auth_uid` do usuário (via tabela `usuarios`); visitantes só podem responder como visitante.
**Teste:** usuário A envia resposta com `participante_id` de B → 403/ACESSO_NEGADO.

### ALTO

**V-008 — Policies "Escopo Empresa" `FOR ALL` dão CRUD completo a qualquer colaborador.**
`setores` (001:132), `perguntas` (001:191), `campanhas` (001:206), `quizzes` (001:221), `desafios_1v1` (001:236), `premiacoes` (001:251), `resgates_premios` (001:266) — todas com `FOR ALL` para `empresa_id = user_empresa_id()`. Colaborador altera/exclui gabaritos (perguntas), modifica premiações (custo/estoque), exclui resgates, forja desafios. O isolamento horizontal existe, mas **não há hierarquia vertical**.
**Correção:** separar políticas: SELECT/INSERT por papel; UPDATE/DELETE apenas admin/instrutor (e super).
**Teste:** colaborador tenta `UPDATE perguntas SET resposta_correta=...` → negado.

**V-009 — "Salas Update Escopo" permite a qualquer usuário da empresa alterar a sala.**
`001:347-368`: o USING/WITH CHECK inclui a cláusula genérica `empresa_id = user_empresa_id()` → colaborador A edita pin, `perguntas` (gabarito), `participantes` e pontuações de qualquer sala da empresa.
**Correção:** remover essa cláusula; permitir UPDATE só a instrutor/admin da empresa, super ou participante (via array `participantes`) — como já ocorre no INSERT.
**Teste:** colaborador tenta alterar `perguntas` de uma sala → negado.

**V-010 — INSERT `WITH CHECK (true)` em `notificacoes` e `resultados_avaliacao_sst`.**
`001:292` (`App Cria Notificacoes`) e `001:407` (`Resultados Insert Escopo`): qualquer usuário cria notificações para qualquer um e forja laudos de avaliação (incluindo situação APROVADO/nota). Modo legado torna isso anônimo.
**Correção:** notificação só para o próprio/empresa; resultado só para sala em que o usuário é participante/instrutor/admin (ou super).
**Teste:** usuário A cria resultado apontando `participante_id` da empresa B → negado.

**V-011 — Reset de fábrica e sync destroem/sobrescrevem dados de todas as empresas via anon key.**
`limparTodasTabelas()` (`supabaseService.ts:862-884`) faz `delete().neq('id','__none__')` em TODAS as tabelas com a anon key; `syncAllDataToSupabase` (`391-527`) faz upsert do estado local inteiro (todas as empresas). Com V-001, qualquer pessoa que tenha a anon key apaga o banco ou sobrescreve dados de outras empresas (IDs conhecidos).
**Correção:** mover reset/restore para RPC/edge com `is_super_admin()` autenticado + validação; sync escopado por empresa autenticada; nunca expor operações destrutivas à anon key.
**Teste:** sem JWT super_admin, `limparTodasTabelas` → rejeitado; sync de A não altera dados de B.

**V-012 — `fetchSalaQuizGuiadoByPin` no Supabase entrega gabarito ao participante.**
`supabaseService.ts:746-752`: fallback consulta `salas_quiz_guiado` com `select('*')` (inclui `resposta_correta`) sem sanitizar. A rota Express sanitiza; o caminho Supabase não. A view `vw_salas_quiz_guiado_publica` existe (`006:620-648`, SECURITY_INVOKER, remove gabarito/`correta`) mas **não é usada** nesse fluxo.
**Correção:** usar `vw_salas_quiz_guiado_publica` nos fluxos do participante (PIN, polling, realtime).
**Teste:** consulta por PIN via Supabase → payload sem `resposta_correta`.

**V-013 — Realtime entrega payload completo das salas (com gabarito) aos participantes.**
Listener do canal `public:realtime_sst_channel` grava o row completo (`SSTContext.tsx` 974–1304). Mesmo com RLS correta, o participante que lê a sala recebe `perguntas` com `resposta_correta`.
**Correção:** restringir a publicação (Postgres changes com filtro/colunas) ou aplicar a sanitização na ingestão; participantes devem consumir a view pública.
**Teste:** UPDATE na sala → participante recebe evento sem gabarito.

**V-014 — Express sem autenticação em salas/resultados; backups dependem de token opcional.**
`server.ts:238-301`: POST/DELETE salas e GET/POST resultados **sem auth** (só rate limit). `isAuthorized` (`122-135`) retorna `true` quando `API_TOKEN` não está definido → `/api/backups` (CRUD com snapshot multi-tenant) e `/api/enviar_email_prova` abertos na LAN.
**Correção:** exigir token/autenticação (e escopo por empresa) nas rotas sensíveis em produção; documentar `API_TOKEN` como obrigatório.
**Teste:** sem token, `POST /api/salas_quiz_guiado` e `GET /api/backups` → 401.

**V-015 — Backups com snapshot de todas as empresas e leitura liberada.**
`backups_historico` "Legado Anonimo" `FOR ALL` (001:303) + `/api/backups/:id` sem auth (com V-014) → vazamento massivo do snapshot JSON de todas as empresas (senhas em texto puro incluídas — ver V-017).
**Correção:** revogar anon; exigir `is_super_admin()` (autenticado) para ler/excluir; criptografar/sanitizar o snapshot.
**Teste:** sem JWT `GET backups_historico` → 0 linhas; com JWT de empresa A → negado.

### MÉDIO

**V-016 — Dados de todas as empresas permanecem no storage após logout.**
`logout` (`SSTContext.tsx` ~812) só remove `sst_is_logged_in`/`sst_current_user_id`; `sst_empresas`, `sst_usuarios`, etc. e IndexedDB `sst_offline` continuam populados com o estado multi-tenant → navegador compartilhado vaza dados entre usuários/empresas.
**Correção:** limpar dados sensíveis no logout (e re-hidratar só com a empresa da sessão).
**Teste:** logout → `localStorage` sem `sst_empresas`/`sst_usuarios`; IndexedDB limpo.

**V-017 — Senha em texto puro na tabela `usuarios`.**
Coluna `senha TEXT` (schema.sql:66). `syncAllDataToSupabase`/`seedInitialDataIfEmpty`/`upsertUsuario` enviam a senha pura ao Supabase (`supabaseService.ts:190, 439, 352`); a view `v_usuarios_sem_senha` esconde a leitura, mas a coluna existe e backups a contêm. Login legado compara texto puro.
**Correção:** hash server-side; nunca persistir/transmitir senha (o App deve exigir Supabase Auth); remover a coluna após migração.
**Teste:** SELECT em `usuarios`/`v_usuarios_sem_senha` → coluna `senha` ausente/vazia; backup não contém senha.

**V-018 — Colaborador altera `estatisticas` de si mesmo e de colegas (pontos/troféus).**
Policy "Usuarios Escrita Escopo" (`001:158-165`) permite UPDATE de `empresa_id = user_empresa_id()`; o gatilho anti-autopromoção (`006:524-567`) protege `perfil/is_instrutor/auth_uid/empresa/setor/ativo` mas **não** `estatisticas`. Colaborador forja `pontos`, `pontos_resgataveis`, `trofeus_conquistados`, contadores de níveis de qualquer usuário da empresa.
**Correção:** incluir `estatisticas` nos campos bloqueados do gatilho para autoupdate; permitir escrita de `estatisticas` somente via RPC/edge autoritativas.
**Teste:** colaborador tenta `UPDATE usuarios SET estatisticas=...` (próprio ou de colega) → negado.

**V-019 — Sem rate limit no caminho Supabase de busca por PIN.**
Rate limit do PIN só existe no Express (`server.ts:247`); `fetchSalaQuizGuiadoByPin` fallback consulta o Supabase direto → brute-force de PIN de 6 dígitos sem throttle.
**Correção:** mover validação de PIN para edge/RPC com rate limit ou janela curta de validade; manter bloqueio no Express.
**Teste:** sequência rápida de consultas de PIN via Supabase → throttling/erro.

**V-020 — Edge functions usam service_role com `Authorization` do usuário repassada.**
`createClient` com service_role (bypassa RLS) nas 3 edges; qualquer bug de validação vira bypass total de RLS no servidor. (As checks atuais estão corretas, exceto V-007.)
**Correção:** validar strict e retornar 403 em qualquer divergência; não reutilizar claims do payload para autorização; adicionar testes de payload malformado.
**Teste:** payloads malformados/incompletos → erro de validação, nunca resposta com dados de outra empresa.

---

## 5. Níveis, Troféus e Regras (documentação)

- **Regras**: JSONB `empresas.configuracoes.regrasTrofeus` — campos `vitoriasTotais`, `winStreak`, `acertosTotais`, `defesasImbativel` (`migracao_regras_trofeus.sql`). Valores **valem para sempre** (carreira); troféus já conquistados não retrocedem.
- **Estado por usuário**: `usuarios.estatisticas` contém `pontos`, `pontos_resgataveis`, `trofeus_conquistados`, contadores (`vitorias`, `derrotas`, `sequencia_vitorias`, `melhor_sequencia`, `acertos`, etc.).
- **Histórico de temporadas**: `usuarios.estatisticas.historico_temporadas` (tipo `HistoricoTemporada` em `src/types.ts`).
- **Migração v2**: `migracao_trofeus_v2.sql` converte `medalhas` → `trofeus_conquistados`; `rollback_trofeus_v2.sql` faz o inverso.
- **Risco**: o cálculo e a gravação são locais/client-side; com V-018 qualquer usuário da empresa pode forjar pontos/troféus. A correção passa por RPC/edge autoritativas (como já feito para resgate e marcos).

---

## 6. Recomendação (ordem de implementação)

1. **Fase A (crítico)** — fechar o bypass total:
   - Desativar modo legado (`modo_legado_anonimo()` → false; `REVOKE ... FROM anon`).
   - Migrar login para Supabase Auth (vincular `auth_uid`; hash de senha; remover coluna `senha`).
   - Só hidratar com sessão; limpar storage no logout.
2. **Fase B** — apertar RLS:
   - `FOR ALL` → políticas por papel (V-008), remover UPDATE genérico de salas (V-009), `WITH CHECK (true)` → escopo real (V-010), proteger `estatisticas` no gatilho (V-018).
3. **Fase C** — autoridade de pontuação:
   - `pontuar_quiz` e `registrar_desafio_no_ledger` calculando pontos no servidor (V-004/V-005); janela de tempo + participação no RPC de respostas (V-006); `participante_id == auth_uid` na edge (V-007).
4. **Fase D** — quiz guiado e infra:
   - Usar `vw_salas_quiz_guiado_publica` no fluxo do participante (V-012/V-013); autenticação obrigatória no Express + `API_TOKEN` (V-014); backups escopados e criptografados (V-015); rate limit de PIN no Supabase (V-019); revisão das edges (V-020).

---

## 7. Verificação

- **Testes existentes** (rodam com `node --import tsx --test tests/**/*.test.ts`): `salaSanitize.test.ts` (sanitização por revelação), `desafioWinner.test.ts` (`calcularResultadoDesafio`), `supabaseConfig.test.ts` (`isSecretKey` bloqueia service_role/secret, aceita anon), `trofeusHelpers`, `server`, `resultadoAvaliacao`, `quizGuiadoScore`, `csvHelpers`.
- **Novos testes propostos**: um por vulnerabilidade (seção 4) — em especial cenários "Empresa A ataca Empresa B" e "colaborador tenta operação de admin" contra RLS/RPC/edge, além de um teste que garanta `modo_legado_anonimo() = false` antes da Fase A.
- **Dev/build**: `npm run dev` (`tsx server.ts`) · `npm run build` (`vite build && esbuild server.ts ...`).
- **Ambiente**: projeto Supabase linkado `ref: vsnilfdvmfhotvrwtiln` ("werbsontrabalho-hue's Project"); sem `supabase/config.toml` (pode ser necessária criação); sem `.env` (criar a partir de `.env.example`).

---

## 8. Conclusão

O sistema já tem boa base de defesa em profundidade (RPCs transacionais para resgate/desafio/marcos, gatilho anti-autopromoção, views sanitizadas, rate limit e sanitização no Express, edges que recalculam pontos). **Porém, enquanto o modo legado anônimo permanecer ativo e o app hidratar sem sessão, o isolamento multi-tenant é nulo na prática.** As correções devem seguir as fases A–D, priorizando fechar o bypass total antes de aperfeiçoar a hierarquia de papéis.

---

## 9. Fase A — Implementada (16/08/2026)

Status: ✅ concluída e verificada (testes 64/64, `tsc --noEmit` sem erros, build OK).

### Arquivos alterados

- **`supabase/migrations/007_desativar_modo_legado.sql`** (novo):
  - `modo_legado_anonimo()` → `SELECT false` — as policies "Legado Anonimo" deixam de abrir nada (V-001).
  - `REVOKE ALL ON ALL TABLES/SEQUENCES ... FROM anon`; `REVOKE ALL ON ALL FUNCTIONS ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated/service_role`; `ALTER DEFAULT PRIVILEGES ... FROM anon` (objetos futuros).
  - Novo RPC `vincular_auth_uid(p_usuario_id)` (SECURITY DEFINER): exige sessão, valida o e-mail no servidor (anti-ligação cruzada), não sobrescreve vínculo existente; EXECUTE revogado de PUBLIC/anon, concedido só a `authenticated`.
- **`src/services/supabaseAuth.ts`**: `vincularAuthUidAoUsuario` passa a usar o RPC `vincular_auth_uid` (o UPDATE direto do próprio `auth_uid` é bloqueado pelo gatilho anti-autopromoção).
- **`src/services/supabaseService.ts`**: `upsertUsuario`, `seedInitialDataIfEmpty` e `syncAllDataToSupabase` removem `senha` do payload; `upsertBackupHistorico` aplica `removerSenha()` recursivo no snapshot (V-015/V-017).
- **`src/context/SSTContext.tsx`**:
  - `loginWithCredentials`: com Supabase configurado, **exige** Supabase Auth (sem fallback de senha em texto puro — V-003); perfil legado com o mesmo e-mail é vinculado via RPC. Offline/LAN mantém o login local (sem nuvem, sem risco multi-tenant).
  - `registerAccount`: cria a conta no Supabase Auth primeiro, depois grava o perfil com `auth_uid` e sem senha.
  - `logout`: limpa os dados multi-tenant do storage quando a nuvem está configurada (V-016).
- **`src/lib/supabase.ts`**: `testSupabaseConnection` trata `42501`/"permission denied" como conexão OK (banco alcançável com RLS ativa).
- **`tests/desativacaoModoLegado.test.ts`** (novo): regressão garantindo que a 007 não reabre acesso à anon e que o RPC valida sessão/e-mail.

### Verificação

- `npm test` → 64/64 (inclui 5 novos de regressão da 007).
- `npm run lint` (`tsc --noEmit`) → sem erros.
- `npm run build` → OK (Vite + esbuild).

### Observações / pendências

- Aplicar a migração 007 no projeto linkado (`ref: vsnilfdvmfhotvrwtiln`) quando autorizado (ex.: `supabase db push`).
- Usuários legados (sem `auth_uid`) passam a entrar via Supabase Auth; o primeiro login com o mesmo e-mail vincula o perfil automaticamente. Contas sem e-mail correspondente precisam de cadastro/redefinição de senha.
- A coluna `usuarios.senha` e o login local offline permanecem (uso LAN/sem nuvem não afeta o isolamento). Remoção completa da coluna fica para fase posterior.
- Fora da Fase A (próximas fases B–D): políticas `FOR ALL` por papel (V-008), `WITH CHECK (true)` → escopo real (V-010), UPDATE genérico de salas (V-009), proteção de `estatisticas` no gatilho (V-018), autoridade de pontos nos RPCs (V-004/005/006) e edge quiz-guiado (V-007), auth obrigatória no Express + `API_TOKEN` (V-014), view pública no fluxo do participante (V-012/013), rate limit de PIN no Supabase (V-019).

---

## 9.1 Correções Pós-Fase A — Problemas reportados (16/08/2026)

Status: ✅ implementadas e verificadas (testes 70/70, `tsc --noEmit` sem erros, build OK).

### Problema 1 — Login rejeita credencial que existe em `public.usuarios`

**Sintoma:** `admin@alfa.com` / `123456` existe no banco (coluna `senha` em texto puro), mas o login responde `"Invalid login credentials"` (mensagem em inglês).

**Causa raiz:** duas fontes de credencial diferentes. Com o Supabase configurado, `loginWithCredentials` (`SSTContext.tsx:516`) passa a **exigir** o Supabase Auth (`signInWithPassword`, `supabaseAuth.ts:72`), que valida **somente** contra `auth.users` (hash Bcrypt). A coluna `senha` (texto puro) de `public.usuarios` **não é consultada** — e o fallback legado foi removido de propósito na Fase A (V-001/V-003). Ou a conta não existe em `auth.users`, ou existe com senha diferente → `error.message` do SDK em inglês.

**Correções entregues (aplicar só com autorização):**
- **`supabase/migrations/008_corrigir_vincular_auth_uid.sql`** (novo): corrige bug latente da Fase A. O RPC `vincular_auth_uid` (007) fazia `UPDATE usuarios SET auth_uid` em SECURITY DEFINER — mas SECURITY DEFINER **não** contorna gatilhos; o gatilho `bloquear_autopromocao` (006:552-558) bloqueava o UPDATE porque, no momento do vínculo, `auth_uid` ainda é NULL → `usuario_id_atual()` = NULL → `OLD.id <> NULL` → `RAISE "Sem permissão"`. A 008 cria um bypass controlado por GUC (`app.bypass_auth_uid_link`) ligado **somente** dentro do RPC oficial, com o gatilho aceitando exclusivamente a gravação do `auth_uid` (demais campos sensíveis continuam travados).
- **`supabase/functions/migrar-legados/index.ts`** (novo, edge function): migração em massa legado→Auth usando `auth.admin.createUser` com a senha texto puro (hash Bcrypt) + vínculo de `auth_uid`; exige usuário autenticado `super_admin`; `email_confirm = true`; limpeza da coluna `senha` opcional (`removerSenha`).

**Fluxo pós-correção:** rodar a edge `migrar-legados` (super_admin) → contas legadas ganham entrada em `auth.users` e `auth_uid` → login passa pelo Auth normalmente. Alternativamente, o primeiro login via Auth com o mesmo e-mail vincula o perfil (RPC corrigido pela 008).

**APLICADO EM PRODUÇÃO (16/08/2026, autorizado pelo usuário):**
- Migrações `007` e `008` aplicadas no projeto `vsnilfdvmfhotvrwtiln` (confirmado via `supabase migration list`).
- Edge function `migrar-legados` deployada (ACTIVE, v3).
- Como `auth.users` estava vazio e nenhum perfil tinha `auth_uid` (nenhum `super_admin` autenticável para o bootstrap da edge function), a migração foi executada via `service_role`: **14/14 usuários** criados em `auth.users` (`email_confirm=true`, senhas texto puro atuais) e `auth_uid` vinculado em `public.usuarios`.
- Login de teste validado: `admin@alfa.com`/`123456` → `LOGIN OK` via `POST /auth/v1/token?grant_type=password` (token JWT emitido, `auth_uid` correto).
- A coluna `senha` (texto puro) foi **mantida** (opcional; limpeza fica para validação posterior).
- **LIMPEZA DA COLUNA `senha` EXECUTADA (16/08/2026, autorizado):** `UPDATE usuarios SET senha = ''` via `service_role` em todos os registros; conferido que nenhuma senha em texto puro restou no banco. O Supabase Auth (hash Bcrypt) é agora a única fonte de verdade para credenciais. O modo offline/LAN trata `senha` vazia como "conta sem senha definida" (pede recuperação).

### Problema 2 — Código de recuperação de senha exposto na tela

**Sintoma:** o formulário exibia `Código de teste/demo gerado: <XXXXXX>` com botão "Preencher" e pré-preenchia o campo de verificação.

**Causa raiz:** `requestPasswordResetCode` (`SSTContext.tsx:735`) retornava `codeForDemo` ao frontend e guardava o código **em memória do navegador** (`resetCodesMap`) — a validação era 100% client-side. Qualquer pessoa que soubesse o e-mail da vítima redefinia a senha dela sem acesso ao e-mail real (falha grave). Bônus: a redefinição não atualizava a senha do Supabase Auth (o `upsertUsuario` remove `senha` do payload).

**Correções entregues:**
- `LoginView.tsx`: removidos o estado `demoCodeHint`, o auto-preenchimento e o bloco UI de demonstração; o código agora é entregue **apenas** pelo e-mail oficial.
- `SSTContext.tsx`: `requestPasswordResetCode` deixou de retornar `codeForDemo` (tipo, retorno e comentários ajustados) e a notificação não menciona mais "código na tela".

**Pendência (recomendada):** mover a validação do código para server-side (RPC/edge com hash + expiração + limite de tentativas) ou adotar integralmente o link do Supabase Auth, e fazer a redefinição via `auth.updateUser`. Isso fica alinhado às fases B–C.