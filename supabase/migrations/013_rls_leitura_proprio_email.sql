-- ============================================================
-- 013_rls_leitura_proprio_email.sql — DESBLOQUEIA O VÍNCULO LEGADO→AUTH
-- ------------------------------------------------------------
-- AUDITORIA (AUD-47/F1): um usuário que JÁ logou no Supabase Auth mas cujo
-- perfil ainda NÃO tem auth_uid vinculado não conseguia LER o próprio perfil
-- por e-mail, porque a policy "Usuarios Leitura Escopo" exige
-- empresa_id = user_empresa_id() — e user_empresa_id() retorna NULL enquanto
-- auth_uid está vazio. Sem ler o perfil, o RPC vincular_auth_uid (007/008)
-- nunca era alcançado e o vínculo legado→Auth ficava travado.
--
-- CORREÇÃO: nova policy de SELECT que permite ao usuário autenticado ler o
-- próprio perfil pelo e-mail presente no JWT (auth.jwt()->>'email'). O e-mail
-- do JWT é emitido e validado pelo Supabase Auth, então só a PRÓPRIA conta
-- consegue ler a própria linha — não abre leitura de outras pessoas.
-- NÃO-DESTRUTIVO: apenas adiciona uma policy.
-- ============================================================

CREATE POLICY "Usuarios Leitura Proprio Email" ON public.usuarios
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND lower(COALESCE(email, '')) = lower(COALESCE(auth.jwt()->>'email', ''))
  );