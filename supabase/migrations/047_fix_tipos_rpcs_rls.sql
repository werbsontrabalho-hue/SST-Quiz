-- ============================================================
-- 047_fix_tipos_rpcs_rls.sql
-- ------------------------------------------------------------
-- CORREÇÃO DEFINITIVA do loop PERGUNTA↔GABARITO + erros dos logs:
--
-- 1. question_started_at/question_ends_at estavam como TIMESTAMP no banco.
--    O app envia epoch em MILISSEGUNDOS (BIGINT). Todo write falhava com
--    "date/time field value out of range" → o Supabase NUNCA recebia
--    revelar_resposta_atual/sessao_id atualizados → oscilação.
-- 2. RPC registrar_marco_sala_quiz_guiado não existia (404 nos logs).
-- 3. resultados_avaliacao_sst sem colunas sessao_id/codigo_documento/
--    sessao_codigo (PGRST204 nos logs).
-- 4. RLS bloqueava INSERT de resultados em modo legado/anônimo (42501)
--    e o seed de empresas (403).
-- ============================================================

-- ------------------------------------------------------------
-- 1. TIPOS DAS COLUNAS DE TEMPO → BIGINT (epoch ms)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type INTO v_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='salas_quiz_guiado'
      AND column_name='question_started_at';
  IF v_type IS NULL THEN
    ALTER TABLE public.salas_quiz_guiado ADD COLUMN question_started_at BIGINT;
  ELSIF v_type LIKE 'timestamp%' OR v_type IN ('date','time without time zone','time with time zone') THEN
    EXECUTE 'ALTER TABLE public.salas_quiz_guiado
             ALTER COLUMN question_started_at TYPE BIGINT
             USING COALESCE((EXTRACT(EPOCH FROM question_started_at::timestamptz) * 1000)::BIGINT, 0)';
    RAISE NOTICE 'question_started_at convertido de % para BIGINT', v_type;
  END IF;

  SELECT data_type INTO v_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='salas_quiz_guiado'
      AND column_name='question_ends_at';
  IF v_type IS NULL THEN
    ALTER TABLE public.salas_quiz_guiado ADD COLUMN question_ends_at BIGINT;
  ELSIF v_type LIKE 'timestamp%' OR v_type IN ('date','time without time zone','time with time zone') THEN
    EXECUTE 'ALTER TABLE public.salas_quiz_guiado
             ALTER COLUMN question_ends_at TYPE BIGINT
             USING COALESCE((EXTRACT(EPOCH FROM question_ends_at::timestamptz) * 1000)::BIGINT, 0)';
    RAISE NOTICE 'question_ends_at convertido de % para BIGINT', v_type;
  END IF;
END $$;

-- Garante que as demais colunas de apresentação existem.
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS estado_apresentacao TEXT DEFAULT 'AGUARDANDO';
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS sessao_id TEXT;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS revelar_resposta_atual BOOLEAN DEFAULT false;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS mostrar_ranking BOOLEAN DEFAULT false;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS mostrar_modo_tv BOOLEAN DEFAULT false;

-- ------------------------------------------------------------
-- 2. RPC atualizar_estado_apresentacao_sala (recriada — colunas agora BIGINT)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_estado_apresentacao_sala(
  p_sala_id TEXT,
  p_status TEXT DEFAULT NULL,
  p_estado_apresentacao TEXT DEFAULT NULL,
  p_revelar_resposta_atual BOOLEAN DEFAULT NULL,
  p_mostrar_ranking BOOLEAN DEFAULT NULL,
  p_pergunta_atual_index INT DEFAULT NULL,
  p_question_started_at BIGINT DEFAULT NULL,
  p_question_ends_at BIGINT DEFAULT NULL,
  p_sessao_id TEXT DEFAULT NULL,
  p_mostrar_modo_tv BOOLEAN DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_set_clauses TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_status IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('status = %L', p_status));
  END IF;
  IF p_estado_apresentacao IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('estado_apresentacao = %L', p_estado_apresentacao));
  END IF;
  IF p_revelar_resposta_atual IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('revelar_resposta_atual = %L', p_revelar_resposta_atual));
  END IF;
  IF p_mostrar_ranking IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('mostrar_ranking = %L', p_mostrar_ranking));
  END IF;
  IF p_pergunta_atual_index IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('pergunta_atual_index = %L', p_pergunta_atual_index));
  END IF;
  IF p_question_started_at IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('question_started_at = %L', p_question_started_at::BIGINT));
  END IF;
  IF p_question_ends_at IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('question_ends_at = %L', p_question_ends_at::BIGINT));
  END IF;
  IF p_sessao_id IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('sessao_id = %L', p_sessao_id));
  END IF;
  IF p_mostrar_modo_tv IS NOT NULL THEN
    v_set_clauses := array_append(v_set_clauses, format('mostrar_modo_tv = %L', p_mostrar_modo_tv));
  END IF;

  IF array_length(v_set_clauses, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nenhuma coluna para atualizar.');
  END IF;

  EXECUTE format(
    'UPDATE public.salas_quiz_guiado SET %s WHERE id = %L',
    array_to_string(v_set_clauses, ', '),
    p_sala_id
  );

  RETURN jsonb_build_object('success', true, 'code', 'OK');
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_estado_apresentacao_sala(
  TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, INT, BIGINT, BIGINT, TEXT, BOOLEAN
) TO authenticated, service_role, anon;

-- ------------------------------------------------------------
-- 3. RPC registrar_marco_sala_quiz_guiado (404 nos logs)
-- ------------------------------------------------------------
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS data_inicio TIMESTAMPTZ;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS data_encerramento TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.registrar_marco_sala_quiz_guiado(
  p_sala_id TEXT,
  p_marco TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_marco = 'inicio' THEN
    UPDATE public.salas_quiz_guiado SET data_inicio = NOW() WHERE id = p_sala_id;
  ELSIF p_marco = 'encerramento' THEN
    UPDATE public.salas_quiz_guiado SET data_encerramento = NOW() WHERE id = p_sala_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Marco desconhecido.');
  END IF;
  RETURN jsonb_build_object('success', true, 'code', 'OK');
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_marco_sala_quiz_guiado(TEXT, TEXT)
  TO authenticated, service_role, anon;

-- ------------------------------------------------------------
-- 4. Colunas faltantes em resultados_avaliacao_sst (PGRST204 nos logs)
-- ------------------------------------------------------------
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS sessao_id TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS sessao_codigo TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS codigo_documento TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS empresa_id TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS instrutor_id TEXT;
ALTER TABLE public.resultados_avaliacao_sst ADD COLUMN IF NOT EXISTS sala_pin TEXT;

-- ------------------------------------------------------------
-- 5. RLS resultados_avaliacao_sst: permite modo legado/anônimo (42501)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Resultados Legado Anonimo" ON public.resultados_avaliacao_sst;
CREATE POLICY "Resultados Legado Anonimo" ON public.resultados_avaliacao_sst
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

-- ------------------------------------------------------------
-- 6. RLS empresas: permite o seed inicial em modo legado (403 nos logs)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Empresas Legado Anonimo" ON public.empresas;
CREATE POLICY "Empresas Legado Anonimo" ON public.empresas
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

-- ------------------------------------------------------------
-- 7. Realtime continua publicado para salas (garantia)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'salas_quiz_guiado'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salas_quiz_guiado;
  END IF;
END $$;
