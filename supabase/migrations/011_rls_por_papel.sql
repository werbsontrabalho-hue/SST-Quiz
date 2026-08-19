-- ============================================================
-- 011_rls_por_papel.sql — RESTRINGE ESCRITA POR PAPEL (FASE B, V-008)
-- ------------------------------------------------------------
-- A auditoria forense (AUD-43/44) constatou que as policies "FOR ALL" por
-- empresa deixavam QUALQUER colaborador autenticado editar gabaritos de
-- perguntas, campanhas, prêmios e resgates. Esta migration estreita as
-- políticas por PAPEL mantendo o fluxo do app:
--
--   perguntas / campanhas / premiacoes: escrita só de instrutor/admin/super
--     da própria empresa (colaborador continua lendo);
--   quizzes: escrita do próprio colaborador OU admin da empresa;
--   desafios_1v1: escrita quando o usuário é participante OU admin;
--   resgates_premios: INSERT do próprio usuário; UPDATE (status) só de admin
--     da empresa (impede o colaborador de auto-aprovar o próprio resgate);
--   usuarios UPDATE: restrito à PRÓPRIA linha (auth_uid) OU admin da empresa
--     OU super (fecha a edição de pontos/estatísticas de colegas por um
--     colaborador comum).
--
-- O modo legado anônimo (modo_legado_anonimo()) permanece como fallback
-- para o app offline/LAN SEM Supabase, mas a migration 007 o desativou
-- (retorna false sempre), então ele não abre nenhum acesso.
-- NÃO-DESTRUTIVO: só DROP/CREATE de policies.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PERGUNTAS — escrita só de instrutor/admin/super da empresa
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Perguntas Escopo Empresa" ON public.perguntas;

CREATE POLICY "Perguntas Escrita Papel" ON public.perguntas
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Perguntas Leitura Escopo" ON public.perguntas
  FOR SELECT USING (
    public.modo_legado_anonimo()
    OR empresa_id = public.user_empresa_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Perguntas Update Papel" ON public.perguntas
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Perguntas Delete Papel" ON public.perguntas
  FOR DELETE USING (
    public.modo_legado_anonimo()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

-- ------------------------------------------------------------
-- 2. CAMPANHAS — escrita só de admin/super da empresa
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Campanhas Escopo Empresa" ON public.campanhas;

CREATE POLICY "Campanhas Escrita Papel" ON public.campanhas
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Campanhas Leitura Escopo" ON public.campanhas
  FOR SELECT USING (
    public.modo_legado_anonimo()
    OR empresa_id = public.user_empresa_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Campanhas Update Papel" ON public.campanhas
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Campanhas Delete Papel" ON public.campanhas
  FOR DELETE USING (
    public.modo_legado_anonimo()
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

-- ------------------------------------------------------------
-- 3. QUIZZES — escrita do próprio colaborador OU admin da empresa
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Quizzes Escopo Empresa" ON public.quizzes;

CREATE POLICY "Quizzes Escrita Proprio" ON public.quizzes
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR (colaborador_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Quizzes Leitura Escopo" ON public.quizzes
  FOR SELECT USING (
    public.modo_legado_anonimo()
    OR empresa_id = public.user_empresa_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Quizzes Update Proprio" ON public.quizzes
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR (colaborador_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR (colaborador_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Quizzes Delete Proprio" ON public.quizzes
  FOR DELETE USING (
    public.modo_legado_anonimo()
    OR (colaborador_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

-- ------------------------------------------------------------
-- 4. DESAFIOS 1V1 — escrita quando o usuário é participante OU admin
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Desafios Escopo Empresa" ON public.desafios_1v1;

CREATE POLICY "Desafios Escrita Participante" ON public.desafios_1v1
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR (desafiante_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Desafios Leitura Escopo" ON public.desafios_1v1
  FOR SELECT USING (
    public.modo_legado_anonimo()
    OR empresa_id = public.user_empresa_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Desafios Update Participante" ON public.desafios_1v1
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR (desafiante_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (desafiado_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR (desafiante_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (desafiado_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Desafios Delete Participante" ON public.desafios_1v1
  FOR DELETE USING (
    public.modo_legado_anonimo()
    OR (desafiante_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (desafiado_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

-- ------------------------------------------------------------
-- 5. PREMIAÇÕES — escrita só de admin/super da empresa
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Premiacoes Escopo Empresa" ON public.premiacoes;

CREATE POLICY "Premiacoes Escrita Papel" ON public.premiacoes
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Premiacoes Leitura Escopo" ON public.premiacoes
  FOR SELECT USING (
    public.modo_legado_anonimo()
    OR empresa_id = public.user_empresa_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Premiacoes Update Papel" ON public.premiacoes
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Premiacoes Delete Papel" ON public.premiacoes
  FOR DELETE USING (
    public.modo_legado_anonimo()
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

-- ------------------------------------------------------------
-- 6. RESGATES DE PRÊMIOS — INSERT do próprio usuário; status só de admin
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Resgates Escopo Empresa" ON public.resgates_premios;

CREATE POLICY "Resgates Insert Proprio" ON public.resgates_premios
  FOR INSERT WITH CHECK (
    public.modo_legado_anonimo()
    OR (usuario_id = public.usuario_id_atual() AND empresa_id = public.user_empresa_id())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Resgates Leitura Escopo" ON public.resgates_premios
  FOR SELECT USING (
    public.modo_legado_anonimo()
    OR (usuario_id = public.usuario_id_atual())
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Resgates Update Admin" ON public.resgates_premios
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR (public.usuario_atual_perfil() IN ('admin', 'super_admin') AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );

-- ------------------------------------------------------------
-- 7. USUÁRIOS UPDATE — própria linha OU admin da empresa OU super
--    (fecha a edição de pontos/estatísticas de COLEGAS por um colaborador;
--    o gatilho bloquear_autopromocao já protege a própria linha de
--    perfil/is_instrutor/empresa/setor/auth_uid — AUD-43).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Usuarios Escrita Escopo" ON public.usuarios;

CREATE POLICY "Usuarios Update Proprio" ON public.usuarios
  FOR UPDATE USING (
    public.modo_legado_anonimo()
    OR auth_uid = auth.uid()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  ) WITH CHECK (
    public.modo_legado_anonimo()
    OR auth_uid = auth.uid()
    OR (public.is_instrutor_ou_admin() AND empresa_id = public.user_empresa_id())
    OR public.is_super_admin()
  );