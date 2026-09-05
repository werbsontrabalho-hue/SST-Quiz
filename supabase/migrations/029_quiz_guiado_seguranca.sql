-- ============================================================
-- 029_quiz_guiado_seguranca.sql — REGRA DE INSTRUTOR + RLS RESTRITA
-- ------------------------------------------------------------
-- Corrige os achados críticos da auditoria do módulo Quiz Guiado/Avaliação:
--
--   1) REGRA DE INSTRUTOR (CRÍTICO): a função is_instrutor_ou_admin()
--      retornava true para perfil IN ('admin','super_admin') mesmo sem a
--      marcação is_instrutor — permitindo que Admin/Super conduzissem Quiz
--      Guiado sem treinamento. Agora exige is_instrutor = true SEMPRE,
--      independente do perfil.
--
--   2) RLS "Salas Update Escopo" (CRÍTICO): permitia UPDATE de QUALQUER sala
--      da empresa a qualquer usuário autenticado (OR empresa_id =
--      user_empresa_id()), permitindo alterar gabarito/pontos/tempo. Restrito
--      a super_admin, instrutor/admin da sala, ou participante (apenas o
--      próprio array de participantes).
--
--   3) RLS "Resultados Insert Escopo" (ALTO): era WITH CHECK (true) —
--      qualquer autenticado gravava resultado arbitrário. Restrito ao próprio
--      participante (participante_id = usuario_id_atual()) OU instrutor/admin
--      da sala.
--
-- NÃO-DESTRUTIVO: reescreve função e policies.
-- ============================================================

-- ------------------------------------------------------------
-- 1. REGRA DE INSTRUTOR: is_instrutor = true OBRIGATÓRIO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_instrutor_ou_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT (is_instrutor = true)
    FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1
  ), false)
$$;

-- Nota: a função agora representa "é instrutor" (a marcação é o que importa).
-- Nenhuma outra policy/helper a usa para autorizar admin sem is_instrutor.

-- ------------------------------------------------------------
-- 2. SALAS: UPDATE restrito (remove o OR empresa_id = user_empresa_id())
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Salas Update Escopo" ON public.salas_quiz_guiado;

CREATE POLICY "Salas Update Escopo" ON public.salas_quiz_guiado
  FOR UPDATE USING (
    public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND instrutor_id = public.usuario_id_atual())
    OR (public.usuario_atual_perfil() = 'admin' AND empresa_id = public.user_empresa_id())
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(participantes) = 'array' THEN participantes ELSE '[]'::jsonb END
      ) AS p
      WHERE p->>'usuario_id' = (SELECT id FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1)
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND instrutor_id = public.usuario_id_atual())
    OR (public.usuario_atual_perfil() = 'admin' AND empresa_id = public.user_empresa_id())
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(participantes) = 'array' THEN participantes ELSE '[]'::jsonb END
      ) AS p
      WHERE p->>'usuario_id' = (SELECT id FROM public.usuarios WHERE auth_uid = auth.uid() LIMIT 1)
    )
  );

-- ------------------------------------------------------------
-- 3. RESULTADOS: INSERT com escopo real (não mais WITH CHECK (true))
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Resultados Insert Escopo" ON public.resultados_avaliacao_sst;

CREATE POLICY "Resultados Insert Escopo" ON public.resultados_avaliacao_sst
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR participante_id = public.usuario_id_atual()
    OR EXISTS (
      SELECT 1 FROM public.salas_quiz_guiado s
      WHERE s.id = public.resultados_avaliacao_sst.sala_id
        AND (s.instrutor_id = public.usuario_id_atual() OR s.empresa_id = public.user_empresa_id())
    )
  );