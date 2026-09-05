-- ============================================================
-- 007_desativar_modo_legado.sql — DESATIVA O MODO LEGADO ANÔNIMO
-- ------------------------------------------------------------
-- Fecha o bypass total de isolamento multi-tenant (auditoria V-001/V-003):
--   1) modo_legado_anonimo() passa a retornar false SEMPRE;
--   2) a role "anon" (requests SEM JWT) perde TODO acesso ao schema public;
--   3) cria o RPC vincular_auth_uid para a migração do login legado para o
--      Supabase Auth (liga auth_uid ao perfil validando o e-mail no servidor).
-- NÃO-DESTRUTIVO: não altera dados nem apaga policies.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DESLIGA O MODO LEGADO
-- As policies "Legado Anonimo" (FOR ALL USING (modo_legado_anonimo()))
-- passam a negar tudo: sem sessão autenticada nada é acessível.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.modo_legado_anonimo()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT false
$$;

-- ------------------------------------------------------------
-- 2. REVOGA A ROLE "anon" DO SCHEMA PUBLIC
-- ------------------------------------------------------------
-- Tabelas/views/sequências: a migration_seguranca.sql concedeu
-- "GRANT ALL ... TO anon"; o REVOKE direto à role remove de fato
-- (são grants diretos à role anon).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Funções: por padrão o Postgres concede EXECUTE a PUBLIC (o que inclui a
-- role anon). Para bloquear de verdade, revoga-se de PUBLIC e devolve-se o
-- EXECUTE apenas às roles de negócio: authenticated (usuários com JWT) e
-- service_role (edge functions / backend).
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Objetos criados no FUTURO também não podem voltar a conceder acesso à anon
-- (endurece o padrão de privilégios do schema public).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

-- ------------------------------------------------------------
-- 3. RPC vincular_auth_uid — MIGRAÇÃO LOGIN LEGADO → SUPABASE AUTH
-- Liga o auth.users.id da sessão ao perfil de public.usuarios.
-- SEGURANÇA:
--   - exige sessão autenticada (auth.uid() NÃO nulo);
--   - o e-mail do perfil deve coincidir com o e-mail da conta Auth
--     (impede ligação cruzada a perfis de terceiros);
--   - não sobrescreve um vínculo já existente com outra conta.
-- Contorna o gatilho bloquear_autopromocao (que bloqueia o UPDATE direto do
-- próprio auth_uid) usando SECURITY DEFINER.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vincular_auth_uid(p_usuario_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_uid TEXT := auth.uid()::text;
  v_email TEXT;
  v_user public.usuarios%ROWTYPE;
BEGIN
  -- Requer sessão autenticada (a role anon não deve conseguir ligar perfis).
  IF v_auth_uid IS NULL OR v_auth_uid = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'AUTH_REQUIRED', 'message', 'Sessão não autenticada.');
  END IF;

  -- E-mail da conta Auth da sessão atual.
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Perfil alvo.
  SELECT * INTO v_user FROM public.usuarios WHERE id = p_usuario_id;
  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Perfil não encontrado.');
  END IF;

  -- Perfil já vinculado a outra conta Auth: não sobrescreve.
  IF v_user.auth_uid IS NOT NULL AND v_user.auth_uid <> v_auth_uid THEN
    RETURN jsonb_build_object('success', false, 'code', 'JA_VINCULADO', 'message', 'Este perfil já está vinculado a outra conta.');
  END IF;

  -- O e-mail do perfil precisa coincidir com o e-mail da conta autenticada.
  IF lower(COALESCE(v_user.email, '')) <> lower(COALESCE(v_email, '')) THEN
    RETURN jsonb_build_object('success', false, 'code', 'EMAIL_DIVERGENTE', 'message', 'O e-mail do perfil não corresponde à conta autenticada.');
  END IF;

  UPDATE public.usuarios SET auth_uid = v_auth_uid WHERE id = p_usuario_id;

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Perfil vinculado à conta autenticada.');
END;
$$;

-- Defesa em profundidade: o RPC criado acima é uma função nova (herda EXECUTE
-- para PUBLIC por padrão). Revoga-se explicitamente o acesso de anon/PUBLIC,
-- concedendo EXECUTE apenas a usuários autenticados.
REVOKE ALL ON FUNCTION public.vincular_auth_uid(p_usuario_id TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vincular_auth_uid(p_usuario_id TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.vincular_auth_uid(p_usuario_id TEXT) TO authenticated;