-- ============================================================
-- SCRIPT DE ATUALIZAÇÃO / MIGRATION SEM PERDA DE DADOS DE SST QUIZ SAAS
-- Executar no SQL Editor do Supabase se o banco já existir.
-- ============================================================

-- 1. GARANTIR COLUNAS EM SALAS_QUIZ_GUIADO
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS estado_apresentacao TEXT DEFAULT 'AGUARDANDO';
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS sessao_id TEXT;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS question_started_at BIGINT;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS question_ends_at BIGINT;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS historico_sessoes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.salas_quiz_guiado ADD COLUMN IF NOT EXISTS posicoes_anteriores JSONB DEFAULT '{}'::jsonb;

-- 2. GARANTIR TABELA DE RESULTADOS DE AVALIAÇÃO SST
CREATE TABLE IF NOT EXISTS public.resultados_avaliacao_sst (
    id TEXT PRIMARY KEY,
    sala_id TEXT REFERENCES public.salas_quiz_guiado(id) ON DELETE SET NULL,
    participante_nome TEXT NOT NULL,
    participante_id TEXT,
    cpf_ou_empresa TEXT,
    is_visitante BOOLEAN DEFAULT false,
    treinamento_titulo TEXT NOT NULL,
    instrutor_nome TEXT NOT NULL,
    data TEXT NOT NULL,
    total_perguntas INT NOT NULL,
    acertos INT NOT NULL,
    erros INT NOT NULL,
    nota_final NUMERIC NOT NULL,
    nota_minima NUMERIC NOT NULL,
    situacao TEXT NOT NULL,
    desempenho_por_tema JSONB DEFAULT '[]'::jsonb,
    respostas_detalhadas JSONB DEFAULT '[]'::jsonb
);

-- 3. GARANTIR RLS E POLÍTICAS
ALTER TABLE public.salas_quiz_guiado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultados_avaliacao_sst ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total salas_quiz_guiado" ON public.salas_quiz_guiado;
DROP POLICY IF EXISTS "Acesso total resultados_avaliacao_sst" ON public.resultados_avaliacao_sst;

CREATE POLICY "Acesso total salas_quiz_guiado" ON public.salas_quiz_guiado FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total resultados_avaliacao_sst" ON public.resultados_avaliacao_sst FOR ALL USING (true) WITH CHECK (true);

-- 4. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_salas_empresa ON public.salas_quiz_guiado(empresa_id);
CREATE INDEX IF NOT EXISTS idx_salas_pin ON public.salas_quiz_guiado(pin);
CREATE INDEX IF NOT EXISTS idx_resultados_sala ON public.resultados_avaliacao_sst(sala_id);

-- 5. PUBLICAR TABELAS NO SUPABASE REALTIME (SEM QUEBRAR SE JÁ EXISTIR)
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
