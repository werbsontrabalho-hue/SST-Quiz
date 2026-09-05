-- ============================================================
-- 048_vincula_auth_uid_rls_resultados.sql
-- ------------------------------------------------------------
-- CORREÇÃO do 42501 em resultados_avaliacao_sst (e 403 em empresas):
--
-- CAUSA RAIZ: o app usa Supabase Auth (signInWithPassword), então
-- modo_legado_anonimo() = FALSE e valem as políticas de ESCOPO, que
-- dependem do mapeamento usuarios.auth_uid = auth.uid().
-- Usuários criados ANTES da coluna auth_uid existir ficaram SEM vínculo
-- → usuario_id_atual()/user_empresa_id()/is_super_admin() retornam
-- NULL/false → todo UPDATE/upsert falha com RLS 42501.
--
-- Detalhe: .upsert() num laudo JÁ EXISTENTE segue o caminho UPDATE do
-- INSERT ... ON CONFLICT — por isso o erro aparece mesmo com
-- "Resultados Insert Escopo" WITH CHECK (true).
-- ============================================================

-- 1. VINCULA auth_uid dos usuários existentes pelo E-MAIL (idempotente)
UPDATE public.usuarios u
SET auth_uid = au.id
FROM auth.users au
WHERE lower(au.email) = lower(u.email)
  AND (u.auth_uid IS NULL OR u.auth_uid <> au.id);

-- 2. Políticas de AUTORIA DIRETA para resultados (usam as colunas
--    empresa_id/instrutor_id gravadas em cada laudo — sem depender de JOIN
--    com salas, que falha quando a sala já foi removida).
DROP POLICY IF EXISTS "Resultados Update Autor" ON public.resultados_avaliacao_sst;
CREATE POLICY "Resultados Update Autor" ON public.resultados_avaliacao_sst
  FOR UPDATE USING (
    public.is_super_admin()
    OR instrutor_id = public.usuario_id_atual()
    OR empresa_id = public.user_empresa_id()
    OR participante_id = public.usuario_id_atual()
  );

DROP POLICY IF EXISTS "Resultados Delete Autor" ON public.resultados_avaliacao_sst;
CREATE POLICY "Resultados Delete Autor" ON public.resultados_avaliacao_sst
  FOR DELETE USING (
    public.is_super_admin()
    OR instrutor_id = public.usuario_id_atual()
    OR empresa_id = public.user_empresa_id()
  );

-- 3. Diagnóstico opcional (rode à parte se quiser conferir):
--    SELECT nome, email, auth_uid FROM public.usuarios;
--    Todos devem ter auth_uid preenchido após esta migration.
