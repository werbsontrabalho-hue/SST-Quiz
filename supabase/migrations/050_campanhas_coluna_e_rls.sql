-- ============================================================
-- 050_campanhas_coluna_e_rls.sql
-- ------------------------------------------------------------
-- AUDITORIA DE CAMPANHAS (backend):
--
-- 1. Coluna pontos_por_acerto (migration 009) pode faltar em bancos antigos
--    — o frontend envia esse campo e o upsert falharia com PGRST204.
--
-- 2. RLS de campanhas estava "Escopo Empresa" FOR ALL: QUALQUER colaborador
--    da empresa podia INSERIR/ALTERAR/EXCLUIR campanhas. O manual define
--    escrita restrita à gestão. Agora:
--      - LEITURA: todos os membros da empresa (+ super admin)
--      - ESCRITA: super admin, admin da empresa ou instrutor
--        (via public.pode_gerenciar_empresa, migration 006)
--      - Modo legado anônimo permanece permitido (compatibilidade).
-- ============================================================

ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS pontos_por_acerto INT;

-- Remove a política ampla antiga
DROP POLICY IF EXISTS "Campanhas Escopo Empresa" ON public.campanhas;

-- Leitura: membros da empresa ou super admin
DROP POLICY IF EXISTS "Campanhas Leitura Empresa" ON public.campanhas;
CREATE POLICY "Campanhas Leitura Empresa" ON public.campanhas
  FOR SELECT USING (
    public.is_super_admin()
    OR empresa_id = public.user_empresa_id()
  );

-- Escrita: gestão da empresa (admin/instrutor) ou super admin
DROP POLICY IF EXISTS "Campanhas Insert Gestao" ON public.campanhas;
CREATE POLICY "Campanhas Insert Gestao" ON public.campanhas
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR public.pode_gerenciar_empresa(empresa_id)
  );

DROP POLICY IF EXISTS "Campanhas Update Gestao" ON public.campanhas;
CREATE POLICY "Campanhas Update Gestao" ON public.campanhas
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR public.pode_gerenciar_empresa(empresa_id)
  );

DROP POLICY IF EXISTS "Campanhas Delete Gestao" ON public.campanhas;
CREATE POLICY "Campanhas Delete Gestao" ON public.campanhas
  FOR DELETE USING (
    public.modo_legado_anonimo()
    OR public.pode_gerenciar_empresa(empresa_id)
  );
