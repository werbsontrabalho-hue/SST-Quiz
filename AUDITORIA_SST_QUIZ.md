# AUDITORIA COMPLETA — SST QUIZ SAAS

> Data: 14/08/2026 · Branch: `main` (commit `c65872f`) · App: React 19 + Vite + TypeScript + Express + Supabase/PostgreSQL
> Escopo: código, banco de dados, autenticação, segurança, performance, UX, quiz em tempo real (estilo Kahoot).
> **Status: relatório aprovado — Fases 1 e 2 implementadas (correções seguras + Supabase Auth + RLS + pontuação server-side).**

---

## 1. RESUMO EXECUTIVO

O SST Quiz é um aplicativo SaaS de treinamento e gamificação de Segurança do Trabalho (SST). A aplicação tem **duas camadas de dados coexistindo**:

1. **Local (localStorage / IndexedDB)** — funciona offline e sem configuração, com seed de demonstração (`mockData`).
2. **Supabase (PostgreSQL)** — sincronização opcional, configurada na tela de Super Admin (URL + anon key). O app faz CRUD direto via REST.

O estado global fica em um único arquivo gigante (`SSTContext.tsx`, **4.574 linhas**), que também implementa a lógica de negócio, pontuação, autenticação e backup/restore.

**Veredito geral:** o app é **funcional e rico em features** (ranking, desafios 1v1, quiz guiado com QR Code, PDF/laudo, e-mail, troféus, prêmios), mas há **problemas críticos de segurança e integridade de dados** que precisam ser resolvidos antes de qualquer expansão: a autenticação e a pontuação são **100% controladas pelo cliente**, o que permite **forjar pontos, vitórias e acesso a dados de outras empresas**. A arquitetura de "tempo real" é baseada em **polling + armazenamento em memória do Express**, sem autoridade central confiável.

---

## 2. PONTOS POSITIVOS

- **Feature set completo e diferenciado**: quiz diário com bônus de velocidade/streak, desafios 1v1 competitivos e amistosos, quiz guiado ao vivo com PIN + QR Code, modo TV/apresentação, provas com laudo PDF e envio por e-mail (nodemailer), troféus, catálogo de prêmios com resgate.
- **Modo offline robusto**: o app funciona integralmente com dados locais, com fila de sincronização e backup/restore via JSON — bom para ambientes sem internet.
- **Código legível e bem documentado**: comentários em português explicando intenção, proteções contra dupla pontuação (guards `status === 'concluido'`, `quizFinalizadoRef`, anti-duplicidade em respostas de quiz guiado).
- **SQL de migração já existe em boas práticas**: `supabase/migration_atualizacao.sql` usa `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` — mesmo padrão não-destrutivo que o usuário exige.
- **UI rica e profissional** (Tailwind, modais, confetes, ranking em tempo de digitação), boa organização por views (quiz guiado separado em `src/components/views/quizGuiado/`).
- **Detecção e bloqueio de chave `service_role`** no navegador (`supabase.ts`) — boa prática de segurança.

---

## 3. PROBLEMAS CRÍTICOS

### 3.1. Autenticação 100% client-side (sem servidor de autoridade)
O "login" é apenas uma flag local sem token/JWT:
- `src/context/SSTContext.tsx:297-310` — sessão reconstruída de `sst_is_logged_in` + `sst_current_user_id`.
- `:464-465` — login grava apenas no `localStorage`.
- Qualquer usuário pode abrir o DevTools e trocar `sst_current_user_id` (ou editar `sst_usuarios`) para **entrar como Super Admin** (`SuperAdminView` é controlada apenas por `perfil === 'super_admin'` no objeto em memória).

### 3.2. Senhas em texto puro
- `src/context/SSTContext.tsx:259` — `const DEFAULT_SENHA = '123456'`; comparações em `:504, :536` (string direta).
- Coluna `senha TEXT` sem hash em `supabase/schema.sql:66` e no script embutido `SupabaseModal.tsx:187`.
- `fetchAllData` usa `select('*')` em `usuarios` (`src/services/supabaseService.ts:77`), **trazendo `senha` de todos os usuários para o navegador**.
- Seed cria usuários com `senha '123456'` (`SupabaseModal.tsx:453-454`, `SuperAdminView.tsx:343`).

### 3.3. RLS (Row Level Security) aberta
- `supabase/schema.sql:229-238` e `SupabaseModal.tsx:393-405` — políticas `FOR ALL USING (true)` (em alguns casos `WITH CHECK (true)`) para **todas as tabelas**, inclusive `usuarios` e `salas_quiz_guiado`.
- Resultado: qualquer um com a anon key lê/grava tudo (dados de todas as empresas, gabaritos, respostas de participantes).

### 3.4. Pontuação forjável (integridade do jogo)
- `submeterQuizConcluido(quizId, respostas, pontosGanhos)` recebe **`pontosGanhos` calculado no cliente** e credita em `pontos_totais` e `pontos_resgataveis` sem validar (`SSTContext.tsx:2286-2351`; chamado em `QuizPlayerView.tsx:304`).
- `QuizPlayerView.tsx:235-275` — o gabarito (`perguntaAtual.resposta_correta`), o tempo e o cálculo de pontos ficam **todos no navegador**.
- `submeterRespostaDesafio` recebe `correta: boolean` enviada pelo cliente (`SSTContext.tsx:1759-1762`) — dá para "forjar vitória" enviando todas as respostas corretas.
- `submeterRespostaQuizGuiado` credita 100–1500 pontos por resposta com base em `resposta_correta` que vive na sala enviada ao cliente (`SSTContext.tsx:4123-4185`); sem validar janela de tempo nem estado da pergunta.

### 3.5. Quiz guiado sem autoridade central
- `server.ts:37` — `salasQuizMap` é um `Map` **em memória**: restart do servidor apaga todas as salas.
- Cliente sincroniza via polling (Express a cada 1,5s — `SSTContext.tsx:1013-1074`; Supabase a cada 3s — `:935-998`). Não há WebSocket.
- O Express é "armazenamento cego": aceita o objeto inteiro da sala via `PUT`/`POST` sem validar tempo, estado ou respostas (`server.ts:67-85`).
- Canal `postgres_changes` (Supabase Realtime) é opcional e depende de publicação (`schema.sql:251-261`).

### 3.6. Script de setup com `DROP TABLE ... CASCADE`
- `SupabaseModal.tsx:142-160` — o script "copiável" apaga **todas as 13 tabelas do schema + 5 tabelas antigas de outro projeto (`answers`, `questions`, `scores`, `profiles`, `users`)** com `DROP TABLE IF EXISTS ... CASCADE`. Rodar por engano = **perda total de dados**. O `schema.sql` (que não apaga) e o script do modal (que apaga) **divergem**: o modal inclui `backups_historico`, `notificacoes` e `resgates_premios`, que **não existem no `schema.sql`**.

---

## 4. PROBLEMAS IMPORTANTES

- **CSV com injeção de fórmula (CSV injection)**: exportadores montam células sem escapar prefixos `= + - @` (`csvHelpers.ts` linhas 97, 289, 480, 530). Abrir no Excel pode executar fórmulas.
- **Round-trip de usuários quebrado**: o header de exportação (`csvHelpers.ts:275-292`) não bate com o parse posicional (`:365-394`) — importar o próprio export corrompe usuários.
- **Detecção de delimitador por linha** (`csvHelpers.ts:148, 365`) — arquivos mistos `;`/`,` ou linhas com ponto-e-vírgula dentro de campo quebram.
- **Schema dessincronizado**: `salas_quiz_guiado` no `schema.sql` não tem as colunas `estado_apresentacao`, `sessao_id`, `question_started_at`, `question_ends_at`, `historico_sessoes`, `posicoes_anteriores` (só existem no `migration_atualizacao.sql`). Tabelas `backups_historico`, `notificacoes`, `resgates_premios` só existem no script embutido do modal.
- **`isSecretKey` com falso-positivo**: `key.includes('secret')` em `src/lib/supabase.ts:108` — chaves anon JWT legítimas que contenham "secret" no payload são bloqueadas.
- **Chave anon e URL expostas** no `localStorage` (necessário para o modelo atual, mas agravado pela RLS aberta).
- **Seed/upsert frágil**: `seedInitialDataIfEmpty` e `syncAllDataToSupabase` podem duplicar/sobrescrever dados se IDs colidirem entre o seed local e o banco.
- **Express sem persistência e sem autenticação** nas rotas `/api/salas_quiz_guiado`, `/api/resultados_avaliacao_sst` e `/api/enviar_email_prova` — qualquer pessoa pode listar/criar salas e disparar e-mails.

---

## 5. MELHORIAS RECOMENDADAS (resumo; detalhes nas seções 10–13)

1. **Mover autenticação para o Supabase Auth** (e-mail/senha) e substituir a sessão em `localStorage` por token JWT; senhas com hash (bcrypt via edge function ou coluna `senha_hash`). 2. **Restringir o que o cliente pode gravar**: pontuação calculada no servidor (edge function ou `salas_quiz_guiado`/`resultados` validados), nunca aceitar `pontosGanhos`/`correta` vindos do navegador. 3. **Fechar RLS** com políticas por empresa (`auth.uid()` → `empresa_id`) mantendo o acesso do anon ao mínimo necessário para o login. 4. **Remover `select('*')` de `usuarios`** (usar view pública sem `senha`). 5. **Padronizar um único SQL** não-destrutivo (`migration_seguranca.sql`) e **remover o script com `DROP`** do modal (ou mover para área protegida com confirmação dupla). 6. **Quiz guiado**: opção de modo com autoridade no servidor (validação de janela de tempo, respostas, gabarito) ou, no mínimo, persistência em Supabase + validação de estado. 7. **Sanitizar CSV** na exportação (prefixar com `'`) e **corrigir round-trip de usuários**. 8. **Adicionar `updated_at` e triggers**, índices e checagem de unicidade do PIN nas salas ativas. 9. **Dividir `SSTContext.tsx`** em módulos (auth, pontos, salas, sync) para testabilidade. 10. **Testes automatizados** para regras de pontuação, CSV e RLS.

---

## 6. BANCO DE DADOS ATUAL

Base real: **10 tabelas no `supabase/schema.sql`** + 3 tabelas extras no script embutido do `SupabaseModal.tsx` (total 13). Colunas não listadas = padrão definido no script.

| Tabela | Colunas principais | FK | Observações |
|---|---|---|---|
| `empresas` | id, nome, cnpj, plano, ativa, limite_colaboradores, configuracoes(JSONB), data_contratacao | — | `configuracoes` guarda pontos/regras/troféus |
| `setores` | id, empresa_id, nome, colaboradores_ativos | empresa_id | |
| `usuarios` | id, empresa_id, setor_id, nome, email(UNIQUE), **senha**, avatar, perfil, cargo, ativo, is_instrutor, estatisticas(JSONB), created_at | empresa_id, setor_id | `senha` em texto puro |
| `perguntas` | id, empresa_id, categoria, tipo, dificuldade, enunciado, alternativas(JSONB), **resposta_correta**, explicacao, tempo_limite_segundos, norma_relacionada, disponivel_desafios, ativa | empresa_id | gabarito no banco |
| `campanhas` | id, empresa_id, nome, descricao, frequencia, setores_alvo(JSONB), quantidade_perguntas, pergunta_ids(JSONB), data_inicio, data_fim, horario_disparo, ativa | empresa_id | |
| `quizzes` | id, empresa_id, colaborador_id, campanha_id, titulo, categoria, perguntas(JSONB), status, pontuacao_total, respostas(JSONB), criado_em, respondido_em | empresa_id, colaborador_id, campanha_id | |
| `desafios_1v1` | id, empresa_id, desafiante_id, desafiante_setor_id, desafiado_id, desafiado_setor_id, tema_sorteado, status, vale_ponto, tipo, pontuacao_setor, vencedor_id, vencedor_setor_id, data_criacao, perguntas(JSONB), respostas_*(JSONB), revanche_id | empresa_id, desafiante_id, desafiado_id, vencedor_id | |
| `premiacoes` | id, empresa_id, titulo, descricao, tipo, mes_referencia, requisito, imagem | empresa_id | |
| `salas_quiz_guiado` | id, pin, nome, treinamento_titulo, instrutor_id, instrutor_nome, empresa_id, data_criacao, status, modalidade, estilo, nota_minima, tempo_por_pergunta_seg, perguntas(JSONB), pergunta_atual_index, mostrar_ranking, permitir_visitantes, participantes(JSONB), revelar_resposta_atual, mostrar_modo_tv + (via migration) estado_apresentacao, sessao_id, question_started_at, question_ends_at, historico_sessoes, posicoes_anteriores | instrutor_id, empresa_id | gabarito dentro de `perguntas` (JSONB) vai ao cliente |
| `resultados_avaliacao_sst` | id, sala_id, participante_nome, participante_id, cpf_ou_empresa, is_visitante, treinamento_titulo, instrutor_nome, data, total_perguntas, acertos, erros, nota_final, nota_minima, situacao, desempenho_por_tema(JSONB), respostas_detalhadas(JSONB) | sala_id | |
| `resgates_premios` *(só no modal)* | id, premio_id, usuario_id, pontos_usados, status, solicitado_em | | falta no schema.sql |
| `notificacoes` *(só no modal)* | id, usuario_id, texto, tipo, lida, criado_em | | falta no schema.sql |
| `backups_historico` *(só no modal)* | id, data, dados(JSONB), tipo | | falta no schema.sql |

- **RLS**: habilitada, porém com políticas `USING (true)` em todas as tabelas.
- **Índices**: existem para FKs e `pin` de salas.
- **Realtime**: `salas_quiz_guiado`, `resultados_avaliacao_sst`, `desafios_1v1` publicados na `supabase_realtime` (guardado por `DO`).

---

## 7. BANCO DE DADOS PROPOSTO

Preserva o modelo atual (sincronização simples com o app), **adicionando segurança sem perder dados**:

1. **Unificar o schema em um único SQL canônico não-destrutivo** (`supabase/schema.sql` + `migration_seguranca.sql`), incluindo as 13 tabelas (com `backups_historico`, `notificacoes`, `resgates_premios` e as 6 colunas extras de `salas_quiz_guiado`).
2. **`senha_hash` TEXT** nova coluna (hash bcrypt) mantendo `senha` para compatibilidade de transição; a partir da Fase 2 só `senha_hash` é usada.
3. **RLS fechada por empresa** (Fase 2, após Supabase Auth): políticas `USING (empresa_id = auth_empresa_id())` para tabelas por empresa; leitura pública restrita (ex.: `perguntas` só para logados da empresa). Tabelas de participação de visitantes (`salas_quiz_guiado`, `resultados_avaliacao_sst`) com regras próprias.
4. **View `v_usuarios_sem_senha`** para substituir `select('*')` de `usuarios`.
5. **Colunas novas**: `usuarios.senha_hash`; `empresas`/`setores`/`perguntas`/`campanhas`/`quizzes`/`desafios_1v1`/`premiacoes` ganham `updated_at` (com trigger). `salas_quiz_guiado` ganha `configs_validacao JSONB` (janela de resposta, ofuscamento de gabarito) para o modo seguro.
6. **Índices adicionais**: `quizzes(colaborador_id, status)`, `usuarios(email)` (para auth), índice único parcial `salas_quiz_guiado(pin) WHERE status IN ('aguardando','em_andamento')`.
7. **Realtime** mantido e idempotente.

> Tabela de relacionamentos completa, diagrama e SQL de migração nas seções 8 e 9.

---

## 8. DIAGRAMA DOS RELACIONAMENTOS

```
empresas 1───* setores
empresas 1───* usuarios (usuarios.setor_id ───► setores)
empresas 1───* perguntas
empresas 1───* campanhas
empresas 1───* quizzes
empresas 1───* desafios_1v1
empresas 1───* premiacoes
empresas 1───* salas_quiz_guiado

usuarios 1───* quizzes        (quizzes.colaborador_id)
campanhas 1───* quizzes       (quizzes.campanha_id, opcional)
usuarios 1───* desafios_1v1   (desafiante_id / desafiado_id / vencedor_id)
salas_quiz_guiado 1───* resultados_avaliacao_sst (resultados.sala_id, ON DELETE SET NULL)
premiacoes 1───* resgates_premios
usuarios 1───* resgates_premios
usuarios 1───* notificacoes
backups_historico: independente (snapshot JSON do app)
```

Relacionamentos por Empresa (isolamento RLS): `setores.empresa_id`, `usuarios.empresa_id`, `perguntas.empresa_id`, `campanhas.empresa_id`, `quizzes.empresa_id`, `desafios_1v1.empresa_id`, `premiacoes.empresa_id`, `salas_quiz_guiado.empresa_id`.

---

## 9. SQL DE MIGRAÇÃO

Arquivo a ser criado na Fase 1: **`supabase/migration_seguranca.sql`** — 100% não-destrutivo (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`, `DO`-blocks). Nenhum `DROP TABLE`/`TRUNCATE`. Script completo abaixo:

```sql
-- ============================================================
-- MIGRATION SEGURANÇA — SST QUIZ SAAS (NÃO-DESTRUTIVO)
-- Seguro rodar repetidas vezes. Nenhum DROP TABLE / TRUNCATE.
-- ============================================================

-- ------------------------------------------------------------
-- ETAPA 1 — EXTENSÕES
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- ETAPA 2 — NOVAS TABELAS (faltam no schema.sql)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backups_historico (
    id TEXT PRIMARY KEY,
    data TEXT,
    tipo TEXT,
    dados JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.notificacoes (
    id TEXT PRIMARY KEY,
    usuario_id TEXT REFERENCES public.usuarios(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    tipo TEXT DEFAULT 'info',
    lida BOOLEAN DEFAULT false,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.resgates_premios (
    id TEXT PRIMARY KEY,
    premio_id TEXT REFERENCES public.premiacoes(id) ON DELETE CASCADE,
    usuario_id TEXT REFERENCES public.usuarios(id) ON DELETE CASCADE,
    pontos_usados INT DEFAULT 0,
    status TEXT DEFAULT 'pendente',
    solicitado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ------------------------------------------------------------
-- ETAPA 3 — ALTERS (colunas que faltam / novas, sem perda)
-- ------------------------------------------------------------
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS estado_apresentacao TEXT DEFAULT 'AGUARDANDO';
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS sessao_id TEXT;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS question_started_at BIGINT;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS question_ends_at BIGINT;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS historico_sessoes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS posicoes_anteriores JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS configs_validacao JSONB DEFAULT '{"validar_janela_tempo": false, "ofuscar_gabarito": false}'::jsonb;

-- Coluna para senha com hash (transição; app passa a usar a partir da Fase 2)
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS senha_hash TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.empresas     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.setores      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.perguntas    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.campanhas    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.quizzes      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.premiacoes   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ------------------------------------------------------------
-- ETAPA 4 — FOREIGN KEYS (garantia, sem quebrar existentes)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_usuarios_empresa') THEN
    ALTER TABLE public.usuarios ADD CONSTRAINT fk_usuarios_empresa FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_usuarios_setor') THEN
    ALTER TABLE public.usuarios ADD CONSTRAINT fk_usuarios_setor FOREIGN KEY (setor_id) REFERENCES public.setores(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_salas_instrutor') THEN
    ALTER TABLE public.salas_quiz_guiado ADD CONSTRAINT fk_salas_instrutor FOREIGN KEY (instrutor_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_resultados_sala') THEN
    ALTER TABLE public.resultados_avaliacao_sst ADD CONSTRAINT fk_resultados_sala FOREIGN KEY (sala_id) REFERENCES public.salas_quiz_guiado(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- ETAPA 5 — CONSTRAINTS
-- ------------------------------------------------------------
ALTER TABLE public.empresas ADD CONSTRAINT IF NOT EXISTS chk_empresas_limite CHECK (limite_colaboradores >= 0);
ALTER TABLE public.salas_quiz_guiado ADD CONSTRAINT IF NOT EXISTS chk_salas_nota_minima CHECK (nota_minima >= 0 AND nota_minima <= 10);
ALTER TABLE public.salas_quiz_guiado ADD CONSTRAINT IF NOT EXISTS chk_salas_tempo CHECK (tempo_por_pergunta_seg > 0);

-- PIN único enquanto a sala estiver ativa
CREATE UNIQUE INDEX IF NOT EXISTS uq_salas_pin_ativa
  ON public.salas_quiz_guiado(pin)
  WHERE status IN ('aguardando', 'em_andamento');

-- ------------------------------------------------------------
-- ETAPA 6 — ÍNDICES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa  ON public.usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_setor    ON public.usuarios(setor_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email    ON public.usuarios(email);
CREATE INDEX IF NOT EXISTS idx_setores_empresa   ON public.setores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_perguntas_empresa ON public.perguntas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_colaborador ON public.quizzes(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_status    ON public.quizzes(colaborador_id, status);
CREATE INDEX IF NOT EXISTS idx_desafios_empresa  ON public.desafios_1v1(empresa_id);
CREATE INDEX IF NOT EXISTS idx_salas_empresa     ON public.salas_quiz_guiado(empresa_id);
CREATE INDEX IF NOT EXISTS idx_salas_pin         ON public.salas_quiz_guiado(pin);
CREATE INDEX IF NOT EXISTS idx_resultados_sala   ON public.resultados_avaliacao_sst(sala_id);
CREATE INDEX IF NOT EXISTS idx_resgates_usuario  ON public.resgates_premios(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notif_usuario     ON public.notificacoes(usuario_id);

-- ------------------------------------------------------------
-- ETAPA 7 — FUNÇÕES
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper para RLS por empresa (Fase 2; retorna null até o auth estar em uso)
CREATE OR REPLACE FUNCTION public.auth_empresa_id()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'empresa_id', '')
  UNION ALL
  SELECT NULL
  LIMIT 1;
$$;

-- ------------------------------------------------------------
-- ETAPA 8 — TRIGGERS
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['empresas','setores','usuarios','perguntas','campanhas','quizzes','desafios_1v1','premiacoes']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_' || t || '_updated_at') THEN
      EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- ETAPA 9 — RLS (habilitação idempotente para todas as tabelas)
-- ------------------------------------------------------------
ALTER TABLE public.empresas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setores                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perguntas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafios_1v1            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premiacoes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resgates_premios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups_historico       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salas_quiz_guiado       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultados_avaliacao_sst ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- ETAPA 10 — POLÍTICAS
-- Mantém o comportamento atual (permissivo) para não quebrar o app na
-- transição. As políticas FECHADAS por empresa devem ser aplicadas na
-- FASE 2 (após Supabase Auth) via arquivo separado, pois exigem login.
-- Abaixo: recriação idempotente das políticas atuais + leitura de visitantes.
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT; p TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['empresas','setores','usuarios','perguntas','campanhas','quizzes','desafios_1v1','premiacoes','resgates_premios','notificacoes','backups_historico','salas_quiz_guiado','resultados_avaliacao_sst']
  LOOP
    p := 'pol_anon_' || t;
    EXECUTE format('DROP POLICY IF EXISTS "Acesso total %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %L ON public.%I', p, t);
    EXECUTE format('CREATE POLICY %L ON public.%I FOR ALL USING (true) WITH CHECK (true)', p, t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- ETAPA 11 — SUPABASE REALTIME (idempotente)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salas_quiz_guiado;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.resultados_avaliacao_sst;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.desafios_1v1;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ------------------------------------------------------------
-- ETAPA 12 — DADOS INICIAIS
-- (Nenhum seed aqui para não duplicar com o app. O app faz
--  seedInitialDataIfEmpty quando a tabela empresas está vazia.)
-- ------------------------------------------------------------
```

> **AVISO**: a Etapa 10 substitui as políticas atuais por políticas **equivalentes** (mantendo o app funcional). **Não** há perda de dados. A abertura da RLS só será fechada na Fase 2, junto com a implementação do Supabase Auth.

---

## 10. ALTERAÇÕES NO CÓDIGO (ARQUIVO → ALTERAÇÃO → MOTIVO)

| # | Arquivo | Alteração necessária | Motivo |
|---|---------|----------------------|--------|
| 1 | `src/context/SSTContext.tsx` | **Fase 2:** substituir login por `supabase.auth.signInWithPassword` + sessão JWT; manter modo offline como fallback. | Auth client-side forjável (`:297-310`, `:464-465`) |
| 2 | `src/context/SSTContext.tsx` | `submeterQuizConcluido` (e `QuizPlayerView.tsx:304`) passar a **não aceitar** `pontosGanhos` do cliente; recalcular com base nas respostas (ou via função no Supabase). | Pontuação forjável (`:2286-2351`) |
| 3 | `src/context/SSTContext.tsx` | `submeterRespostaDesafio` recalcular `correta` no servidor/contexto em vez de confiar no parâmetro recebido. | Forjar vitória (`:1759-1762`) |
| 4 | `src/context/SSTContext.tsx` | `submeterRespostaQuizGuiado` validar janela de tempo (`question_started_at`/`question_ends_at`) e estado da pergunta antes de pontuar. | Resposta fora da janela pontuando (`:4123-4185`) |
| 5 | `src/services/supabaseService.ts` | Trocar `select('*')` de `usuarios` (`:77`) por view `v_usuarios_sem_senha`. | `senha` exposta ao cliente |
| 6 | `src/components/SupabaseModal.tsx` | Remover script com `DROP TABLE ... CASCADE` (`:142-160`); usar o SQL não-destrutivo. | Risco de perda total de dados |
| 7 | `src/components/SupabaseModal.tsx` | Alinhar o SQL do modal com o `schema.sql` unificado (13 tabelas + colunas). | Schema dessincronizado |
| 8 | `src/lib/supabase.ts` | Ajustar `isSecretKey` (`:108`) para não usar `includes('secret')` (validar via JWT payload apenas). | Falso-positivo bloqueando chave anon válida |
| 9 | `src/utils/csvHelpers.ts` | Sanitizar células na exportação (prefixo `'`) em perguntas/usuários/setores/relatório. | CSV injection |
| 10 | `src/utils/csvHelpers.ts` | Alinhar header de export de usuários (`:275-292`) com o parse (`:365-394`) e detectar delimitador de forma global. | Round-trip quebrado |
| 11 | `server.ts` | Fase 3 (opcional): persistir salas no Supabase; validar payload e janela de tempo nas rotas `/api/salas_quiz_guiado`. | Salas em memória + "storage cego" (`:37-85`) |
| 12 | `src/context/SSTContext.tsx` | Refatorar em módulos (auth, pontuação, salas, sync) — mantendo a API do contexto. | Manutenibilidade/testabilidade |
| 13 | `src/components/views/QuizPlayerView.tsx` | Exibir apenas "certo/errado" sem expor índice `resposta_correta` quando o quiz estiver em modo seguro (Fase 3). | Gabarito no navegador (`:235`) |

---

## 11. FLUXO DO QUIZ

### 11.1. Quiz diário (campanha)
1. Admin cria campanha → dispara `quizzes` por colaborador.
2. Colaborador abre `QuizPlayerView`; o cliente carrega `perguntas` (com `resposta_correta` e `explicacao`) e roda o timer.
3. Ao confirmar, **o navegador** calcula `correta` + pontos (base + bônus velocidade/streak) (`QuizPlayerView.tsx:235-275`).
4. Ao final, `submeterQuizConcluido(quizId, respostas, pontosGanhos)` grava `pontuacao_total`, atualiza estatísticas locais e sincroniza no Supabase.
- **Risco**: todo o cálculo é client-side; sem servidor, é trivial manipular o payload.

### 11.2. Desafio 1v1
1. `criarDesafio1v1` sorteia 5 perguntas; o desafiado aceita.
2. Cada jogador responde no cliente; `submeterRespostaDesafio` recebe respostas com `correta` preenchida pelo navegador (`:1759`).
3. Quando os dois completam 5, o contexto avalia (acertos → placar → desempate por tempo/pergunta nova) e credita pontos.
- **Risco**: `correta` e tempos vêm do cliente → forja possível.

### 11.3. Quiz guiado ao vivo (Kahoot)
1. Instrutor cria sala (`CriarSalaModal`) → cliente gera PIN e envia a sala ao Express (`POST /api/salas_quiz_guiado`, `server.ts:67`) e ao Supabase.
2. Participante entra por PIN ou QR Code; identifica-se.
3. Sincronização: **polling Express 1,5s** (`SSTContext.tsx:1013-1074`) + **polling Supabase 3s** (`:935-998`) + canal `postgres_changes` opcional (`:876-922`).
4. Instrutor avança pergunta; `question_started_at`/`question_ends_at` (BIGINT, epoch) definem a janela.
5. `submeterRespostaQuizGuiado` pontua no cliente (competitivo: até 1500 pts por velocidade; educacional: 100) e faz upsert da sala inteira (`:4182`).
6. Tela TV/apresentação mostra ranking; ao fim, gera `resultados_avaliacao_sst` (laudo PDF + e-mail).
- **Riscos**: janela de tempo não validada no servidor; respostas podem chegar fora do prazo; gabarito embutido no objeto da sala que o cliente recebe; sala perdida no restart do Express.

### 11.4. Fluxo proposto (seguro, por fases)
1. **Fase 1 (sem quebra)**: persistência real no Supabase, validação de janela de tempo no contexto, correções CSV/schema. 2. **Fase 2 (auth)**: login Supabase Auth, RLS fechada por empresa, pontuação validada no servidor (edge function `pontuar_quiz`), remoção de `senha` do cliente. 3. **Fase 3 (tempo real)**: modo servidor-autoritativo (WebSocket ou polling com assinaturas de payloads assinadas) onde gabarito nunca vai ao cliente.

---

## 12. PLANO DE IMPLEMENTAÇÃO

**Fase 0 — Baseline (1-2 dias)**
- Rodar `npm run lint`, `npm test`, `npm run build`; registrar estado limpo da `main`.
- Commit inicial da auditoria + `supabase/migration_seguranca.sql`.

**Fase 1 — Correções seguras imediatas (2-3 dias)**
- Unificar schema (13 tabelas) e aplicar `migration_seguranca.sql` (seções 2-12).
- Corrigir CSV: sanitização anti-injeção + round-trip de usuários + delimitador global (`csvHelpers.ts`).
- Corrigir `isSecretKey` (`supabase.ts`).
- Remover `DROP TABLE` do `SupabaseModal` e apontar para o SQL não-destrutivo.
- Testes: `tests/csvHelpers.test.ts`, `tests/supabaseConfig.test.ts`.

**Fase 2 — Autenticação e RLS (3-5 dias)**
- Implementar Supabase Auth (e-mail/senha) com modo offline preservado.
- Migrar senhas: `senha_hash` (bcrypt) via edge function; desligar `senha` no cliente.
- View `v_usuarios_sem_senha` e substituição do `select('*')`.
- RLS fechada por empresa (`auth_empresa_id()`) em arquivo de política separado + testes de policies.
- Validar `pontosGanhos` no servidor (edge function) e remover aceitação de `correta`/`pontosGanhos` do cliente.

**Fase 3 — Quiz guiado robusto (3-5 dias)**
- Persistência das salas no Supabase (eliminar dependência do `salasQuizMap`).
- Validação no Express das rotas de sala (janela de tempo, estado, autenticação).
- Modo servidor-autoritativo (WebSocket opcional; mínimo: payloads assinados + gabarito ofuscado).
- Relatório de resultados auditável.

**Fase 4 — Qualidade (2-3 dias)**
- Quebrar `SSTContext.tsx` em módulos com testes unitários.
- Cobertura: pontuação (quiz, desafio, guiado), CSV, RLS, backup/restore.

---

## 13. TESTES

Atuais: `tests/server.test.ts` (2 testes do Express — `/api/health` e static) — passando. **Não há testes de regra de negócio.**

A adicionar (por fase):
- **Fase 1**
  - `csvHelpers`: sanitização de prefixo `=`,`+`,`-`,`@`; export→import de usuários/perguntas/setores idêntico (round-trip); delimitador `;`/`,`.
  - `supabaseConfig`: `isSecretKey` sem falso-positivo.
  - `migration_seguranca.sql` re-executável (sem erros em execução dupla).
- **Fase 2**
  - Autenticação: login correto/errado, troca de usuário no storage **não** concede perfil admin (após auth).
  - RLS: usuário da empresa A não lê dados da empresa B; anon não lista `usuarios`.
  - Pontuação: `pontosGanhos` inválido é rejeitado; `correta` forjada é ignorada.
- **Fase 3**
  - Quiz guiado: resposta fora da janela `question_ends_at` é rejeitada; duplicidade por pergunta; PIN único entre salas ativas.
- **Fase 4**
  - `npm run lint`, `npm test`, `npm run build` verdes após cada fase.

---

## 14. STATUS DA IMPLEMENTAÇÃO (Fases 1 e 2 APROVADAS E CONCLUÍDAS)

> Atualizado em 14/08/2026 após aprovação. `npm run lint`, `npm test` (18 testes) e `npm run build` estão verdes.

### Fase 1 — Correções seguras (concluída)
- `src/utils/csvHelpers.ts`: novas funções `escaparCelulaCSV` (neutraliza injeção de fórmula `=`, `+`, `-`, `@`), `detectarDelimitador` (global) e `splitCSVLine`. Exportações de perguntas/usuários/setores/relatório sanitizadas; round-trip de usuários alinhado ao template (`nome;email;senha;cargo;setor_nome;perfil;is_instrutor`, senha **nunca** exportada); parsers com delimitador único.
- `src/lib/supabase.ts`: `isSecretKey` sem falso-positivo do `includes('secret')` — usa prefixo `sbp_` + papel do JWT (`service_role`/`secret`).
- `src/components/SupabaseModal.tsx`: script copiado pelo botão agora é **não-destrutivo** (sem `DROP TABLE`; usa `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`/`ON CONFLICT DO NOTHING`).
- `supabase/migration_seguranca.sql`: migração completa em 12 etapas, re-executável (13 tabelas, funções `user_empresa_id`/`is_super_admin`/`set_updated_at`, trigger `updated_at`, índices, view `v_usuarios_sem_senha`, RLS habilitada + políticas permissivas, realtime, seed).
- `tsconfig.json`: `exclude` de `supabase/functions` (Deno/edge functions não fazem parte do bundle do app).

### Fase 2 — Supabase Auth + RLS + pontuação server-side (concluída no código)
- `src/services/supabaseAuth.ts` (novo): `signUpWithEmail`, `signInWithEmail`, `signOutSupabase`, `getSupabaseAuthUserId`, `resetPasswordViaEmail`, `vincularAuthUidAoUsuario` (hash Bcrypt via `auth.users`, sem tocar em senha em texto puro).
- `src/context/SSTContext.tsx`:
  - `loginWithCredentials`: tenta `signInWithPassword` primeiro (busca perfil em `v_usuarios_sem_senha` por `auth_uid`, vincula por e-mail se preciso); só cai no fallback legado se o Auth não existir.
  - `registerAccount`: cria também a conta no Supabase Auth e vincula `auth_uid`.
  - `requestPasswordResetCode`: também envia e-mail oficial de redefinição do Supabase Auth.
  - `submeterQuizConcluido`, `submeterRespostaDesafio`, `submeterRespostaQuizGuiado`: agora `async` — quando o Supabase está ativo, a pontuação é **validada/recalculada no servidor** via edge functions (`pontosEfetivos`/`respostasEfetivas`); o cliente **não** decide `correta`/`pontosGanhos`. Fallback local mantido quando offline.
- `src/services/supabaseService.ts`: `fetchAllData` lê `v_usuarios_sem_senha` (sem expor senha); `invokeEdgeFunction` + `pontuarQuiz`/`pontuarDesafio`/`pontuarQuizGuiado`; `limparTodasTabelas`.
- Edge functions (deploy pendente): `supabase/functions/pontuar-quiz/index.ts`, `pontuar-desafio/index.ts`, `pontuar-quiz-guiado/index.ts` (gabarito no banco, janela de tempo com tolerância 1500ms, anti-duplicidade, CORS, auth obrigatória).
- `supabase/migration_politicas_rls_fase2.sql`: troca as políticas permissivas por políticas **fechadas por empresa** (`user_empresa_id()` / `is_super_admin()`).

### Testes (18 verdes)
- `tests/csvHelpers.test.ts`: injeção de fórmula neutralizada, round-trip de perguntas/usuários/setores, delimitador misto/global, senha não exportada.
- `tests/supabaseConfig.test.ts`: `isSecretKey` bloqueia `service_role`/`secret`/`sbp_`, aceita `anon` sem falso-positivo, entradas vazias seguras.

### Próximos passos (fora deste repositório)
1. Aplicar `supabase/migration_seguranca.sql` e `supabase/migration_politicas_rls_fase2.sql` no projeto Supabase (SQL Editor).
2. Deploy das edge functions: `supabase functions deploy pontuar-quiz`, `pontuar-desafio`, `pontuar-quiz-guiado`.
3. Vincular contas existentes: rodar `vincularAuthUidAoUsuario`/`signUp` para cada usuário legado (ou redefinição de senha), para que a RLS por empresa funcione.

---

## 15. AUDITORIA DO QUIZ GUIADO — RESTRIÇÃO DE CRIAÇÃO (Corrigida) + VARREDURA COMPLETA

> Atualizado em 15/08/2026. Foco: a restrição de criação de salas de Quiz Guiado não estava funcionando. Corrigida em 3 camadas (UI + contexto + RLS). `npm run lint`, `npm test` (18) e `npm run build` verdes após as alterações.

### 15.1. Diagnóstico — por que a restrição não funcionava

| Camada | Comportamento anterior | Gravidade |
|---|---|---|
| **UI (botão)** | Botão "Criar Sala" só aparecia para `is_instrutor`/`admin`/`super_admin` (`QuizGuiadoView.tsx:61`) | ✔ correto, porém **apenas visual** |
| **Contexto** | `criarSalaQuizGuiado` (SSTContext.tsx:3722) **não validava permissão** — qualquer usuário podia criar via console/devtools/caminho alternativo | ✖ **bypass total** |
| **RLS INSERT** | Política `"Salas Escrita Instrutor"` permitia `empresa_id = user_empresa_id()` — **QUALQUER usuário autenticado da empresa** podia inserir sala direto no Supabase | ✖ **bypass total** |
| **RLS ownership** | Condição `instrutor_id::text = auth.uid()::text` **nunca casava**: `instrutor_id` guarda o id do app (ex. `usr-admin`), e `auth.uid()` é o UUID do Supabase Auth | ✖ comparação morta |
| **Express** | `POST /api/salas_quiz_guiado` (server.ts:67) é armazenamento cego sem auth | ⚠ documentado (Fase 3) |

**Conclusão:** a restrição dependia apenas do esconder do botão; contexto e banco estavam abertos.

### 15.2. Correções aplicadas

1. **`src/context/SSTContext.tsx`** — guardas de permissão nas 3 funções (lançam `Error` claro, exibido no modal):
   - `criarSalaQuizGuiado` (:3722): exige `is_instrutor === true` **ou** `perfil` `admin`/`super_admin`; mensagem "Acesso negado: somente Instrutores SST, Administradores ou Super Administradores podem criar salas de Quiz Guiado."
   - `editarSalaQuizGuiado` (:3806) e `excluirSalaQuizGuiado` (:3825): mesma regra.
2. **`supabase/migration_politicas_rls_fase2.sql`**:
   - Novo helper `is_instrutor_ou_admin()` (SECURITY DEFINER, `search_path` restrito): `is_instrutor = true OR perfil IN ('admin','super_admin')` via `auth_uid`.
   - `"Salas Escrita Instrutor"` (INSERT): `is_super_admin() OR (is_instrutor_ou_admin() AND empresa_id = user_empresa_id())` — **só instrutor/admin/super da mesma empresa** cria.
   - `"Salas Update Instrutor"`: além do instrutor/admin/super, mantém o fluxo de participação — usuário da mesma empresa ou participante que **já está** no array `participantes` pode atualizar (entrar, responder, pontuar).
   - `"Salas Delete Instrutor"`: só instrutor/admin/super da mesma empresa (ou Super Admin global).
3. **`src/components/SupabaseModal.tsx`** (script SQL da aba RLS): mesmo helper e políticas sincronizadas com a migração.

### 15.3. Varredura completa do Quiz Guiado (tabela de status)

| Funcionalidade | Status | Observação |
|---|---|---|
| Criação via modal (`CriarSalaModal`) | ✔ Funciona | Valida nome, seleção de perguntas (auto/banco/custom), PIN único de 6 dígitos gerado e checado contra salas ativas |
| Permissão de criação (restrição) | ✔ **Corrigida** | 3 camadas: UI + contexto + RLS (seção 15.2) |
| Edição de sala | ✔ Funciona | `editarSalaQuizGuiado` com guarda de permissão |
| Exclusão de sala | ✔ Funciona | `excluirSalaQuizGuiado` com guarda; confirmação na UI |
| Entrada via PIN / QR | ✔ Funciona | `iniciarFluxoIdentificacao`, participante temporário por sessão, `?pin=` na URL |
| Painel Instrutor (mesa de controle) | ✔ Funciona | iniciar/pausar/retomar/encerrar, revelar resposta, ranking, modo TV, reiniciar |
| Painel Participante | ✔ Funciona | tempo por pergunta, envio de resposta, ranking posição, ficha ao encerrar |
| Pontuação server-side | ✔ Funciona | `submeterRespostaQuizGuiado` → edge function `pontuar-quiz-guiado` (gabarito no banco, janela `question_ends_at` + 1500ms, anti-duplicidade); fallback local offline |
| Tempo real (Supabase Realtime) | ✔ Funciona | `salas_quiz_guiado` publicada na `supabase_realtime`; handler `postgres_changes` sincroniza o estado |
| RLS por empresa | ✔ **Corrigida** | INSERT restrito a instrutor/admin/super; SELECT pública (leitura da sala); UPDATE preserva participação |
| Cenários de erro | ✔ Tratados | Sala não encontrada/PIN inválido, sala encerrada, sem permissão (mensagem de acesso negado no modal), offline (fallback local + Express) |
| Express backend | ⚠ Parcial | Persistência cega sem auth (já documentado como Fase 3 opcional na seção 11.4/12) |

### 15.4. Fluxo esperado (passo a passo)

**Criador (Instrutor SST / Admin / Super Admin):**
1. Abre a aba **Quiz Guiado** → o botão "Criar Sala" fica visível (o mesmo gate `is_instrutor` do contexto).
2. No modal, informa nome, modalidade, estilo, tempo, nota mínima e seleciona perguntas (automática, do banco ou próprias).
3. Confirma → `criarSalaQuizGuiado` valida a permissão no **contexto**; gera PIN de 6 dígitos **único** (não colide com salas ativas); cria a sala `aguardando`, grava no estado, no Express local e no Supabase (RLS INSERT autoriza instrutor).
4. Na lista "Minhas Salas Criadas" gerencia: editar, excluir, abrir mesa de controle, compartilhar PIN/QR.

**Participante (qualquer usuário, inclusive visitante):**
1. Digita o PIN ou escaneia o QR (ou `?pin=` na URL).
2. Identifica-se (nome, matrícula/empresa) → entra como participante temporário vinculado à sessão.
3. Acompanha o tempo, responde (validação server-side quando Supabase ativo), vê a posição no ranking.
4. Ao encerrar, obtém a ficha de avaliação SST (PDF).

**Sem permissão (colaborador comum):**
- O botão "Criar Sala" **não** aparece; se tentar forçar a chamada (`console`/devtools/API), o **contexto lança** "Acesso negado..." (exibido no modal) e o **Supabase RLS** rejeita o INSERT — tripla barreira.

### 15.5. Testes e validação
- `npm run lint` → 0 erros. `npm test` → 18 passando. `npm run build` → ok.
- RLS validada estaticamente (políticas coerentes, DROPs presentes para todos os nomes recriados, helpers SECURITY DEFINER).
- Não foram alteradas regras de negócio das demais modalidades (Quiz diário, Desafio 1v1, fichas SST).

### 15.6. Nível de confiança e pendências
- **Confiança da correção da restrição de criação: ALTA** — tripla barreira (UI + contexto + RLS) sem dependência de deploy.
- Pendências de produção (não-bloqueantes, já listadas na seção 14): aplicar as 2 migrações no SQL Editor, fazer deploy das 3 edge functions e vincular `auth_uid` das contas legadas. **Após reaplicar a migração RLS, o `instrutor_id` legado não será usado como critério de propriedade** (o novo helper `is_instrutor_ou_admin()` valida pelo perfil do usuário autenticado via `auth_uid`).

### 15.7. REGRA DE PRIVACIDADE — visibilidade de salas por perfil (Corrigida)

> Requisito do usuário: apenas quem criou a sala e o Super Admin veem a sala criada; **o Admin também pode ver as salas (inclusive de colaboradores)**; **proteção entre empresas — somente o Super Admin vê tudo**.

| Perfil | O que vê na lista de salas | Empresa |
|---|---|---|
| **Super Admin** | **TODAS** as salas (todas as empresas) | ignora a proteção entre empresas |
| **Admin** | **TODAS** as salas da **PRÓPRIA** empresa (inclusive as de colaboradores/instrutores) | só a própria |
| **Instrutor / Colaborador** | **SOMENTE** as salas que **ELE criou** | só a própria |
| **Outros usuários** | Nada (não cria e não vê salas alheias) | — |

| Camada | Comportamento anterior | Comportamento atual |
|---|---|---|
| **Frontend (lista)** | só criador ou super admin | `admin` vê salas da própria empresa; `super_admin` vê tudo; demais só as próprias (`QuizGuiadoView.tsx:181`) |
| **RLS SELECT** | `SELECT USING (true)` (antes) → depois só criador/super/participante | **Super Admin** (tudo), **criador** (`instrutor_id = usuario_id_atual()`), **Admin da própria empresa** (`usuario_atual_perfil()='admin' AND empresa_id = user_empresa_id()`), ou **participante já na sala** (mantém entrada por PIN) |
| **Novo helper** | — | `public.usuario_atual_perfil()` (SECURITY DEFINER): retorna o perfil do usuário autenticado via `auth_uid` |

**Arquivos alterados:** `src/components/views/QuizGuiadoView.tsx` (regra `salasVisiveis` por perfil + proteção entre empresas), `supabase/migration_politicas_rls_fase2.sql` e `src/components/SupabaseModal.tsx` (helper `usuario_atual_perfil()` + política `"Salas Leitura Publica"` — scripts sincronizados).

**Nota sobre o fluxo de participação:** o participante entra por PIN via Express (`/api/salas_quiz_guiado/pin/:pin`, primeiro no `fetchSalaQuizGuiadoByPin`) e, no Supabase, só enxerga a sala **depois** de já estar em `participantes`. Assim o jogo continua funcionando sem expor salas de outros usuários. UPDATE/DELETE continuam restritos a criador/instrutor/admin da própria empresa e Super Admin (fluxo de jogo preservado).

**Validação:** `npm run lint` → 0 erros; `npm test` → 18 passando; `npm run build` → ok (bundle regenerado com a nova regra).

### 15.8. QR CODE — erro "não é possível acessar esse site" no celular (Corrigido)

> Sintoma: ao escanear o QR Code da sala com o celular, o navegador mostra "não é possível acessar esse site".

**Diagnóstico:** o QR Code guardava `window.location.origin` do computador do instrutor — que em dev/uso local é `http://localhost:3000`. Ao escanear no celular, o aparelho tenta abrir o **próprio `localhost` dele** (que não existe) → erro. O servidor já escutava em `0.0.0.0` (acessível na rede), mas o QR apontava para `localhost`.

**Correção aplicada (3 partes):**

| Camada | Arquivo | O que mudou |
|---|---|---|
| **Servidor** | `server.ts` | Nova rota `GET /api/public-base-url` retorna o **IP de rede local** da máquina (ex. `http://192.168.0.10:3000`) via `os.networkInterfaces()`, respeitando a porta real em uso (`activePort`). Permite sobrescrever com `PUBLIC_URL` (para domínio público). |
| **Helper** | `src/lib/publicBaseUrl.ts` | `getPublicBaseUrl()` busca a URL pública do servidor (com cache) e cai para `window.location.origin` se a rota falhar. |
| **QR Code** | `QRCodeSvg.tsx`, `PainelInstrutor.tsx`, `TelaApresentacaoView.tsx` | O QR agora aponta para a **URL pública** (IP da rede) em vez de `localhost`. `QRCodeSvg` recebe só o PIN e monta a URL sozinho; `TelaApresentacaoView` (qrserver.com) usa a base resolvida. |

**Como o participante entra:** o celular abre `http://<IP-do-PC>:<porta>/?pin=XXXXXX`, o `App.tsx` detecta `?pin=` e inicia o fluxo de entrada sem login (modo Kahoot).

**Validação:** `npm run lint` → 0 erros; `npm test` → 18 passando; `npm run build` → ok.

---

*Fim da auditoria. Fases 1 e 2 concluídas; restrição de criação do Quiz Guiado corrigida (UI + contexto + RLS), regra de privacidade "só criador/Super Admin veem a sala (Admin vê a própria empresa)" implementada (UI + RLS), QR Code corrigido para usar o IP da rede (funciona no celular), e varredura completa concluída; aguardando reaplicar as migrações no SQL Editor e o deploy das edge functions.*


