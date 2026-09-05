-- ============================================================
-- 053_fix_rls_campanhas_e_tabelas.sql
-- ------------------------------------------------------------
-- CORREÇÃO DE POLÍTICAS RLS PARA CAMPANHAS E PERGUNTAS:
--
-- 1. CAMPANHAS:
--    - Permite SELECT em modo anônimo / legado (necessário para UPSERT / ON CONFLICT)
--    - Permite INSERT / UPDATE / DELETE para gestores (instrutor/admin da empresa ou super_admin)
--      e em modo legado.
--
-- 2. PERGUNTAS E PREMIAÇÕES:
--    - Harmoniza com a função STABLE SECURITY DEFINER is_instrutor_ou_admin() da migration 051.
-- ============================================================

-- 1. CAMPANHAS
DROP POLICY IF EXISTS "Campanhas Escopo Empresa" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Escrita Papel" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Leitura Escopo" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Update Papel" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Delete Papel" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Leitura Empresa" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Insert Gestao" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Update Gestao" ON public.campanhas;
DROP POLICY IF EXISTS "Campanhas Delete Gestao" ON public.campanhas;

-- Leitura: membros da empresa, super admin ou modo legado
CREATE POLICY "Campanhas Leitura Empresa" ON public.campanhas
  FOR SELECT USING (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR empresa_id = public.user_empresa_id()
    OR public.user_empresa_id() IS NULL
  );

-- Inserção: gestão da empresa (admin/instrutor), super admin ou modo legado
CREATE POLICY "Campanhas Insert Gestao" ON public.campanhas
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  );

-- Atualização: gestão da empresa, super admin ou modo legado
CREATE POLICY "Campanhas Update Gestao" ON public.campanhas
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  );

-- Exclusão: gestão da empresa, super admin ou modo legado
CREATE POLICY "Campanhas Delete Gestao" ON public.campanhas
  FOR DELETE USING (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  );

-- 2. PERGUNTAS
DROP POLICY IF EXISTS "Perguntas Escrita Papel" ON public.perguntas;
DROP POLICY IF EXISTS "Perguntas Update Papel" ON public.perguntas;
DROP POLICY IF EXISTS "Perguntas Delete Papel" ON public.perguntas;
DROP POLICY IF EXISTS "Perguntas Leitura Escopo" ON public.perguntas;

CREATE POLICY "Perguntas Leitura Escopo" ON public.perguntas
  FOR SELECT USING (
    public.modo_legado_anonimo()
    OR empresa_id = public.user_empresa_id()
    OR public.is_super_admin()
    OR public.user_empresa_id() IS NULL
  );

CREATE POLICY "Perguntas Escrita Papel" ON public.perguntas
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  );

CREATE POLICY "Perguntas Update Papel" ON public.perguntas
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  );

CREATE POLICY "Perguntas Delete Papel" ON public.perguntas
  FOR DELETE USING (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  );

-- 3. PREMIAÇÕES
DROP POLICY IF EXISTS "Premiacoes Escrita Papel" ON public.premiacoes;
DROP POLICY IF EXISTS "Premiacoes Update Papel" ON public.premiacoes;
DROP POLICY IF EXISTS "Premiacoes Delete Papel" ON public.premiacoes;
DROP POLICY IF EXISTS "Premiacoes Leitura Escopo" ON public.premiacoes;

CREATE POLICY "Premiacoes Leitura Escopo" ON public.premiacoes
  FOR SELECT USING (
    public.modo_legado_anonimo()
    OR empresa_id = public.user_empresa_id()
    OR public.is_super_admin()
    OR public.user_empresa_id() IS NULL
  );

CREATE POLICY "Premiacoes Escrita Papel" ON public.premiacoes
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  );

CREATE POLICY "Premiacoes Update Papel" ON public.premiacoes
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  );

CREATE POLICY "Premiacoes Delete Papel" ON public.premiacoes
  FOR DELETE USING (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
  );
