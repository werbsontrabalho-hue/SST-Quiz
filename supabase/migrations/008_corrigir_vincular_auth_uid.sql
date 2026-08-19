-- ============================================================
-- 008_corrigir_vincular_auth_uid.sql — CORRIGE O VÍNCULO LEGADO → AUTH
-- ------------------------------------------------------------
-- BUG: o RPC vincular_auth_uid (migração 007) faz
--   UPDATE public.usuarios SET auth_uid = v_auth_uid
-- dentro de SECURITY DEFINER. Porém SECURITY DEFINER NÃO contorna
-- gatilhos: o gatilho bloquear_autopromocao (006) dispara e, como no
-- momento do vínculo o auth_uid ainda é NULL, usuario_id_atual()
-- retorna NULL → OLD.id <> NULL → cai no RAISE EXCEPTION final
-- ("Sem permissão para alterar este usuário"). Resultado: o primeiro
-- login legado→Auth (ou a migração em massa) NUNCA consegue vincular.
--
-- CORREÇÃO: bypass controlado por GUC. O RPC vincular_auth_uid passa a
-- setar a configuração local 'app.bypass_auth_uid_link' = 'on' logo antes
-- do UPDATE; o gatilho passa a aceitar a alteração de auth_uid SOMENTE
-- quando esse GUC estiver ligado (e somente nesta linha/sessão). Nenhum
-- outro caminho consegue ligar o GUC, então a proteção anti-autopromoção
-- permanece intacta para o restante das operações.
-- NÃO-DESTRUTIVO: apenas reescreve função + gatilho; não altera dados.
-- ============================================================

-- ------------------------------------------------------------
-- 1. GATILHO: aceita o UPDATE de auth_uid apenas quando o RPC de vínculo
--    oficial (vincular_auth_uid) tiver marcado o GUC de bypass na sessão.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bloquear_autopromocao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Modo legado/anônimo: permite (comportamento atual do app sem Auth).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- BYPASS OFICIAL: somente o RPC vincular_auth_uid liga este GUC para
  -- gravar o auth_uid (uma única coluna, validada no servidor). Impossível
  -- de acionar pelo cliente — não há função pública que set config.
  IF current_setting('app.bypass_auth_uid_link', true) = 'on'
     AND NEW.auth_uid IS NOT NULL
     AND OLD.auth_uid IS DISTINCT FROM NEW.auth_uid
     AND OLD.perfil = NEW.perfil
     AND OLD.is_instrutor = NEW.is_instrutor
     AND OLD.empresa_id = NEW.empresa_id
     AND OLD.setor_id = NEW.setor_id
     AND OLD.ativo = NEW.ativo THEN
    RETURN NEW;
  END IF;

  -- Super admin pode tudo.
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Admin/instrutor da MESMA empresa pode gerenciar colegas, mas não pode
  -- se auto-promover para um perfil superior ao dele.
  IF public.usuario_atual_perfil() = 'admin' AND NEW.empresa_id = public.user_empresa_id() THEN
    IF OLD.id = public.usuario_id_atual() AND NEW.perfil IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Autopromoção de perfil não permitida.';
    END IF;
    RETURN NEW;
  END IF;

  -- Colaborador autenticado alterando a PRÓPRIA linha: não pode tocar em
  -- campos sensíveis (perfil, is_instrutor, auth_uid, empresa, setor, ativo).
  IF OLD.id = public.usuario_id_atual() THEN
    IF NEW.perfil IS DISTINCT FROM OLD.perfil
       OR NEW.is_instrutor IS DISTINCT FROM OLD.is_instrutor
       OR NEW.auth_uid IS DISTINCT FROM OLD.auth_uid
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.setor_id IS DISTINCT FROM OLD.setor_id
       OR NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      RAISE EXCEPTION 'Alteração de campos restritos não permitida.';
    END IF;
    RETURN NEW;
  END IF;

  -- Qualquer outra alteração autenticada sem permissão de admin: bloqueia.
  RAISE EXCEPTION 'Sem permissão para alterar este usuário.';
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_autopromocao ON public.usuarios;
CREATE TRIGGER trg_bloquear_autopromocao
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_autopromocao();

-- ------------------------------------------------------------
-- 2. RPC vincular_auth_uid: liga o GUC de bypass ANTES do UPDATE para que
--    o gatilho aceite exclusivamente a gravação do auth_uid desta sessão.
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

  -- Liga o GUC de bypass (transação local) e grava somente o auth_uid.
  -- Sem isso o gatilho bloquear_autopromocao rejeitaria o UPDATE.
  PERFORM set_config('app.bypass_auth_uid_link', 'on', true);
  UPDATE public.usuarios SET auth_uid = v_auth_uid WHERE id = p_usuario_id;

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'Perfil vinculado à conta autenticada.');
END;
$$;

-- Defesa em profundidade: revoga-se explicitamente o acesso de anon/PUBLIC,
-- concedendo EXECUTE apenas a usuários autenticados (mantém o padrão da 007).
REVOKE ALL ON FUNCTION public.vincular_auth_uid(p_usuario_id TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vincular_auth_uid(p_usuario_id TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.vincular_auth_uid(p_usuario_id TEXT) TO authenticated;