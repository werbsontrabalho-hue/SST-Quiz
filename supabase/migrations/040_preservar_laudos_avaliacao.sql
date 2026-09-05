-- ============================================================
-- 040_preservar_laudos_avaliacao.sql
-- ------------------------------------------------------------
-- Preserva laudos e PDFs de avaliação de SST permanentemente,
-- mesmo quando a sala de Quiz Guiado associada for excluída.
--
-- 1. Adiciona empresa_id, instrutor_id e sala_pin na tabela
--    resultados_avaliacao_sst para desacoplar a permissão de RLS
--    da existência física da linha em salas_quiz_guiado.
-- 2. Atualiza as políticas de RLS para permitir consulta, atualização
--    e exclusão com base no empresa_id / instrutor_id gravados no laudo.
-- ============================================================

-- 1. Adiciona colunas de identificação e auditoria
ALTER TABLE public.resultados_avaliacao_sst
  ADD COLUMN IF NOT EXISTS empresa_id TEXT REFERENCES public.empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instrutor_id TEXT REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sala_pin TEXT;

-- 2. Preenche retroativamente empresa_id e instrutor_id a partir de salas existentes
UPDATE public.resultados_avaliacao_sst r
SET 
  empresa_id = COALESCE(r.empresa_id, s.empresa_id),
  instrutor_id = COALESCE(r.instrutor_id, s.instrutor_id),
  sala_pin = COALESCE(r.sala_pin, s.pin)
FROM public.salas_quiz_guiado s
WHERE r.sala_id = s.id
  AND (r.empresa_id IS NULL OR r.instrutor_id IS NULL OR r.sala_pin IS NULL);

-- 3. Índices de performance para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_resultados_empresa ON public.resultados_avaliacao_sst(empresa_id);
CREATE INDEX IF NOT EXISTS idx_resultados_instrutor ON public.resultados_avaliacao_sst(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_resultados_participante ON public.resultados_avaliacao_sst(participante_id);

-- 4. Atualização das Políticas RLS
DROP POLICY IF EXISTS "Resultados Leitura Escopo" ON public.resultados_avaliacao_sst;
CREATE POLICY "Resultados Leitura Escopo" ON public.resultados_avaliacao_sst
  FOR SELECT USING (
    public.is_super_admin()
    OR participante_id = public.usuario_id_atual()
    OR (empresa_id IS NOT NULL AND empresa_id = public.user_empresa_id())
    OR (instrutor_id IS NOT NULL AND instrutor_id = public.usuario_id_atual())
    OR EXISTS (
      SELECT 1 FROM public.salas_quiz_guiado s
      WHERE s.id = public.resultados_avaliacao_sst.sala_id
        AND (s.instrutor_id = public.usuario_id_atual() OR s.empresa_id = public.user_empresa_id())
    )
  );

DROP POLICY IF EXISTS "Resultados Update Escopo" ON public.resultados_avaliacao_sst;
CREATE POLICY "Resultados Update Escopo" ON public.resultados_avaliacao_sst
  FOR UPDATE USING (
    public.is_super_admin()
    OR (empresa_id IS NOT NULL AND empresa_id = public.user_empresa_id())
    OR (instrutor_id IS NOT NULL AND instrutor_id = public.usuario_id_atual())
    OR EXISTS (
      SELECT 1 FROM public.salas_quiz_guiado s
      WHERE s.id = public.resultados_avaliacao_sst.sala_id
        AND (s.instrutor_id = public.usuario_id_atual() OR s.empresa_id = public.user_empresa_id())
    )
  );

DROP POLICY IF EXISTS "Resultados Delete Escopo" ON public.resultados_avaliacao_sst;
CREATE POLICY "Resultados Delete Escopo" ON public.resultados_avaliacao_sst
  FOR DELETE USING (
    public.is_super_admin()
    OR (empresa_id IS NOT NULL AND empresa_id = public.user_empresa_id())
    OR (instrutor_id IS NOT NULL AND instrutor_id = public.usuario_id_atual())
    OR EXISTS (
      SELECT 1 FROM public.salas_quiz_guiado s
      WHERE s.id = public.resultados_avaliacao_sst.sala_id
        AND (s.instrutor_id = public.usuario_id_atual() OR s.empresa_id = public.user_empresa_id())
    )
  );
