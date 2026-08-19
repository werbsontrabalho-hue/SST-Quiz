-- ============================================================
-- 005_quiz_guiado_respostas.sql — QUIZ GUIADO: RESULTADO IMUTÁVEL
-- ------------------------------------------------------------
-- Fase 6. Dá integridade ao resultado do Quiz Guiado sem quebrar a UI
-- (que continua lendo o JSONB de participantes):
--   1. Tabela quiz_guiado_respostas (append-only / IMUTÁVEL): cada resposta
--      validada é gravada uma única vez (UNIQUE + ON CONFLICT DO NOTHING).
--      Sobrevive a reset de sala e serve como auditoria e re-consenso.
--   2. RPC registrar_resposta_quiz_guiado: recalcula a correção com o
--      gabarito armazenado na sala (defesa em profundidade) e grava de forma
--      imutável.
--   3. Colunas data_inicio / data_encerramento (timestamps server-side) +
--      RPC registrar_marco_sala_quiz_guiado.
--
-- NÃO-DESTRUTIVO. Aplicar após 003_pontos_ledger.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELA IMUTÁVEL DE RESPOSTAS DO QUIZ GUIADO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_guiado_respostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_id TEXT NOT NULL,
  empresa_id TEXT NOT NULL,
  participante_id TEXT NOT NULL,
  participante_nome TEXT,
  pergunta_id TEXT NOT NULL,
  resposta_index INT NOT NULL,
  resposta_correta_index INT,
  correta BOOLEAN NOT NULL,
  tempo_ms INT,
  pontos_adicionais INT NOT NULL DEFAULT 0,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Imutabilidade: a primeira escrita vence (ON CONFLICT DO NOTHING).
  CONSTRAINT uq_quiz_guiado_resposta UNIQUE (sala_id, participante_id, pergunta_id)
);

CREATE INDEX IF NOT EXISTS idx_qgr_sala ON public.quiz_guiado_respostas(sala_id);
CREATE INDEX IF NOT EXISTS idx_qgr_empresa ON public.quiz_guiado_respostas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_qgr_participante ON public.quiz_guiado_respostas(participante_id);

-- RLS: modo legado anônimo (comportamento atual) OU usuário autenticado da
-- mesma empresa da sala.
ALTER TABLE public.quiz_guiado_respostas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "QGR Legado Anonimo" ON public.quiz_guiado_respostas;
CREATE POLICY "QGR Legado Anonimo" ON public.quiz_guiado_respostas
  FOR ALL USING (public.modo_legado_anonimo()) WITH CHECK (public.modo_legado_anonimo());

DROP POLICY IF EXISTS "QGR Leitura Escopo Empresa" ON public.quiz_guiado_respostas;
CREATE POLICY "QGR Leitura Escopo Empresa" ON public.quiz_guiado_respostas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.salas_quiz_guiado s
      WHERE s.id = quiz_guiado_respostas.sala_id
        AND s.empresa_id = public.user_empresa_id()
    )
  );

DROP POLICY IF EXISTS "QGR Insert Escopo Empresa" ON public.quiz_guiado_respostas;
CREATE POLICY "QGR Insert Escopo Empresa" ON public.quiz_guiado_respostas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.salas_quiz_guiado s
      WHERE s.id = quiz_guiado_respostas.sala_id
        AND s.empresa_id = public.user_empresa_id()
    )
  );

-- ------------------------------------------------------------
-- 2. MARCOS DE TEMPO SERVER-SIDE NA SALA
-- ------------------------------------------------------------
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS data_inicio TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS data_encerramento TIMESTAMP WITH TIME ZONE;

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
    UPDATE public.salas_quiz_guiado SET data_inicio = now() WHERE id = p_sala_id AND data_inicio IS NULL;
  ELSIF p_marco = 'encerramento' THEN
    UPDATE public.salas_quiz_guiado SET data_encerramento = now() WHERE id = p_sala_id AND data_encerramento IS NULL;
  ELSE
    RETURN jsonb_build_object('success', false, 'code', 'MARCO_INVALIDO', 'message', 'Marco inválido.');
  END IF;
  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Marco registrado.');
END;
$$;

-- ------------------------------------------------------------
-- 3. RPC registrar_resposta_quiz_guiado (idempotente e imutável)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_resposta_quiz_guiado(
  p_sala_id TEXT,
  p_participante_id TEXT,
  p_participante_nome TEXT DEFAULT NULL,
  p_pergunta_id TEXT DEFAULT NULL,
  p_resposta_index INT DEFAULT NULL,
  p_tempo_ms INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sala public.salas_quiz_guiado%ROWTYPE;
  v_pergunta JSONB;
  v_correta_index INT;
  v_correta BOOLEAN;
  v_pontos INT := 0;
  v_tempo_max_ms INT;
  v_ratio NUMERIC;
BEGIN
  SELECT * INTO v_sala FROM public.salas_quiz_guiado WHERE id = p_sala_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Sala não encontrada.');
  END IF;

  -- Busca a pergunta no array JSONB da sala.
  v_pergunta := (SELECT elem FROM jsonb_array_elements(COALESCE(v_sala.perguntas, '[]'::jsonb)) elem WHERE elem->>'id' = p_pergunta_id LIMIT 1);
  IF v_pergunta IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'PERGUNTA_INVALIDA', 'message', 'Pergunta não pertence à sala.');
  END IF;

  -- Recalcula a correção com o gabarito armazenado (defesa em profundidade).
  v_correta_index := (v_pergunta->>'resposta_correta')::INT;
  v_correta := (p_resposta_index IS NOT NULL AND p_resposta_index = v_correta_index);

  -- Pontuação idêntica à do cliente: competitivo pontua por velocidade.
  IF v_correta THEN
    IF v_sala.estilo = 'competitivo' THEN
      v_tempo_max_ms := COALESCE(v_sala.tempo_por_pergunta_seg, 30) * 1000;
      v_ratio := GREATEST(0, (v_tempo_max_ms - COALESCE(p_tempo_ms, 0))::NUMERIC / NULLIF(v_tempo_max_ms, 0));
      v_pontos := 1000 + ROUND(v_ratio * 500);
    ELSE
      v_pontos := 100;
    END IF;
  END IF;

  -- Gravação IMUTÁVEL: a primeira escrita vence; respostas duplicadas são
  -- ignoradas silenciosamente (não altera o registro original).
  INSERT INTO public.quiz_guiado_respostas
    (sala_id, empresa_id, participante_id, participante_nome, pergunta_id,
     resposta_index, resposta_correta_index, correta, tempo_ms, pontos_adicionais)
  VALUES
    (p_sala_id, v_sala.empresa_id, p_participante_id, p_participante_nome, p_pergunta_id,
     COALESCE(p_resposta_index, -1), v_correta_index, v_correta, p_tempo_ms, v_pontos)
  ON CONFLICT (sala_id, participante_id, pergunta_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'correta', v_correta,
                            'pontosAdicionais', v_pontos, 'registrado', true);
END;
$$;