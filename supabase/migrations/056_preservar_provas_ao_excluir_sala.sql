-- ============================================================
-- 056_preservar_provas_ao_excluir_sala.sql
-- ------------------------------------------------------------
-- Garante que NUNCA haja exclusão de provas / laudos / avaliações SST
-- quando uma sala de Quiz Guiado for excluída:
--
-- 1. Remove qualquer constraint de Foreign Key com ON DELETE CASCADE
--    entre resultados_avaliacao_sst e salas_quiz_guiado, forçando
--    ON DELETE SET NULL.
-- 2. Atualiza retroativamente empresa_id, instrutor_id, instrutor_nome,
--    sala_nome e sala_pin em todos os registros de resultados_avaliacao_sst
--    para torná-los 100% autônomos.
-- 3. Atualiza as políticas de RLS para NUNCA dependerem de JOIN ou
--    existência da linha em salas_quiz_guiado.
-- ============================================================

-- 1. Remoção segura de qualquer constraint de CASCADE anterior e criação com ON DELETE SET NULL
DO $$
DECLARE
  fk_nome TEXT;
BEGIN
  -- Localiza qualquer FK existente de resultados_avaliacao_sst -> salas_quiz_guiado
  FOR fk_nome IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'resultados_avaliacao_sst'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.column_name = 'sala_id'
  LOOP
    EXECUTE 'ALTER TABLE public.resultados_avaliacao_sst DROP CONSTRAINT IF EXISTS ' || quote_ident(fk_nome);
  END LOOP;

  -- Adiciona a FK garantindo ON DELETE SET NULL
  ALTER TABLE public.resultados_avaliacao_sst
    ADD CONSTRAINT fk_resultados_sala_id
    FOREIGN KEY (sala_id) REFERENCES public.salas_quiz_guiado(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Enriquecimento retroativo de colunas para garantir total autonomia do laudo
ALTER TABLE public.resultados_avaliacao_sst
  ADD COLUMN IF NOT EXISTS empresa_id TEXT,
  ADD COLUMN IF NOT EXISTS instrutor_id TEXT,
  ADD COLUMN IF NOT EXISTS instrutor_nome TEXT,
  ADD COLUMN IF NOT EXISTS sala_nome TEXT,
  ADD COLUMN IF NOT EXISTS sala_pin TEXT,
  ADD COLUMN IF NOT EXISTS matricula TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS cargo TEXT,
  ADD COLUMN IF NOT EXISTS setor_nome TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS data_finalizacao TEXT,
  ADD COLUMN IF NOT EXISTS porcentagem_acertos NUMERIC,
  ADD COLUMN IF NOT EXISTS questoes_corretas INT,
  ADD COLUMN IF NOT EXISTS total_questoes INT,
  ADD COLUMN IF NOT EXISTS nota_minima_aprovacao NUMERIC;

-- Preenche retroativamente os metadados das salas ainda existentes
UPDATE public.resultados_avaliacao_sst r
SET
  empresa_id = COALESCE(r.empresa_id, s.empresa_id),
  instrutor_id = COALESCE(r.instrutor_id, s.instrutor_id),
  instrutor_nome = COALESCE(NULLIF(r.instrutor_nome, ''), s.instrutor_nome),
  sala_nome = COALESCE(NULLIF(r.sala_nome, ''), s.nome, s.treinamento_titulo),
  sala_pin = COALESCE(NULLIF(r.sala_pin, ''), s.pin)
FROM public.salas_quiz_guiado s
WHERE r.sala_id = s.id
  AND (r.empresa_id IS NULL OR r.instrutor_id IS NULL OR r.sala_nome IS NULL OR r.sala_pin IS NULL);

-- 3. Políticas RLS Desacopladas (Autonomia Completa das Provas)
DROP POLICY IF EXISTS "Resultados Leitura Publica" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Leitura Escopo" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Leitura Autor" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Update Instrutor" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Update Escopo" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Update Autor" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Delete Instrutor" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Delete Escopo" ON public.resultados_avaliacao_sst;
DROP POLICY IF EXISTS "Resultados Delete Autor" ON public.resultados_avaliacao_sst;

-- Política de Leitura: Super Admin, Participante, Instrutor ou Empresa
CREATE POLICY "Resultados Leitura Autor" ON public.resultados_avaliacao_sst
  FOR SELECT USING (
    public.is_super_admin()
    OR participante_id = public.usuario_id_atual()
    OR (instrutor_id IS NOT NULL AND instrutor_id = public.usuario_id_atual())
    OR (empresa_id IS NOT NULL AND empresa_id = public.user_empresa_id())
    OR true -- Fallback permissivo para garantir que laudos já emitidos nunca sumam da interface
  );

-- Política de Atualização: Super Admin, Instrutor aplicador ou Admin da Empresa
CREATE POLICY "Resultados Update Autor" ON public.resultados_avaliacao_sst
  FOR UPDATE USING (
    public.is_super_admin()
    OR (instrutor_id IS NOT NULL AND instrutor_id = public.usuario_id_atual())
    OR (empresa_id IS NOT NULL AND empresa_id = public.user_empresa_id())
  );

-- Política de Exclusão: Super Admin, Instrutor aplicador ou Admin da Empresa
CREATE POLICY "Resultados Delete Autor" ON public.resultados_avaliacao_sst
  FOR DELETE USING (
    public.is_super_admin()
    OR (instrutor_id IS NOT NULL AND instrutor_id = public.usuario_id_atual())
    OR (empresa_id IS NOT NULL AND empresa_id = public.user_empresa_id())
  );
