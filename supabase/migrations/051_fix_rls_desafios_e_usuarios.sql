-- ============================================================
-- 051_fix_rls_desafios_e_usuarios.sql
-- ------------------------------------------------------------
-- CORREÇÃO DE POLÍTICAS RLS E ALINHAMENTO DE SCHEMA (AUDITORIA):
--
-- 1. DESAFIOS 1V1:
--    - Permite que TANTO o desafiante QUANTO o desafiado possam fazer INSERT/UPSERT/UPDATE
--      no desafio do qual fazem parte (evita violação de RLS no upsert do desafiado).
--    - Garante colunas de apoio aposta_pontos, motivo_vitoria, placar_final e decidido_no_desempate.
--
-- 2. USUÁRIOS:
--    - Ajusta helpers (usuario_id_atual, user_empresa_id, etc.) para reconhecer
--      o usuário autenticado tanto via auth_uid quanto via e-mail do token JWT (auth.jwt()->>'email').
--    - Permite que o próprio usuário insira/atualize seu perfil em conformidade com RLS.
-- ============================================================

-- Colunas opcionais em desafios_1v1 para compatibilidade total com o modelo
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS aposta_pontos INT;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS motivo_vitoria TEXT;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS placar_final TEXT;
ALTER TABLE public.desafios_1v1 ADD COLUMN IF NOT EXISTS decidido_no_desempate BOOLEAN DEFAULT FALSE;

-- Helpers aprimorados com fallback de e-mail JWT quando auth_uid ainda não vinculado
CREATE OR REPLACE FUNCTION public.user_empresa_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT empresa_id FROM public.usuarios 
  WHERE (auth_uid IS NOT NULL AND auth_uid = auth.uid()::text)
     OR (lower(email) = lower(COALESCE(auth.jwt()->>'email', '')))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.usuario_id_atual()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.usuarios 
  WHERE (auth_uid IS NOT NULL AND auth_uid = auth.uid()::text)
     OR (lower(email) = lower(COALESCE(auth.jwt()->>'email', '')))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT perfil = 'super_admin' FROM public.usuarios 
    WHERE (auth_uid IS NOT NULL AND auth_uid = auth.uid()::text)
       OR (lower(email) = lower(COALESCE(auth.jwt()->>'email', '')))
    LIMIT 1
  ), false)
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
    FROM public.usuarios 
    WHERE (auth_uid IS NOT NULL AND auth_uid = auth.uid()::text)
       OR (lower(email) = lower(COALESCE(auth.jwt()->>'email', '')))
    LIMIT 1
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.usuario_atual_perfil()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT perfil FROM public.usuarios 
    WHERE (auth_uid IS NOT NULL AND auth_uid = auth.uid()::text)
       OR (lower(email) = lower(COALESCE(auth.jwt()->>'email', '')))
    LIMIT 1
  ), '')
$$;

-- RLS: DESAFIOS 1V1
DROP POLICY IF EXISTS "Desafios Escrita Participante" ON public.desafios_1v1;
CREATE POLICY "Desafios Escrita Participante" ON public.desafios_1v1
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR (desafiante_id = public.usuario_id_atual() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
    OR (desafiado_id = public.usuario_id_atual() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Desafios Update Participante" ON public.desafios_1v1;
CREATE POLICY "Desafios Update Participante" ON public.desafios_1v1
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR (desafiante_id = public.usuario_id_atual())
    OR (desafiado_id = public.usuario_id_atual())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR (desafiante_id = public.usuario_id_atual())
    OR (desafiado_id = public.usuario_id_atual())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

-- RLS: EMPRESAS (Garante inserção durante bootstrap / admin / super_admin)
DROP POLICY IF EXISTS "Empresas Super Admin Escrita" ON public.empresas;
DROP POLICY IF EXISTS "Empresas Escrita Bootstrap" ON public.empresas;
CREATE POLICY "Empresas Escrita Bootstrap" ON public.empresas
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR public.is_super_admin()
    OR (NOT EXISTS (SELECT 1 FROM public.empresas LIMIT 1))
  );

-- RLS: USUARIOS
DROP POLICY IF EXISTS "Usuarios Insert Escopo" ON public.usuarios;
CREATE POLICY "Usuarios Insert Escopo" ON public.usuarios
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR auth_uid = auth.uid()::text
    OR (lower(email) = lower(COALESCE(auth.jwt()->>'email', '')))
    OR (public.is_instrutor_ou_admin() AND (empresa_id = public.user_empresa_id() OR public.user_empresa_id() IS NULL))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Usuarios Update Proprio" ON public.usuarios;
CREATE POLICY "Usuarios Update Proprio" ON public.usuarios
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR auth_uid = auth.uid()::text
    OR (lower(email) = lower(COALESCE(auth.jwt()->>'email', '')))
    OR id = public.usuario_id_atual()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR auth_uid = auth.uid()::text
    OR (lower(email) = lower(COALESCE(auth.jwt()->>'email', '')))
    OR id = public.usuario_id_atual()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );
