-- ============================================================
-- 001_rls_consolidada.sql — POLÍTICAS RLS CONSOLIDADAS (SST QUIZ SAAS)
-- ------------------------------------------------------------
-- OBJETIVO:
--   1) Resolver o CONFLITO entre migration_atualizacao.sql (que reabria
--      salas_quiz_guiado / resultados_avaliacao_sst com FOR ALL (true))
--      e migration_politicas_rls_fase2.sql (políticas estritas).
--   2) Aplicar isolamento multi-tenant POR EMPRESA SEM QUEBRAR O APP:
--      quando o request NÃO tem usuário autenticado (auth.uid() IS NULL —
--      modo demo / login legado por senha), o comportamento permanece
--      aberto como hoje; quando o usuário ESTÁ autenticado via Supabase
--      Auth, as regras por empresa/role passam a valer de verdade.
--   3) Criar a view pública vw_salas_quiz_guiado_publica SEM gabarito
--      (resposta_correta/explicacao) — fundação da Fase 6 (Quiz Guiado).
--
-- NÃO-DESTRUTIVO: só DROP/CREATE de policies e funções; nada de dados.
-- Aplicar no SQL Editor do Supabase (após migration_seguranca.sql).
-- ============================================================

-- ------------------------------------------------------------
-- 0. HELPERS (idempotentes)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_empresa_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT empresa_id FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT perfil = 'super_admin' FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1), false)
$$;

CREATE OR REPLACE FUNCTION public.is_instrutor_ou_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT (is_instrutor = true OR perfil IN ('admin', 'super_admin'))
    FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.usuario_atual_perfil()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT perfil FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1), '')
$$;

CREATE OR REPLACE FUNCTION public.usuario_id_atual()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1
$$;

-- Guarda de compatibilidade: true quando o request é anônimo (sem Supabase
-- Auth) — preserva o modo demo/login legado sem abrir mão do isolamento
-- para usuários autenticados.
CREATE OR REPLACE FUNCTION public.modo_legado_anonimo()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NULL
$$;

-- ------------------------------------------------------------
-- 1. EMPRESAS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total empresas" ON public.empresas;
DROP POLICY IF EXISTS "Empresa Isola Empresas" ON public.empresas;
DROP POLICY IF EXISTS "Super Admin Gerencia Empresas" ON public.empresas;
DROP POLICY IF EXISTS "Empresas Legado Anonimo" ON public.empresas;
DROP POLICY IF EXISTS "Empresas Leitura Escopo" ON public.empresas;
DROP POLICY IF EXISTS "Empresas Admin Escopo" ON public.empresas;
DROP POLICY IF EXISTS "Empresas Super Admin Escrita" ON public.empresas;
DROP POLICY IF EXISTS "Empresas Super Admin Delete" ON public.empresas;

CREATE POLICY "Empresas Legado Anonimo" ON public.empresas
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Empresas Leitura Escopo" ON public.empresas
  FOR SELECT USING (
    id = public.user_empresa_id() OR public.is_super_admin()
  );

CREATE POLICY "Empresas Admin Escopo" ON public.empresas
  FOR UPDATE USING (
    public.is_super_admin() OR (public.is_instrutor_ou_admin() AND id = public.user_empresa_id())
  ) WITH CHECK (
    public.is_super_admin() OR (public.is_instrutor_ou_admin() AND id = public.user_empresa_id())
  );

CREATE POLICY "Empresas Super Admin Escrita" ON public.empresas
  FOR INSERT WITH CHECK (public.is_super_admin());

CREATE POLICY "Empresas Super Admin Delete" ON public.empresas
  FOR DELETE USING (public.is_super_admin());

-- ------------------------------------------------------------
-- 2. SETORES
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total setores" ON public.setores;
DROP POLICY IF EXISTS "Empresa Isola Setores" ON public.setores;
DROP POLICY IF EXISTS "Setores Legado Anonimo" ON public.setores;
DROP POLICY IF EXISTS "Setores Escopo Empresa" ON public.setores;

CREATE POLICY "Setores Legado Anonimo" ON public.setores
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Setores Escopo Empresa" ON public.setores
  FOR ALL USING (empresa_id = public.user_empresa_id() OR public.is_super_admin())
  WITH CHECK (empresa_id = public.user_empresa_id() OR public.is_super_admin());

-- ------------------------------------------------------------
-- 3. USUÁRIOS
-- INSERT/UPDATE/DELETE preservados nos fluxos do app (upsert, seed,
-- deleteUsuario, Reset de Fábrica) via guarda anônima; com Auth ativo,
-- cada usuário gerencia a própria conta e admin/super gerencia a empresa.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Empresa Isola Usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Empresa Isola Usuarios Leitura" ON public.usuarios;
DROP POLICY IF EXISTS "Empresa Isola Usuarios Escrita" ON public.usuarios;
DROP POLICY IF EXISTS "Usuarios Legado Anonimo" ON public.usuarios;
DROP POLICY IF EXISTS "Usuarios Leitura Escopo" ON public.usuarios;
DROP POLICY IF EXISTS "Usuarios Escrita Escopo" ON public.usuarios;
DROP POLICY IF EXISTS "Usuarios Insert Escopo" ON public.usuarios;
DROP POLICY IF EXISTS "Usuarios Delete Escopo" ON public.usuarios;

CREATE POLICY "Usuarios Legado Anonimo" ON public.usuarios
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Usuarios Leitura Escopo" ON public.usuarios
  FOR SELECT USING (empresa_id = public.user_empresa_id() OR public.is_super_admin());

CREATE POLICY "Usuarios Escrita Escopo" ON public.usuarios
  FOR UPDATE USING (
    auth_uid = auth.uid()
    OR empresa_id = public.user_empresa_id() OR public.is_super_admin()
  ) WITH CHECK (
    auth_uid = auth.uid()
    OR empresa_id = public.user_empresa_id() OR public.is_super_admin()
  );

CREATE POLICY "Usuarios Insert Escopo" ON public.usuarios
  FOR INSERT WITH CHECK (
    auth_uid = auth.uid()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Usuarios Delete Escopo" ON public.usuarios
  FOR DELETE USING (
    (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

-- ------------------------------------------------------------
-- 4. PERGUNTAS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total perguntas" ON public.perguntas;
DROP POLICY IF EXISTS "Empresa Isola Perguntas" ON public.perguntas;
DROP POLICY IF EXISTS "Perguntas Legado Anonimo" ON public.perguntas;
DROP POLICY IF EXISTS "Perguntas Escopo Empresa" ON public.perguntas;

CREATE POLICY "Perguntas Legado Anonimo" ON public.perguntas
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Perguntas Escopo Empresa" ON public.perguntas
  FOR ALL USING (empresa_id = public.user_empresa_id() OR public.is_super_admin())
  WITH CHECK (empresa_id = public.user_empresa_id() OR public.is_super_admin());

-- ------------------------------------------------------------
-- 5. CAMPANHAS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total campanhas" ON public.campanhas;
DROP POLICY IF EXISTS "Empresa Isola Campanhas" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Legado Anonimo" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Escopo Empresa" ON public.campanhas;

CREATE POLICY "Campanhas Legado Anonimo" ON public.campanhas
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Campanhas Escopo Empresa" ON public.campanhas
  FOR ALL USING (empresa_id = public.user_empresa_id() OR public.is_super_admin())
  WITH CHECK (empresa_id = public.user_empresa_id() OR public.is_super_admin());

-- ------------------------------------------------------------
-- 6. QUIZZES (histórico de sessões)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Empresa Isola Quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Quizzes Legado Anonimo" ON public.quizzes;
DROP POLICY IF EXISTS "Quizzes Escopo Empresa" ON public.quizzes;

CREATE POLICY "Quizzes Legado Anonimo" ON public.quizzes
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Quizzes Escopo Empresa" ON public.quizzes
  FOR ALL USING (empresa_id = public.user_empresa_id() OR public.is_super_admin())
  WITH CHECK (empresa_id = public.user_empresa_id() OR public.is_super_admin());

-- ------------------------------------------------------------
-- 7. DESAFIOS 1V1
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total desafios_1v1" ON public.desafios_1v1;
DROP POLICY IF EXISTS "Empresa Isola Desafios" ON public.desafios_1v1;
DROP POLICY IF EXISTS "Desafios Legado Anonimo" ON public.desafios_1v1;
DROP POLICY IF EXISTS "Desafios Escopo Empresa" ON public.desafios_1v1;

CREATE POLICY "Desafios Legado Anonimo" ON public.desafios_1v1
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Desafios Escopo Empresa" ON public.desafios_1v1
  FOR ALL USING (empresa_id = public.user_empresa_id() OR public.is_super_admin())
  WITH CHECK (empresa_id = public.user_empresa_id() OR public.is_super_admin());

-- ------------------------------------------------------------
-- 8. PREMIAÇÕES
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total premiacoes" ON public.premiacoes;
DROP POLICY IF EXISTS "Empresa Isola Premiacoes" ON public.premiacoes;
DROP POLICY IF EXISTS "Premiacoes Legado Anonimo" ON public.premiacoes;
DROP POLICY IF EXISTS "Premiacoes Escopo Empresa" ON public.premiacoes;

CREATE POLICY "Premiacoes Legado Anonimo" ON public.premiacoes
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Premiacoes Escopo Empresa" ON public.premiacoes
  FOR ALL USING (empresa_id = public.user_empresa_id() OR public.is_super_admin())
  WITH CHECK (empresa_id = public.user_empresa_id() OR public.is_super_admin());

-- ------------------------------------------------------------
-- 9. RESGATES DE PRÊMIOS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total resgates_premios" ON public.resgates_premios;
DROP POLICY IF EXISTS "Empresa Isola Resgates" ON public.resgates_premios;
DROP POLICY IF EXISTS "Resgates Legado Anonimo" ON public.resgates_premios;
DROP POLICY IF EXISTS "Resgates Escopo Empresa" ON public.resgates_premios;

CREATE POLICY "Resgates Legado Anonimo" ON public.resgates_premios
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Resgates Escopo Empresa" ON public.resgates_premios
  FOR ALL USING (empresa_id = public.user_empresa_id() OR public.is_super_admin())
  WITH CHECK (empresa_id = public.user_empresa_id() OR public.is_super_admin());

-- ------------------------------------------------------------
-- 10. NOTIFICAÇÕES
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total notificacoes" ON public.notificacoes;
DROP POLICY IF EXISTS "Empresa Isola Notificacoes" ON public.notificacoes;
DROP POLICY IF EXISTS "Usuario Le Notificacoes" ON public.notificacoes;
DROP POLICY IF EXISTS "App Cria Notificacoes" ON public.notificacoes;
DROP POLICY IF EXISTS "Notificacoes Legado Anonimo" ON public.notificacoes;

CREATE POLICY "Notificacoes Legado Anonimo" ON public.notificacoes
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Usuario Le Notificacoes" ON public.notificacoes
  FOR SELECT USING (
    usuario_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_uid = auth.uid()
        AND u.empresa_id = (SELECT u2.empresa_id FROM public.usuarios u2 WHERE u2.id = public.notificacoes.usuario_id)
    )
  );

CREATE POLICY "App Cria Notificacoes" ON public.notificacoes
  FOR INSERT WITH CHECK (true);

-- ------------------------------------------------------------
-- 11. BACKUPS DE HISTÓRICO (só super_admin)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total backups_historico" ON public.backups_historico;
DROP POLICY IF EXISTS "Super Admin Backups" ON public.backups_historico;
DROP POLICY IF EXISTS "Backups Legado Anonimo" ON public.backups_historico;
DROP POLICY IF EXISTS "Backups Super Admin" ON public.backups_historico;

CREATE POLICY "Backups Legado Anonimo" ON public.backups_historico
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Backups Super Admin" ON public.backups_historico
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ------------------------------------------------------------
-- 12. SALAS DE QUIZ GUIADO
-- Resolve o conflito com migration_atualizacao.sql (FOR ALL USING (true)).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total salas_quiz_guiado" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Empresa Isola Salas Quiz Guiado" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Leitura Publica" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Escrita Instrutor" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Update Instrutor" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Delete Instrutor" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Legado Anonimo" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Leitura Escopo" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Insert Instrutor" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Update Escopo" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Salas Delete Instrutor" ON public.salas_quiz_guiado;

CREATE POLICY "Salas Legado Anonimo" ON public.salas_quiz_guiado
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Salas Leitura Escopo" ON public.salas_quiz_guiado
  FOR SELECT USING (
    public.is_super_admin()
    OR (instrutor_id = public.usuario_id_atual())
    OR (public.usuario_atual_perfil() = 'admin' AND empresa_id = public.user_empresa_id())
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(participantes) = 'array' THEN participantes ELSE '[]'::jsonb END
      ) AS p
      WHERE p->>'usuario_id' = public.usuario_id_atual()
    )
  );

CREATE POLICY "Salas Insert Instrutor" ON public.salas_quiz_guiado
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
  );

CREATE POLICY "Salas Update Escopo" ON public.salas_quiz_guiado
  FOR UPDATE USING (
    public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR empresa_id = public.user_empresa_id()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(participantes) = 'array' THEN participantes ELSE '[]'::jsonb END
      ) AS p
      WHERE p->>'usuario_id' = (SELECT id FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1)
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR empresa_id = public.user_empresa_id()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(participantes) = 'array' THEN participantes ELSE '[]'::jsonb END
      ) AS p
      WHERE p->>'usuario_id' = (SELECT id FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "Salas Delete Instrutor" ON public.salas_quiz_guiado
  FOR DELETE USING (
    public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
  );

-- ------------------------------------------------------------
-- 13. RESULTADOS DE AVALIAÇÃO SST
-- SELECT escopado (LGPD): o próprio participante, instrutor da sala,
-- admin da empresa ou super_admin. Modo legado continua aberto.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso total resultados_avaliacao_sst" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Empresa Isola Resultados Avaliacao" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Leitura Publica" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Insert Participante" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Update Instrutor" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Delete Instrutor" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Legado Anonimo" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Leitura Escopo" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Insert Escopo" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Update Escopo" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Delete Escopo" ON public.resultados_avaliacao_sst;

CREATE POLICY "Resultados Legado Anonimo" ON public.resultados_avaliacao_sst
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

CREATE POLICY "Resultados Leitura Escopo" ON public.resultados_avaliacao_sst
  FOR SELECT USING (
    public.is_super_admin()
    OR participante_id = public.usuario_id_atual()
    OR EXISTS (
      SELECT 1 FROM public.salas_quiz_guiado s
      WHERE s.id = public.resultados_avaliacao_sst.sala_id
        AND (s.instrutor_id = public.usuario_id_atual() OR s.empresa_id = public.user_empresa_id())
    )
  );

CREATE POLICY "Resultados Insert Escopo" ON public.resultados_avaliacao_sst
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Resultados Update Escopo" ON public.resultados_avaliacao_sst
  FOR UPDATE USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.salas_quiz_guiado s
      WHERE s.id = public.resultados_avaliacao_sst.sala_id
        AND (s.instrutor_id = public.usuario_id_atual() OR s.empresa_id = public.user_empresa_id())
    )
  );

CREATE POLICY "Resultados Delete Escopo" ON public.resultados_avaliacao_sst
  FOR DELETE USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.salas_quiz_guiado s
      WHERE s.id = public.resultados_avaliacao_sst.sala_id
        AND (s.instrutor_id = public.usuario_id_atual() OR s.empresa_id = public.user_empresa_id())
    )
  );

-- ------------------------------------------------------------
-- 14. VIEW PÚBLICA SEM GABARITO (Fase 6 — Quiz Guiado)
-- Remove resposta_correta/explicacao de cada pergunta para consumo
-- seguro pelo participante (anti-cola). O app deve passar a ler esta
-- view nos fluxos do PARTICIPANTE; o instrutor continua usando a tabela.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sanitizar_perguntas_publicas(perguntas JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p->>'id',
        'categoria', p->>'categoria',
        'tipo', p->>'tipo',
        'dificuldade', p->>'dificuldade',
        'enunciado', p->>'enunciado',
        'alternativas', p->'alternativas',
        'tempo_limite_segundos', p->'tempo_limite_segundos',
        'norma_relacionada', p->'norma_relacionada',
        'ativa', p->'ativa',
        'disponivel_desafios', p->'disponivel_desafios'
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(perguntas) AS p
  WHERE jsonb_typeof(perguntas) = 'array'
$$;

CREATE OR REPLACE VIEW public.vw_salas_quiz_guiado_publica AS
SELECT
  id,
  pin,
  nome,
  treinamento_titulo,
  instrutor_nome,
  empresa_id,
  data_criacao,
  status,
  modalidade,
  estilo,
  nota_minima,
  tempo_por_pergunta_seg,
  public.sanitizar_perguntas_publicas(perguntas) AS perguntas,
  pergunta_atual_index,
  mostrar_ranking,
  permitir_visitantes,
  participantes,
  revelar_resposta_atual,
  mostrar_modo_tv,
  estado_apresentacao,
  sessao_id,
  question_started_at,
  question_ends_at,
  historico_sessoes,
  posicoes_anteriores
FROM public.salas_quiz_guiado;

-- ------------------------------------------------------------
-- 15. ÍNDICES / REALTIME (mantidos, não destrutivos)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_salas_empresa ON public.salas_quiz_guiado(empresa_id);
CREATE INDEX IF NOT EXISTS idx_salas_pin ON public.salas_quiz_guiado(pin);
CREATE INDEX IF NOT EXISTS idx_resultados_sala ON public.resultados_avaliacao_sst(sala_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salas_quiz_guiado;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.resultados_avaliacao_sst;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.desafios_1v1;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;